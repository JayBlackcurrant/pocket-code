import { randomBytes } from 'node:crypto';
import type { ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { TaskStore } from '../db/taskStore.js';
import { RunStore, type RunRow } from '../db/runStore.js';
import { RunLog, type StoredRunEvent } from '../db/runLog.js';
import type { StoredEvent } from '../db/eventLog.js';
import { GitError, GitService, runGit } from '../git/gitService.js';
import { resolveBuildFlavor } from '../guardrails.js';
import { CheckoutGuard } from '../checkoutGuard.js';
import {
  makeSpawnRunSession,
  type RunControlResult,
  type RunSessionEvent,
  type RunSessionHandle,
  type SpawnRunSession,
} from './runSession.js';
import { createVmServiceClient, type ConsoleEntry, type VmServiceClient } from './vmService.js';

/** Minimal structured logger; fastify's `app.log` satisfies it. */
export interface RunLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const noopLogger: RunLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** How long to wait for a graceful `app.stop` before force-killing the child. */
const STOP_TIMEOUT_MS = 5000;

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunError';
  }
}

/** The project already has an active run session (one live run per project). Maps to HTTP 409. */
export class RunBusyError extends RunError {
  constructor(message: string) {
    super(message);
    this.name = 'RunBusyError';
  }
}

export interface RunServiceDeps {
  registry: ProjectRegistry;
  runs: RunStore;
  runLog: RunLog;
  tasks: TaskStore;
  git?: GitService;
  /** Defaults to the real spawn-based session. Tests pass a fake. */
  spawnRunSession?: SpawnRunSession;
  logger?: RunLogger;
  /** Shared checkout guard (coordinates with Claude tasks, S5-04). index.ts passes the SAME
   *  instance to AgentRunner and RunService; a standalone default is used in isolated tests. */
  checkoutGuard?: CheckoutGuard;
  /** Task event source (AgentRunner) for auto-reload after a Claude edit (S5-07). When a task on a
   *  live run's branch completes, the run hot-reloads. Omit to disable. */
  taskEvents?: { onEvent(listener: (e: StoredEvent) => void): () => void };
  /** Debounce for auto-reload, coalescing a burst of task completions. Default 400ms. */
  autoReloadDebounceMs?: number;
  /** Connect the Dart VM Service for the debug console (S5-14). Defaults to a real WebSocket
   *  client; tests pass a fake. Returns a handle to close when the run ends. */
  connectVmService?: (url: string, onEntry: (e: ConsoleEntry) => void) => VmServiceClient;
}

export interface StartRunInput {
  projectId: string;
  /** adb serial (host:port) of the target phone, from the connect cascade (S5-06). */
  deviceSerial: string;
  /** Run a task's branch (checked out first). Omit to run the current checkout. */
  taskId?: string;
  /** Overrides manifest flavorDefault; still subject to the staging-only guardrail. */
  flavor?: string;
}

interface Session {
  handle: RunSessionHandle;
  abort: AbortController;
  projectId: string;
}

