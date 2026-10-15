import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/db.js';
import { RunStore } from '../db/runStore.js';
import { RunLog } from '../db/runLog.js';
import { TaskStore } from '../db/taskStore.js';
import { ProjectManifestSchema, type ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { GitService } from '../git/gitService.js';
import { RunService, RunBusyError, RunError } from './runService.js';
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
