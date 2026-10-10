import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { safeResolveWithin } from '../fs/pathSafety.js';
import type { ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { TaskStore } from '../db/taskStore.js';
import { BuildStore, type BuildRow } from '../db/buildStore.js';
import { BuildLog, type StoredBuildEvent } from '../db/buildLog.js';
import { resolveBuildFlavor } from '../guardrails.js';

/** Minimal structured logger; fastify's `app.log` satisfies it. */
export interface BuildLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const noopLogger: BuildLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Per-line cap so a runaway log line can't bloat a DB row / the phone. */
const MAX_LINE_LEN = 4000;

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildError';
  }
}

export interface StepResult {
  code: number;
}

/** The single I/O boundary: run one shell step, streaming its output line by line.
 *  Injectable so tests never spawn a real `flutter`. */
export type RunStep = (args: {
  /** The full command string from the manifest (e.g. "fvm flutter build apk ..."), for logging. */
  command: string;
  /** Pre-tokenized argv. When set it is used verbatim (no whitespace splitting), so an
   *  argument may contain spaces — used by the upload step for file-path arguments. */
  argv?: { cmd: string; args: string[] };
  cwd: string;
  signal: AbortSignal;
  onLine: (stream: 'stdout' | 'stderr', line: string) => void;
}) => Promise<StepResult>;

export interface BuildServiceDeps {
  registry: ProjectRegistry;
  builds: BuildStore;
  buildLog: BuildLog;
  tasks: TaskStore;
  /** Defaults to the real spawn-based runner. Tests pass a fake. */
  runStep?: RunStep;
  logger?: BuildLogger;
}

export interface EnqueueBuildInput {
  projectId: string;
  /** Build a task's reviewed worktree instead of the project's main checkout. */
  taskId?: string;
  /** Overrides manifest flavorDefault; still subject to the staging-only guardrail. */
  flavor?: string;
  /** Run the manifest codegen steps before the APK build. Default true. */
  runCodegen?: boolean;
  /** Set when this build is a retry of another (S3-04); recorded for lineage. */
  retryOf?: string;
}

function genBuildId(): string {
  return 'b' + randomBytes(8).toString('hex');
}

/** Split a manifest command string into argv. Config is operator-authored and uses plain
 *  whitespace-separated tokens (no quoting/pipes), so a simple split is safe and shell-free. */
export function tokenizeCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) throw new BuildError('empty build command');
  return { cmd: parts[0]!, args: parts.slice(1) };
}

/**
 * Prefix a command with `caffeinate -i` so a long job (a 15-minute build) can't let the
 * Mac idle-sleep mid-run (S3-08, CLAUDE.md). Only on macOS — `caffeinate` is macOS-only;
 * elsewhere (and when disabled) the command is returned unchanged. Pure + testable via the
 * injectable `platform`.
 */
export function caffeinateWrap(
  cmd: string,
  args: string[],
  opts: { enabled: boolean; platform?: NodeJS.Platform },
): { cmd: string; args: string[] } {
  const platform = opts.platform ?? process.platform;
  if (opts.enabled && platform === 'darwin') {
    return { cmd: 'caffeinate', args: ['-i', cmd, ...args] };
  }
  return { cmd, args };
}

/** Build a spawn-based step runner: no shell, stdout/stderr buffered into whole lines, and
 *  (on macOS, unless disabled) the command wrapped in `caffeinate -i` so the Mac stays awake
 *  for the whole job (S3-08). Shared by the build pipeline (S3-01) and upload step (S3-02). */