function genRunId(): string {
  return 'r' + randomBytes(8).toString('hex');
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Live-run service (S5-03): owns one `flutter run --machine` session per project. Maps the
 * session's structured events (S5-02) to the event-log-first RunLog + RunStore status, and
 * exposes hot reload / restart / stop. A run holds the single project checkout for its lifetime;
 * the full task-coexistence gate is S5-04 (here: one run per project). See LIVE_RUN_PLAN.md §4.
 */
export class RunService {
  private readonly registry: ProjectRegistry;
  private readonly runs: RunStore;
  private readonly runLog: RunLog;
  private readonly tasks: TaskStore;
  private readonly git: GitService;
  private readonly spawnRunSession: SpawnRunSession;
  private readonly guard: CheckoutGuard;
  private log: RunLogger;

  private readonly sessions = new Map<string, Session>();
  private readonly settlers = new Map<string, () => void>();
  private readonly settled = new Map<string, Promise<void>>();
  private readonly autoReloadDebounceMs: number;
  private readonly autoReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private taskEventsUnsub: (() => void) | null = null;
  private readonly connectVmService: (url: string, onEntry: (e: ConsoleEntry) => void) => VmServiceClient;
  private readonly vmClients = new Map<string, VmServiceClient>();

  constructor(deps: RunServiceDeps) {
    this.registry = deps.registry;
    this.runs = deps.runs;
    this.runLog = deps.runLog;
    this.tasks = deps.tasks;
    this.git = deps.git ?? new GitService();
    this.spawnRunSession = deps.spawnRunSession ?? makeSpawnRunSession();
    this.guard = deps.checkoutGuard ?? new CheckoutGuard();
    this.log = deps.logger ?? noopLogger;
    this.autoReloadDebounceMs = deps.autoReloadDebounceMs ?? 400;
    this.connectVmService =
      deps.connectVmService ?? ((url, onEntry) => createVmServiceClient({ url, onEntry }));
    if (deps.taskEvents) {
      this.taskEventsUnsub = deps.taskEvents.onEvent((e) => this.onTaskEvent(e));
    }
  }

  setLogger(logger: RunLogger): void {
    this.log = logger;
  }

  /** Subscribe to persisted run events (used by the run WebSocket, S5-05). */
  onEvent(listener: (e: StoredRunEvent) => void): () => void {
    return this.runLog.onEvent(listener);
  }

  get(runId: string): RunRow | undefined {
    return this.runs.get(runId);
  }

  listForProject(projectId: string): RunRow[] {
    return this.runs.listForProject(projectId);
  }

  activeForProject(projectId: string): RunRow | undefined {
    return this.runs.activeForProject(projectId);
  }

  logsSince(runId: string, since: number): StoredRunEvent[] {
    return this.runLog.since(runId, since);
  }

  lastLogLines(runId: string, limit = 50): StoredRunEvent[] {
    return this.runLog.lastLines(runId, limit);
  }

  /** Resolves when the run session has fully exited (for tests/shutdown). */
  whenSettled(runId: string): Promise<void> {
    return this.settled.get(runId) ?? Promise.resolve();
  }

  private persist(runId: string, type: string, payload: unknown): void {
    this.runLog.append(runId, type, payload);
  }

  /** Default `flutter run --machine` command for a device, honouring the manifest's flutter mode
   *  (fvm vs system) and an optional flavor. */
  private buildRunCommand(manifest: ProjectManifest, deviceSerial: string, flavor?: string): string {
    const flutter = manifest.flutter === 'system' ? 'flutter' : 'fvm flutter';
    const flavorArg = flavor ? ` --flavor ${flavor}` : '';
    return `${flutter} run --machine -d ${deviceSerial}${flavorArg}`;
  }

  /**
   * Start a run session. Pre-flight (project active, one-run-per-project gate, task/branch,
   * flavor guardrail, branch checkout) throws before any row is created; then the row is created
   * `starting` and `flutter run` is spawned in the background. Returns the created row.
   */
  async start(input: StartRunInput): Promise<RunRow> {
    const project = this.registry.getActive(input.projectId);
    if (!project?.resolvedPath) {
      throw new RunError(`project not active: "${input.projectId}"`);
    }
    const manifest = project.manifest;
    const cwd = project.resolvedPath;

    // Resolve the branch to run — but do NOT touch the working tree yet; we gate first so a
    // refused run never disturbs the checkout.
    let branch: string;
    let taskBranchToCheckout: string | undefined;
    if (input.taskId !== undefined) {
      const task = this.tasks.get(input.taskId);
      if (!task) throw new RunError(`unknown task: "${input.taskId}"`);
      if (task.projectId !== manifest.id) {
        throw new RunError(`task "${input.taskId}" does not belong to project "${manifest.id}"`);
      }
      if (!task.branch) throw new RunError(`task "${input.taskId}" has no branch yet`);
      branch = task.branch;
      taskBranchToCheckout = task.branch;
    } else {
      branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    }

    // Checkout gate (S5-04): one run per project, and a task may coexist only on this same branch.
    const acq = this.guard.acquireRun(manifest.id, branch);
    if (!acq.ok) throw new RunBusyError(acq.reason);

    // Past the gate: any failure must release the run slot.
    try {
      // Put the checkout on the task's branch (no-op if already there; fails on a dirty switch).
      if (taskBranchToCheckout) {
        try {
          await this.git.checkoutBranch(cwd, taskBranchToCheckout);
        } catch (err) {
          const reason = err instanceof GitError ? err.message : String(err);
          throw new RunError(`could not check out branch "${taskBranchToCheckout}": ${reason}`);
        }
      }

      // Flavor only when the project uses flavors (guardrail-checked); plain run otherwise.
      const flavor =
        input.flavor !== undefined || manifest.flavorDefault !== undefined
          ? resolveBuildFlavor(manifest, input.flavor)
          : undefined;

      const id = genRunId();
      const row = this.runs.create({
        id,
        projectId: manifest.id,
        taskId: input.taskId ?? null,
        branch,
        cwd,
        deviceSerial: input.deviceSerial,
        status: 'starting',
      });
      this.persist(id, 'run.created', {
        projectId: manifest.id,
        taskId: input.taskId ?? null,
        branch,
        deviceSerial: input.deviceSerial,
        ...(flavor ? { flavor } : {}),
      });

      const command = this.buildRunCommand(manifest, input.deviceSerial, flavor);
      const abort = new AbortController();
      const settled = new Promise<void>((res) => this.settlers.set(id, res));
      this.settled.set(id, settled);

      const handle = this.spawnRunSession({
        command,
        cwd,
        signal: abort.signal,
        onEvent: (e) => this.onSessionEvent(id, e),
      });
      this.sessions.set(id, { handle, abort, projectId: manifest.id });
      void handle.exited.then(({ code }) => this.onExit(id, code));

      this.log.info({ runId: id, projectId: manifest.id, branch }, 'run session starting');
      return row;
    } catch (err) {
      this.guard.releaseRun(manifest.id);
      throw err;
    }
  }

  private onSessionEvent(runId: string, e: RunSessionEvent): void {
    switch (e.kind) {
      case 'log':
        this.persist(runId, 'run.log', { stream: e.stream, line: e.line });
        return;
      case 'appLog':
        this.persist(runId, 'run.log', { stream: e.error ? 'stderr' : 'stdout', line: e.log });
        return;
      case 'progress':
        this.persist(runId, 'run.progress', { message: e.message, finished: e.finished });
        return;
      case 'starting':
        this.persist(runId, 'run.progress', { message: 'launching', finished: false });
        return;
      case 'started':
        this.runs.markRunning(runId);
        this.persist(runId, 'run.started', { appId: e.appId });
        return;
      case 'debugPort': {
        const uri = e.wsUri ?? e.baseUri;
        if (uri) this.runs.setDebugPort(runId, uri);
        // Connect the VM Service for a structured debug console (S5-14). Needs the ws URI.
        if (e.wsUri) {
          this.vmClients.get(runId)?.close();
          try {
            this.vmClients.set(
              runId,
              this.connectVmService(e.wsUri, (entry) => this.persist(runId, 'run.console', entry)),
            );
          } catch {
            /* the console is best-effort; a failed connect never breaks the run */
          }
        }
        this.persist(runId, 'run.debugPort', { wsUri: e.wsUri, baseUri: e.baseUri });
        return;
      }
      case 'stopped':
        this.runs.markStopped(runId);
        this.persist(runId, 'run.stopped', {});
        return;
      case 'daemonConnected':
      default:
        return;
    }
  }

  /** Auto-reload (S5-07): when a Claude task on a live run's branch finishes, hot-reload the run. */
  private onTaskEvent(e: StoredEvent): void {
    if (e.type !== 'task.completed') return;
    const task = this.tasks.get(e.taskId);
    if (!task) return;
    const run = this.runs.activeForProject(task.projectId);
    if (!run || run.branch !== task.branch || run.status !== 'running') return;
    if (!this.sessions.has(run.id)) return;
    this.scheduleAutoReload(run.id, e.taskId);
  }

  private scheduleAutoReload(runId: string, taskId: string): void {
    const existing = this.autoReloadTimers.get(runId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.autoReloadTimers.delete(runId);
      const run = this.runs.get(runId);
      if (!run || run.status !== 'running' || !this.sessions.has(runId)) return;
      this.persist(runId, 'run.autoreload', { taskId });
      this.log.info({ runId, taskId }, 'auto-reloading after a task edit');
      void this.reload(runId).catch(() => {});
    }, this.autoReloadDebounceMs);
    // A pending auto-reload shouldn't keep the process alive on its own.
    if (typeof timer.unref === 'function') timer.unref();
    this.autoReloadTimers.set(runId, timer);
  }

  private onExit(runId: string, code: number | null): void {
    const session = this.sessions.get(runId);
    const row = this.runs.get(runId);
    this.sessions.delete(runId);
    const timer = this.autoReloadTimers.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.autoReloadTimers.delete(runId);
    }
    this.vmClients.get(runId)?.close();
    this.vmClients.delete(runId);
    if (session) this.guard.releaseRun(session.projectId);
    if (row && row.status !== 'stopped' && row.status !== 'failed') {
      if (code === 0 || code === null) {
        this.runs.markStopped(runId);
        this.persist(runId, 'run.stopped', { code });
      } else {
        this.runs.markFailed(runId, `flutter run exited with code ${code}`);
        this.persist(runId, 'run.error', { reason: `flutter run exited with code ${code}`, code });
      }
    }
    this.log.info({ runId, code }, 'run session exited');
    this.settle(runId);
  }

  private settle(runId: string): void {
    const res = this.settlers.get(runId);
    if (res) {
      res();
      this.settlers.delete(runId);
    }
  }

  async reload(runId: string): Promise<RunControlResult> {
    return this.control(runId, 'reload');
  }

  async restart(runId: string): Promise<RunControlResult> {
    return this.control(runId, 'restart');
  }

  private async control(runId: string, kind: 'reload' | 'restart'): Promise<RunControlResult> {
    const session = this.sessions.get(runId);
    if (!session) throw new RunError(`run "${runId}" is not active`);
    this.runs.markReloading(runId);
    this.persist(runId, kind === 'reload' ? 'run.reload' : 'run.restart', {});
    const res = kind === 'reload' ? await session.handle.reload() : await session.handle.restart();
    // A failed reload doesn't stop the app, so we return to running either way.
    this.runs.markReloaded(runId);
    this.persist(runId, res.ok ? `run.${kind}ed` : `run.${kind}_failed`, {
      code: res.code,
      message: res.message,
    });
    return res;
  }

  /** Stop a run session: graceful `app.stop`, then force-kill if it doesn't exit in time.
   *  Returns false if the run isn't active. The exit handler marks the row stopped. */
  async stop(runId: string): Promise<boolean> {
    const session = this.sessions.get(runId);
    if (!session) return false;
    this.persist(runId, 'run.stopping', {});
    await session.handle.stop().catch(() => {});
    const exited = await Promise.race([session.handle.exited.then(() => true), delay(STOP_TIMEOUT_MS).then(() => false)]);
    if (!exited) {
      this.log.warn({ runId }, 'run did not stop gracefully; killing');
      session.handle.kill();
    }
    return true;
  }

  /**
   * Crash recovery (mirrors AgentRunner): a run session cannot survive a daemon restart — the
   * child process is gone — so mark any run left active in the DB as failed on startup.
   */
  recoverInterrupted(): number {
    const stale = this.runs.listActive();
    for (const r of stale) {
      this.runs.markFailed(r.id, 'daemon restarted; run session lost');
      this.persist(r.id, 'run.error', { reason: 'daemon restarted; run session lost', code: null });
    }
    return stale.length;
  }

  /** Stop every active session (for graceful shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }

  /** Unsubscribe from task events and clear pending auto-reload timers. */
  dispose(): void {
    if (this.taskEventsUnsub) {
      this.taskEventsUnsub();
      this.taskEventsUnsub = null;
    }
    for (const t of this.autoReloadTimers.values()) clearTimeout(t);
    this.autoReloadTimers.clear();
    for (const c of this.vmClients.values()) c.close();
    this.vmClients.clear();
  }
}
