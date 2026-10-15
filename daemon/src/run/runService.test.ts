import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/db.js';
import { RunStore } from '../db/runStore.js';
import { RunLog } from '../db/runLog.js';
import { TaskStore } from '../db/taskStore.js';
import { ProjectManifestSchema, type ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { GitService } from '../git/gitService.js';
import { RunService, RunBusyError, RunError } from './runService.js';
import { CheckoutGuard } from '../checkoutGuard.js';
import type { RunControlResult, RunSessionEvent, RunSessionHandle, SpawnRunSession } from './runSession.js';

const manifest: ProjectManifest = ProjectManifestSchema.parse({
  id: 'hedged',
  path: '/p',
  flutter: 'fvm',
  build: { apk: 'fvm flutter build apk' },
  signing: { mode: 'in-repo' },
  git: { remote: 'origin', base: 'main' },
});

function fakeRegistry(): ProjectRegistry {
  return {
    getActive: (id: string) => (id === 'hedged' ? { manifest, resolvedPath: '/p', status: 'active' } : undefined),
  } as unknown as ProjectRegistry;
}

const fakeGit = { checkoutBranch: async () => {} } as unknown as GitService;

function makeFakeSpawn() {
  let onEvent: (e: RunSessionEvent) => void = () => {};
  let resolveExit!: (v: { code: number | null }) => void;
  const exited = new Promise<{ code: number | null }>((r) => {
    resolveExit = r;
  });
  const calls = { reload: 0, restart: 0, stop: 0, kill: 0, command: '' };
  let reloadResult: RunControlResult = { ok: true, code: 0, message: 'reloaded' };
  const handle: RunSessionHandle = {
    reload: async () => {
      calls.reload++;
      return reloadResult;
    },
    restart: async () => {
      calls.restart++;
      return { ok: true, code: 0, message: 'restarted' };
    },
    stop: async () => {
      calls.stop++;
      resolveExit({ code: 0 });
      return { ok: true, code: null, message: null };
    },
    kill: () => {
      calls.kill++;
      resolveExit({ code: null });
    },
    get appId() {
      return 'a1';
    },
    exited,
  };
  const spawn: SpawnRunSession = (args) => {
    onEvent = args.onEvent;
    calls.command = args.command;
    return handle;
  };
  return {
    spawn,
    calls,
    emit: (e: RunSessionEvent) => onEvent(e),
    exit: (code: number | null) => resolveExit({ code }),
    setReloadResult: (r: RunControlResult) => {
      reloadResult = r;
    },
  };
}

let db: Db;
let runs: RunStore;
let runLog: RunLog;
let tasks: TaskStore;
let fake: ReturnType<typeof makeFakeSpawn>;
let svc: RunService;

beforeEach(() => {
  db = openDb(':memory:');
  runs = new RunStore(db);
  runLog = new RunLog(db);
  tasks = new TaskStore(db);
  tasks.create({ id: 't1', projectId: 'hedged', branch: 'claude/x', worktree: '/p' });
  fake = makeFakeSpawn();
  svc = new RunService({ registry: fakeRegistry(), runs, runLog, tasks, git: fakeGit, spawnRunSession: fake.spawn });
});

afterEach(() => db.close());

const start = () => svc.start({ projectId: 'hedged', deviceSerial: '100.1.1.1:5555', taskId: 't1' });

describe('RunService.start', () => {
  it('creates a starting run on the task branch and spawns flutter run --machine', async () => {
    const row = await start();
    expect(row.status).toBe('starting');
    expect(row.branch).toBe('claude/x');
    expect(row.deviceSerial).toBe('100.1.1.1:5555');
    expect(runs.activeForProject('hedged')?.id).toBe(row.id);
    expect(fake.calls.command).toBe('fvm flutter run --machine -d 100.1.1.1:5555');
    expect(svc.logsSince(row.id, 0).map((e) => e.type)).toContain('run.created');
  });

  it('refuses a second run while one is active (RunBusyError → 409)', async () => {
    await start();
    await expect(start()).rejects.toBeInstanceOf(RunBusyError);
  });

  it('rejects an unknown project', async () => {
    await expect(svc.start({ projectId: 'nope', deviceSerial: 'x:5555' })).rejects.toBeInstanceOf(RunError);
  });
});

describe('RunService event mapping', () => {
  it('maps started → running + run.started, and debugPort → setDebugPort', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    expect(runs.get(row.id)?.status).toBe('running');
    fake.emit({ kind: 'debugPort', wsUri: 'ws://127.0.0.1/ws', baseUri: 'http://127.0.0.1' });
    expect(runs.get(row.id)?.debugPort).toBe('ws://127.0.0.1/ws');
    const types = svc.logsSince(row.id, 0).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['run.started', 'run.debugPort']));
  });

  it('maps log / appLog / progress to run events', async () => {
    const row = await start();
    fake.emit({ kind: 'log', stream: 'stdout', line: 'hello' });
    fake.emit({ kind: 'appLog', log: 'oops', error: true });
    fake.emit({ kind: 'progress', message: 'Building', finished: false });
    const logs = svc.logsSince(row.id, 0).filter((e) => e.type === 'run.log');
    expect(logs).toHaveLength(2);
    expect(svc.logsSince(row.id, 0).some((e) => e.type === 'run.progress')).toBe(true);
  });
});