export function makeSpawnRunStep(opts: { caffeinate?: boolean } = {}): RunStep {
  const caffeinate = opts.caffeinate ?? true;
  return ({ command, argv, cwd, signal, onLine }) => {
    const base = argv ?? tokenizeCommand(command);
    const { cmd, args } = caffeinateWrap(base.cmd, base.args, { enabled: caffeinate });
    return new Promise<StepResult>((resolvePromise, reject) => {
      const child = spawn(cmd, args, { cwd, signal });
      const buffers: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

      const pump = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        buffers[stream] += chunk.toString('utf8');
        let nl = buffers[stream].indexOf('\n');
        while (nl !== -1) {
          onLine(stream, buffers[stream].slice(0, nl).replace(/\r$/, ''));
          buffers[stream] = buffers[stream].slice(nl + 1);
          nl = buffers[stream].indexOf('\n');
        }
      };

      child.stdout?.on('data', pump('stdout'));
      child.stderr?.on('data', pump('stderr'));
      child.on('error', reject);
      child.on('close', (code) => {
        for (const stream of ['stdout', 'stderr'] as const) {
          if (buffers[stream].length > 0) onLine(stream, buffers[stream]);
        }
        resolvePromise({ code: code ?? 1 });
      });
    });
  };
}

/** Default step runner (caffeinate on). Used when a service is given no runStep. */
export const spawnRunStep: RunStep = makeSpawnRunStep();

/**
 * Build service (S3-01): a serial queue (one build at a time) that runs a project's
 * codegen steps and APK build from the manifest, streaming every log line to SQLite
 * (event-log-first) and emitting it live for the build WebSocket.
 */
export class BuildService {
  private readonly registry: ProjectRegistry;
  private readonly builds: BuildStore;
  private readonly buildLog: BuildLog;
  private readonly tasks: TaskStore;
  private readonly runStep: RunStep;
  private log: BuildLogger;

  private readonly queue: string[] = [];
  private readonly settlers = new Map<string, () => void>();
  private readonly settled = new Map<string, Promise<void>>();
  private readonly aborts = new Map<string, AbortController>();
  /** Per-build runtime plan, kept out of the DB (commands are derived from the manifest). */
  private readonly plan = new Map<
    string,
    { manifest: ProjectManifest; cwd: string; flavor: string; runCodegen: boolean; mainRepoPath: string }
  >();
  private draining = false;

  constructor(deps: BuildServiceDeps) {
    this.registry = deps.registry;
    this.builds = deps.builds;
    this.buildLog = deps.buildLog;
    this.tasks = deps.tasks;
    this.runStep = deps.runStep ?? spawnRunStep;
    this.log = deps.logger ?? noopLogger;
  }

  /** Swap in a real logger after construction (index.ts passes fastify's app.log). */
  setLogger(logger: BuildLogger): void {
    this.log = logger;
  }

  /** Subscribe to persisted build events (used by the build WebSocket). Delegates to the
   *  shared BuildLog emitter so upload events (S3-02) reach the same stream. */
  onEvent(listener: (e: StoredBuildEvent) => void): () => void {
    return this.buildLog.onEvent(listener);
  }

  /** Resolves when the build's run has fully settled (for tests/shutdown). */
  whenSettled(buildId: string): Promise<void> {
    return this.settled.get(buildId) ?? Promise.resolve();
  }

  get(buildId: string): BuildRow | undefined {
    return this.builds.get(buildId);
  }

  listForProject(projectId: string): BuildRow[] {
    return this.builds.listForProject(projectId);
  }

  logsSince(buildId: string, since: number): StoredBuildEvent[] {
    return this.buildLog.since(buildId, since);
  }

  /** The tail of a build's log (for showing a failed build's last lines, S3-04). */
  lastLogLines(buildId: string, limit = 20): StoredBuildEvent[] {
    return this.buildLog.lastLines(buildId, limit);
  }

  /**
   * Retry a finished build (S3-04): queue a NEW build with the same project/task/flavor/
   * codegen choice, preserving history and lineage (`retryOf`). Throws BuildError if the
   * build is unknown or still queued/running.
   */
  retry(buildId: string): BuildRow {
    const prev = this.builds.get(buildId);
    if (!prev) throw new BuildError(`unknown build: "${buildId}"`);
    if (prev.status === 'queued' || prev.status === 'running') {
      throw new BuildError(`build "${buildId}" is still ${prev.status}`);
    }
    return this.enqueue({
      projectId: prev.projectId,
      ...(prev.taskId !== null ? { taskId: prev.taskId } : {}),
      ...(prev.flavor !== null ? { flavor: prev.flavor } : {}),
      runCodegen: prev.runCodegen,
      retryOf: buildId,
    });
  }

