import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  PermissionMode,
  PermissionResult,
  Query,
  SandboxSettings,
  SDKMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { GitService } from '../git/gitService.js';
import type { TaskStore } from '../db/taskStore.js';
import type { EventLog, StoredEvent } from '../db/eventLog.js';
import type { Db } from '../db/db.js';
import { PermissionBroker, type Decision, type PendingPermission } from './permissionBroker.js';
import { evaluatePermission } from './permissionRules.js';
import { defaultSandbox } from './sandbox.js';
import { safeResolveWithin } from '../fs/pathSafety.js';

/** Thrown when a task is requested while the project's checkout is already busy with one. */
export class ProjectBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectBusyError';
  }
}

/** Tools that write a file, and the input field holding the path to contain to the project dir. */
const EDIT_PATH_FIELDS: Record<string, string> = {
  Edit: 'file_path',
  Write: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

/** Minimal structured logger; a pino logger (fastify's `app.log`) satisfies it. */
export interface RunnerLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

function serializeError(err: unknown): Record<string, unknown> {
  return err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : { value: String(err) };
}

/** Fallback logger when none is injected: one JSON line per event. */
function fmtLog(level: string, obj: unknown, msg?: string): string {
  const fields = typeof obj === 'object' && obj !== null ? obj : { value: obj };
  return JSON.stringify({ level, time: Date.now(), mod: 'agent', msg, ...fields });
}

const defaultLogger: RunnerLogger = {
  info: (obj, msg) => console.log(fmtLog('info', obj, msg)),
  warn: (obj, msg) => console.warn(fmtLog('warn', obj, msg)),
  error: (obj, msg) => console.error(fmtLog('error', obj, msg)),
};

/** The slice of the SDK `query()` the runner uses — injectable for testing. */
export type QueryFn = (params: { prompt: string; options?: Options }) => Query;

export interface AgentRunnerDeps {
  registry: ProjectRegistry;
  git: GitService;
  tasks: TaskStore;
  events: EventLog;
  db: Db;
  /** Defaults to the real SDK `query()`. Tests pass a fake generator. */
  query?: QueryFn;
  /** Permission mode for runs. Never `bypassPermissions` (CLAUDE.md). */
  defaultPermissionMode?: PermissionMode;
  /** Command-execution sandbox. Omit for the default (on); `false` disables it. */
  sandbox?: SandboxSettings | false;
  /** Deny a parked permission after this long (ms). Omit for the default (2h). */
  approvalTimeoutMs?: number;
  /** Structured logger (e.g. fastify's `app.log`). Defaults to JSON-to-console. */
  logger?: RunnerLogger;
}

export interface StartTaskInput {
  projectId: string;
  prompt: string;
  taskId?: string;
  model?: string;
}

export interface StartedTask {
  taskId: string;
  branch: string;
  worktree: string;
}

function genTaskId(): string {
  return 't' + randomBytes(8).toString('hex');
}

/** Map an SDK message to a stable event type (includes subtype for system/result). */
function eventType(msg: SDKMessage): string {
  const sub = (msg as { subtype?: string }).subtype;
  if (msg.type === 'system' || msg.type === 'result') {
    return `agent.${msg.type}${sub ? `.${sub}` : ''}`;
  }
  return `agent.${msg.type}`;
}

/**
 * Runs a Claude Code task (S1-05): creates a `claude/<slug>` branch in the project checkout,
 * runs the Agent SDK `query()` with `cwd` set to that checkout, and writes every message to the event log with a
 * `seq` (event-log-first). On completion it stores the session id and cost on the task,
 * so a run can later be resumed (S4-02) and its cost shown in the app.
 */
export class AgentRunner {
  private readonly registry: ProjectRegistry;
  private readonly git: GitService;
  private readonly tasks: TaskStore;
  private readonly events: EventLog;
  private readonly query: QueryFn;
  private readonly defaultPermissionMode: PermissionMode;
  private readonly sandbox: SandboxSettings | undefined;
  private log: RunnerLogger;

  private readonly emitter = new EventEmitter();
  private readonly running = new Map<string, { query: Query; abort: AbortController }>();
  private readonly settled = new Map<string, Promise<void>>();
  private readonly broker: PermissionBroker;
  /** Projects with a task currently owning the checkout (running or waiting). One at a time. */
  private readonly activeProjects = new Set<string>();

  constructor(deps: AgentRunnerDeps) {
    this.registry = deps.registry;
    this.git = deps.git;
    this.tasks = deps.tasks;
    this.events = deps.events;
    this.query = deps.query ?? ((p) => sdkQuery(p));
    this.defaultPermissionMode = deps.defaultPermissionMode ?? 'acceptEdits';
    if (this.defaultPermissionMode === 'bypassPermissions') {
      throw new Error('bypassPermissions is not allowed');
    }
    this.broker = new PermissionBroker(
      deps.db,
      (t, ty, p) => this.persist(t, ty, p),
      deps.tasks,
      deps.approvalTimeoutMs,
    );
    this.sandbox = deps.sandbox === false ? undefined : (deps.sandbox ?? defaultSandbox());
    this.log = deps.logger ?? defaultLogger;
  }

  /** Swap in a real logger after construction (index.ts passes fastify's app.log). */
  setLogger(logger: RunnerLogger): void {
    this.log = logger;
  }

  /** Resolve a pending tool permission from the phone (S2-01). */
  decidePermission(taskId: string, toolUseId: string, decision: Decision): boolean {
    return this.broker.decide(taskId, toolUseId, decision);
  }

  /** Permissions still waiting on a decision for a task. */
  listPendingPermissions(taskId: string): PendingPermission[] {
    return this.broker.listPending(taskId);
  }

  /** Subscribe to persisted events (used by the WebSocket layer, S1-06). */
  onEvent(listener: (e: StoredEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  /** Resolves when the task's run loop has fully settled (for tests/shutdown). */
  whenSettled(taskId: string): Promise<void> {
    return this.settled.get(taskId) ?? Promise.resolve();
  }

  private persist(taskId: string, type: string, payload: unknown): void {
    const stored = this.events.append(taskId, type, payload);
    this.emitter.emit('event', stored);
  }

  private fail(taskId: string, stage: string, err: unknown): void {
    this.log.error({ taskId, stage, err: serializeError(err) }, 'task failed');
    this.tasks.setStatus(taskId, 'failed');
    this.persist(taskId, 'task.error', { stage, message: err instanceof Error ? err.message : String(err) });
  }

  /**
   * Start a task in the project checkout on a fresh `claude/<slug>` branch, and begin the run.
   * Only one task may own a project's checkout at a time (we no longer isolate via worktrees), so
   * a second start while one is active throws ProjectBusyError. Returns once the branch exists;
   * the agent loop continues in the background (awaitable via whenSettled).
   */
  async start(input: StartTaskInput): Promise<StartedTask> {
    const project = this.registry.getActive(input.projectId);
    if (!project || !project.resolvedPath) {
      throw new Error(`project not active: "${input.projectId}"`);
    }
    const manifest = project.manifest;

    // Single-owner gate: only one task may hold a project's checkout (running or waiting).
    if (this.activeProjects.has(manifest.id)) {
      throw new ProjectBusyError(
        `project "${manifest.id}" already has an active task; finish or discard it first`,
      );
    }
    this.activeProjects.add(manifest.id);

    const taskId = input.taskId ?? genTaskId();
    // Create the task row first so events have a valid foreign key.
    this.tasks.create({ id: taskId, projectId: manifest.id, branch: '', worktree: '', status: 'queued' });
    this.persist(taskId, 'task.created', { projectId: manifest.id, prompt: input.prompt });

    let worktree;
    try {
      worktree = await this.git.createTaskBranch(project.resolvedPath, {
        taskId,
        baseRef: manifest.git.base,
        name: input.prompt,
      });
    } catch (err) {
      this.activeProjects.delete(manifest.id);
      this.fail(taskId, 'branch', err);
      throw err;
    }

    this.tasks.setWorktree(taskId, worktree.branch, worktree.path);
    this.tasks.setStatus(taskId, 'running');
    this.persist(taskId, 'task.started', {
      branch: worktree.branch,
      worktree: worktree.path,
      baseRef: worktree.baseRef,
    });
    this.log.info(
      { taskId, projectId: manifest.id, branch: worktree.branch, model: input.model ?? null },
      'task started',
    );

    const run = this.runAgent(taskId, worktree.path, input).finally(() => {
      this.running.delete(taskId);
      this.broker.clearTask(taskId);
      this.activeProjects.delete(manifest.id);
    });
    this.settled.set(taskId, run);
    run.catch(() => {
      /* failures are recorded as events; never crash the daemon */
    });

    return { taskId, branch: worktree.branch, worktree: worktree.path };
  }

  private async runAgent(taskId: string, cwd: string, input: StartTaskInput): Promise<void> {
    const abort = new AbortController();
    const options: Options = {
      cwd,
      abortController: abort,
      permissionMode: this.defaultPermissionMode,
      // Permission rules (S2-02) run first: dangerous tools are denied and never run,
      // safe ones are auto-allowed; everything else parks for the phone (S2-01).
      canUseTool: (toolName, toolInput, opts): Promise<PermissionResult> => {
        // Edit containment: tasks run in the real project checkout now (no worktree sandbox),
        // so refuse any write whose target path escapes the project dir (cwd).
        const pathField = EDIT_PATH_FIELDS[toolName];
        if (pathField !== undefined) {
          const target = toolInput[pathField];
          if (typeof target === 'string') {
            try {
              safeResolveWithin(cwd, target);
            } catch {
              const reason = `edit path is outside the project directory: "${target}"`;
              this.persist(taskId, 'agent.permission_auto_denied', {
                toolUseId: opts.toolUseID,
                toolName,
                reason,
              });
              return Promise.resolve({ behavior: 'deny', message: reason });
            }
          }
        }
        const rule = evaluatePermission(toolName, toolInput);
        if (rule.decision === 'deny') {
          this.persist(taskId, 'agent.permission_auto_denied', {
            toolUseId: opts.toolUseID,
            toolName,
            reason: rule.reason,
          });
          return Promise.resolve({ behavior: 'deny', message: rule.reason ?? 'denied by policy' });
        }
        if (rule.decision === 'allow') {
          this.persist(taskId, 'agent.permission_auto_allowed', {
            toolUseId: opts.toolUseID,
            toolName,
          });
          return Promise.resolve({ behavior: 'allow', updatedInput: toolInput });
        }
        return this.broker.request(taskId, opts.toolUseID, toolName, toolInput, opts.signal);
      },
      ...(this.sandbox ? { sandbox: this.sandbox } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
    };

    let q: Query;
    try {
      q = this.query({ prompt: input.prompt, options });
    } catch (err) {
      this.fail(taskId, 'spawn', err);
      return;
    }
    this.running.set(taskId, { query: q, abort });

    let sessionStored = false;
    let result: SDKResultMessage | undefined;
    try {
      for await (const msg of q) {
        // Event-log-first: persist before anything else acts on it.
        this.persist(taskId, eventType(msg), msg);
        const sid = (msg as { session_id?: string }).session_id;
        if (sid && !sessionStored) {
          this.tasks.setSession(taskId, sid);
          sessionStored = true;
        }
        if (msg.type === 'result') {
          result = msg;
          if (msg.is_error) {
            this.log.error(
              {
                taskId,
                sessionId: msg.session_id,
                subtype: msg.subtype,
                // For an error result the SDK puts the API error text (incl. request_id) here.
                result: (msg as { result?: unknown }).result ?? null,
              },
              'agent run returned an error result',
            );
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) {
        this.tasks.setStatus(taskId, 'cancelled');
        this.persist(taskId, 'task.cancelled', {});
      } else {
        this.fail(taskId, 'run', err);
      }
      return;
    }

    if (result) {
      const status = result.is_error ? 'failed' : 'done';
      this.tasks.setResult(taskId, {
        sessionId: result.session_id,
        costUsd: result.total_cost_usd,
        status,
      });
      this.persist(taskId, 'task.completed', {
        status,
        costUsd: result.total_cost_usd,
        sessionId: result.session_id,
      });
      this.log.info({ taskId, status, costUsd: result.total_cost_usd }, 'task completed');
    } else {
      // Stream ended without a result message.
      this.tasks.setStatus(taskId, 'done');
      this.persist(taskId, 'task.completed', { status: 'done', costUsd: null, sessionId: null });
    }
  }

  /** Interrupt a running task (full cancel endpoint is S1-07). */
  async cancel(taskId: string): Promise<boolean> {
    const handle = this.running.get(taskId);
    if (!handle) return false;
    try {
      await handle.query.interrupt();
    } catch {
      handle.abort.abort();
    }
    return true;
  }
}