describe('RunService control', () => {
  it('reload marks reloading→running and reports the result', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    const res = await svc.reload(row.id);
    expect(res).toEqual({ ok: true, code: 0, message: 'reloaded' });
    expect(fake.calls.reload).toBe(1);
    expect(runs.get(row.id)?.status).toBe('running');
    const types = svc.logsSince(row.id, 0).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['run.reload', 'run.reloaded']));
  });

  it('a failed reload is recorded but the app stays running', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    fake.setReloadResult({ ok: false, code: 1, message: 'compile error' });
    const res = await svc.reload(row.id);
    expect(res.ok).toBe(false);
    expect(runs.get(row.id)?.status).toBe('running');
    expect(svc.logsSince(row.id, 0).some((e) => e.type === 'run.reload_failed')).toBe(true);
  });

  it('reload on a non-active run throws', async () => {
    await expect(svc.reload('nope')).rejects.toBeInstanceOf(RunError);
  });

  it('stop ends the session and marks it stopped', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    const ok = await svc.stop(row.id);
    await svc.whenSettled(row.id);
    expect(ok).toBe(true);
    expect(fake.calls.stop).toBe(1);
    expect(runs.get(row.id)?.status).toBe('stopped');
    expect(runs.activeForProject('hedged')).toBeUndefined();
  });

  it('stop on a non-active run returns false', async () => {
    expect(await svc.stop('nope')).toBe(false);
  });
});

describe('RunService + shared CheckoutGuard (S5-04)', () => {
  const build = (guard: CheckoutGuard) =>
    new RunService({ registry: fakeRegistry(), runs, runLog, tasks, git: fakeGit, spawnRunSession: fake.spawn, checkoutGuard: guard });

  it('refuses a run when a task holds a different branch', async () => {
    const guard = new CheckoutGuard();
    const svc2 = build(guard);
    guard.acquireTask('hedged', 'claude/other');
    await expect(svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' })).rejects.toBeInstanceOf(
      RunBusyError,
    );
  });

  it('allows a run on the same branch a task holds', async () => {
    const guard = new CheckoutGuard();
    const svc2 = build(guard);
    guard.acquireTask('hedged', 'claude/x'); // t1's branch
    const row = await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    expect(row.status).toBe('starting');
    expect(guard.hasRun('hedged')).toBe(true);
  });

  it('releases the run slot on exit so a later task can start', async () => {
    const guard = new CheckoutGuard();
    const svc2 = build(guard);
    const row = await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    expect(guard.hasRun('hedged')).toBe(true);
    fake.exit(0);
    await svc2.whenSettled(row.id);
    expect(guard.hasRun('hedged')).toBe(false);
  });
});

describe('RunService auto-reload after a Claude edit (S5-07)', () => {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function makeTaskEvents() {
    const listeners = new Set<(e: import('../db/eventLog.js').StoredEvent) => void>();
    return {
      source: { onEvent: (l: (e: import('../db/eventLog.js').StoredEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } },
      complete: (taskId: string) =>
        listeners.forEach((l) => l({ seq: 1, taskId, type: 'task.completed', payload: {}, createdAt: Date.now() })),
    };
  }
  const build = (te: ReturnType<typeof makeTaskEvents>) =>
    new RunService({
      registry: fakeRegistry(),
      runs,
      runLog,
      tasks,
      git: fakeGit,
      spawnRunSession: fake.spawn,
      taskEvents: te.source,
      autoReloadDebounceMs: 5,
    });

  it('reloads a live run when a task on its branch completes', async () => {
    const te = makeTaskEvents();
    const svc2 = build(te);
    const row = await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    fake.emit({ kind: 'started', appId: 'a1' }); // status → running
    te.complete('t1'); // t1's branch is claude/x, same as the run
    await delay(30);
    expect(fake.calls.reload).toBe(1);
    expect(svc2.logsSince(row.id, 0).some((e) => e.type === 'run.autoreload')).toBe(true);
    svc2.dispose();
  });

  it('ignores a task on a different branch', async () => {
    const te = makeTaskEvents();
    const svc2 = build(te);
    tasks.create({ id: 't2', projectId: 'hedged', branch: 'claude/other', worktree: '/p' });
    await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    fake.emit({ kind: 'started', appId: 'a1' });
    te.complete('t2'); // different branch
    await delay(30);
    expect(fake.calls.reload).toBe(0);
    svc2.dispose();
  });

  it('debounces a burst of completions into a single reload', async () => {
    const te = makeTaskEvents();
    const svc2 = build(te);
    await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    fake.emit({ kind: 'started', appId: 'a1' });
    te.complete('t1');
    te.complete('t1');
    te.complete('t1');
    await delay(30);
    expect(fake.calls.reload).toBe(1);
    svc2.dispose();
  });

  it('does not reload before the app has started (status still starting)', async () => {
    const te = makeTaskEvents();
    const svc2 = build(te);
    await svc2.start({ projectId: 'hedged', deviceSerial: 'x:5555', taskId: 't1' });
    te.complete('t1'); // no "started" emitted → status is 'starting'
    await delay(30);
    expect(fake.calls.reload).toBe(0);
    svc2.dispose();
  });
});

describe('RunService exit + recovery', () => {
  it('a non-zero exit marks the run failed', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    fake.exit(1);
    await svc.whenSettled(row.id);
    expect(runs.get(row.id)?.status).toBe('failed');
    expect(runs.get(row.id)?.error).toContain('code 1');
  });

  it('recoverInterrupted fails runs left active by a crash/restart', async () => {
    const row = await start();
    fake.emit({ kind: 'started', appId: 'a1' });
    // Simulate a restart: a fresh service over the same db has no in-memory session.
    const fresh = new RunService({ registry: fakeRegistry(), runs, runLog, tasks, git: fakeGit, spawnRunSession: fake.spawn });
    expect(fresh.recoverInterrupted()).toBe(1);
    expect(runs.get(row.id)?.status).toBe('failed');
    expect(runs.get(row.id)?.error).toContain('daemon restarted');
  });
});