  private persist(buildId: string, type: string, payload: unknown): void {
    this.buildLog.append(buildId, type, payload);
  }

  /**
   * Queue a build. Resolves project + flavor (guardrail-checked) and the working
   * directory, creates the build row, and kicks the serial drain loop. Returns the
   * queued row immediately; the build runs in the background (awaitable via whenSettled).
   */
  enqueue(input: EnqueueBuildInput): BuildRow {
    const project = this.registry.getActive(input.projectId);
    if (!project?.resolvedPath) {
      throw new BuildError(`project not active: "${input.projectId}"`);
    }
    const manifest = project.manifest;

    let cwd = project.resolvedPath;
    if (input.taskId !== undefined) {
      const task = this.tasks.get(input.taskId);
      if (!task) throw new BuildError(`unknown task: "${input.taskId}"`);
      if (task.projectId !== manifest.id) {
        throw new BuildError(`task "${input.taskId}" does not belong to project "${manifest.id}"`);
      }
      if (!task.worktree) throw new BuildError(`task "${input.taskId}" has no worktree yet`);
      cwd = task.worktree;
    }

    // Guardrail: a forbidden flavor (e.g. production during the pilot) throws here, before
    // the build row is ever created.
    const flavor = resolveBuildFlavor(manifest, input.flavor);

    const runCodegen = input.runCodegen ?? true;
    const id = genBuildId();
    const row = this.builds.create({
      id,
      projectId: manifest.id,
      taskId: input.taskId ?? null,
      flavor,
      cwd,
      runCodegen,
      retryOf: input.retryOf ?? null,
    });
    this.persist(id, 'build.created', {
      projectId: manifest.id,
      taskId: input.taskId ?? null,
      flavor,
      cwd,
      runCodegen,
      retryOf: input.retryOf ?? null,
    });

    const settled = new Promise<void>((res) => this.settlers.set(id, res));
    this.settled.set(id, settled);
    this.queue.push(id);
    this.plan.set(id, {
      manifest,
      cwd,
      flavor,
      runCodegen,
      mainRepoPath: project.resolvedPath,
    });
    void this.drain();
    return row;
  }

  /** Cancel a queued or running build. Returns false if it is already finished/unknown. */
  cancel(buildId: string): boolean {
    const row = this.builds.get(buildId);
    if (!row) return false;
    if (row.status === 'queued') {
      const i = this.queue.indexOf(buildId);
      if (i !== -1) this.queue.splice(i, 1);
      this.finishCancelled(buildId);
      return true;
    }
    if (row.status === 'running') {
      this.aborts.get(buildId)?.abort();
      return true;
    }
    return false;
  }

  private settle(buildId: string): void {
    this.plan.delete(buildId);
    this.aborts.delete(buildId);
    const res = this.settlers.get(buildId);
    if (res) {
      res();
      this.settlers.delete(buildId);
    }
  }

  private finishCancelled(buildId: string): void {
    this.builds.markCancelled(buildId);
    this.persist(buildId, 'build.cancelled', {});
    this.settle(buildId);
  }

