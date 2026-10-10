import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  PermissionMode,
  Query,
  SDKMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { GitService } from '../git/gitService.js';
import type { TaskStore } from '../db/taskStore.js';
import type { EventLog, StoredEvent } from '../db/eventLog.js';
import type { Db } from '../db/db.js';
import { PermissionBroker, type Decision, type PendingPermission } from './permissionBroker.js';

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
 * Runs a Claude Code task (S1-05): creates a worktree, runs the Agent SDK `query()`
 * with `cwd` set to that worktree, and writes every message to the event log with a
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

  private readonly emitter = new EventEmitter();
  private readonly running = new Map<string, { query: Query; abort: AbortController }>();
  private readonly settled = new Map<string, Promise<void>>();
  private readonly broker: PermissionBroker;

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
    this.broker = new PermissionBroker(deps.db, (t, ty, p) => this.persist(t, ty, p), deps.tasks);
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
    this.tasks.setStatus(taskId, 'failed');
    this.persist(taskId, 'task.error', { stage, message: err instanceof Error ? err.message : String(err) });
  }

  /**
   * Create the worktree and begin the run. Returns once the worktree exists; the agent
   * loop continues in the background (awaitable via whenSettled).
   */
  async start(input: StartTaskInput): Promise<StartedTask> {
    const project = this.registry.getActive(input.projectId);
    if (!project || !project.resolvedPath) {
      throw new Error(`project not active: "${input.projectId}"`);
    }
    const manifest = project.manifest;
    const taskId = input.taskId ?? genTaskId();

    // Create the task row first so events have a valid foreign key.
    this.tasks.create({ id: taskId, projectId: manifest.id, branch: '', worktree: '', status: 'queued' });
    this.persist(taskId, 'task.created', { projectId: manifest.id, prompt: input.prompt });

    let worktree;
    try {
      worktree = await this.git.createWorktree(project.resolvedPath, {
        taskId,
        baseRef: manifest.git.base,
        name: input.prompt,
      });
    } catch (err) {
      this.fail(taskId, 'worktree', err);
      throw err;
    }

    this.tasks.setWorktree(taskId, worktree.branch, worktree.path);
    this.tasks.setStatus(taskId, 'running');
    this.persist(taskId, 'task.started', {
      branch: worktree.branch,
      worktree: worktree.path,
      baseRef: worktree.baseRef,
    });

    const run = this.runAgent(taskId, worktree.path, input).finally(() => {
      this.running.delete(taskId);
      this.broker.clearTask(taskId);
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
      // The canUseTool bridge (S2-01): tools needing permission park until the phone
      // decides. Edits are auto-accepted by `acceptEdits`; other tools come through here.
      canUseTool: (toolName, toolInput, opts) =>
        this.broker.request(taskId, opts.toolUseID, toolName, toolInput, opts.signal),
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
        if (msg.type === 'result') result = msg;
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