  /** Serial drain: process one build at a time so builds never overlap. */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const buildId = this.queue.shift()!;
        const row = this.builds.get(buildId);
        // Skip builds cancelled while queued.
        if (!row || row.status !== 'queued') {
          this.settle(buildId);
          continue;
        }
        await this.runBuild(buildId);
      }
    } finally {
      this.draining = false;
    }
  }

  private async runBuild(buildId: string): Promise<void> {
    const plan = this.plan.get(buildId);
    if (!plan) {
      this.failBuild(buildId, 'internal: missing build plan', null);
      return;
    }
    const { manifest, cwd, runCodegen, mainRepoPath } = plan;

    const abort = new AbortController();
    this.aborts.set(buildId, abort);

    this.builds.markStarted(buildId);
    this.persist(buildId, 'build.started', { cwd, flavor: plan.flavor });
    this.log.info({ buildId, projectId: manifest.id, flavor: plan.flavor }, 'build started');

    // Surface a missing sibling backend clearly instead of running a doomed codegen step.
    if (runCodegen && manifest.codegen.requiresSibling) {
      const siblingPath = isAbsolute(manifest.codegen.requiresSibling)
        ? manifest.codegen.requiresSibling
        : resolve(mainRepoPath, manifest.codegen.requiresSibling);
      if (!existsSync(siblingPath)) {
        this.failBuild(
          buildId,
          `codegen requires sibling checkout "${manifest.codegen.requiresSibling}" (expected at ${siblingPath}), which is missing`,
          null,
        );
        return;
      }
    }

    const apkCommand = manifest.build.apk.replaceAll('{flavor}', plan.flavor);
    const steps = [...(runCodegen ? manifest.codegen.steps : []), apkCommand];

    for (let i = 0; i < steps.length; i++) {
      const rawStep = steps[i]!;
      const command = typeof rawStep === 'string' ? rawStep : rawStep.run;
      const stepDir = typeof rawStep === 'string' ? undefined : rawStep.dir;
      if (abort.signal.aborted) {
        this.finishCancelled(buildId);
        return;
      }

      // A step may run in a worktree subdirectory (e.g. `dir: api`). Resolve it inside the
      // worktree — reject any `..`/symlink escape rather than running outside it.
      let stepCwd = cwd;
      if (stepDir && stepDir !== '.') {
        try {
          stepCwd = safeResolveWithin(cwd, stepDir);
        } catch {
          this.failBuild(buildId, `codegen step dir "${stepDir}" escapes the worktree`, null);
          return;
        }
      }

      this.persist(buildId, 'build.step', {
        index: i,
        total: steps.length,
        command,
        ...(stepDir ? { dir: stepDir } : {}),
      });

      let result: StepResult;
      try {
        result = await this.runStep({
          command,
          cwd: stepCwd,
          signal: abort.signal,
          onLine: (stream, line) => {
            const trimmed = line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) : line;
            this.persist(buildId, 'build.log', { stream, line: trimmed });
          },
        });
      } catch (err) {
        if (abort.signal.aborted) {
          this.finishCancelled(buildId);
          return;
        }
        this.failBuild(buildId, `step failed to run: ${err instanceof Error ? err.message : String(err)}`, null);
        return;
      }

      if (abort.signal.aborted) {
        this.finishCancelled(buildId);
        return;
      }
      if (result.code !== 0) {
        this.failBuild(
          buildId,
          `step ${i + 1}/${steps.length} "${command}" exited with code ${result.code}`,
          result.code,
        );
        return;
      }
    }

    const artifact = findApk(cwd);
    this.builds.markSucceeded(buildId, artifact);
    this.persist(buildId, 'build.completed', { artifact });
    this.log.info({ buildId, artifact }, 'build completed');
    this.settle(buildId);
  }

  private failBuild(buildId: string, reason: string, exitCode: number | null): void {
    this.builds.markFailed(buildId, reason, exitCode);
    this.persist(buildId, 'build.error', { reason, exitCode });
    this.log.error({ buildId, reason, exitCode }, 'build failed');
    this.settle(buildId);
  }
}

/** Best-effort: find the newest APK under Flutter's standard output dir (for S3-02 upload). */
function findApk(cwd: string): string | null {
  const dir = join(cwd, 'build', 'app', 'outputs', 'flutter-apk');
  try {
    const apks = readdirSync(dir)
      .filter((f) => f.endsWith('.apk'))
      .map((f) => {
        const full = join(dir, f);
        return { full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return apks[0]?.full ?? null;
  } catch {
    return null;
  }
}
