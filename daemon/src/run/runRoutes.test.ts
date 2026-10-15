import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDb, type Db } from '../db/db.js';
import { RunStore } from '../db/runStore.js';
import { RunLog } from '../db/runLog.js';
import { BuildStore } from '../db/buildStore.js';
import { BuildLog } from '../db/buildLog.js';
import { TaskStore } from '../db/taskStore.js';
import { EventLog } from '../db/eventLog.js';
import { NotificationStore } from '../db/notificationStore.js';
import { NotificationService } from '../notify/notificationService.js';
import { AgentRunner } from '../agent/agentRunner.js';
import { BuildService } from '../build/buildService.js';
import { DistributionService } from '../build/distributionService.js';
import { ReleaseNotesService } from '../build/releaseNotes.js';
import { ProjectManifestSchema, type ProjectManifest } from '../config/projectManifest.js';
import type { ProjectRegistry } from '../registry/projectRegistry.js';
import type { GitService } from '../git/gitService.js';
import { createPairingCode, redeemPairingCode } from '../auth/store.js';
import { loadEnv } from '../config/env.js';
import { buildServer } from '../server.js';
import { RunService } from './runService.js';
import type { RunSessionEvent, RunSessionHandle, SpawnRunSession } from './runSession.js';

const manifest: ProjectManifest = ProjectManifestSchema.parse({
  id: 'hedged',
  path: '/p',
  flutter: 'fvm',
  build: { apk: 'fvm flutter build apk' },
  signing: { mode: 'in-repo' },
  git: { remote: 'origin', base: 'main' },
});

function fakeRegistry(): ProjectRegistry {
  const active = { manifest, resolvedPath: '/p', status: 'active' as const };
  return {
    getActive: (id: string) => (id === 'hedged' ? active : undefined),
    get: (id: string) => (id === 'hedged' ? active : undefined),
    list: () => [active],
  } as unknown as ProjectRegistry;
}

const fakeGit = { checkoutBranch: async () => {} } as unknown as GitService;

function makeFakeSpawn() {
  let onEvent: (e: RunSessionEvent) => void = () => {};
  let resolveExit!: (v: { code: number | null }) => void;
  const exited = new Promise<{ code: number | null }>((r) => {
    resolveExit = r;
  });
  const handle: RunSessionHandle = {
    reload: async () => ({ ok: true, code: 0, message: 'reloaded' }),
    restart: async () => ({ ok: true, code: 0, message: 'restarted' }),
    stop: async () => {
      resolveExit({ code: 0 });
      return { ok: true, code: null, message: null };
    },
    kill: () => resolveExit({ code: null }),
    get appId() {
      return 'a1';
    },
    exited,
  };
  const spawn: SpawnRunSession = (args) => {
    onEvent = args.onEvent;
    return handle;
  };
  return { spawn, emit: (e: RunSessionEvent) => onEvent(e) };
}

let db: Db;
let app: FastifyInstance;
let token: string;
let fake: ReturnType<typeof makeFakeSpawn>;
let runService: RunService;

beforeEach(async () => {
  db = openDb(':memory:');
  const registry = fakeRegistry();
  const tasks = new TaskStore(db);
  const events = new EventLog(db);
  const buildStore = new BuildStore(db);
  const buildLog = new BuildLog(db);
  tasks.create({ id: 't1', projectId: 'hedged', branch: 'claude/x', worktree: '/p' });
  fake = makeFakeSpawn();
  runService = new RunService({
    registry,
    runs: new RunStore(db),
    runLog: new RunLog(db),
    tasks,
    git: fakeGit,
    spawnRunSession: fake.spawn,
  });
  const env = loadEnv({});
  const runner = new AgentRunner({ registry, git: fakeGit, tasks, events, db });
  const builds = new BuildService({ registry, builds: buildStore, buildLog, tasks });
  const distribution = new DistributionService({
    registry,
    builds: buildStore,
    buildLog,
    advertiseUrl: env.advertiseUrl,
    downloadSecret: env.downloadSecret,
  });
  const releaseNotes = new ReleaseNotesService({ registry, tasks, git: fakeGit, query: null });
  const notifications = new NotificationService({
    store: new NotificationStore(db),
    tasks: runner,
    builds: { onEvent: () => () => {} },
    buildLookup: { get: () => undefined },
  });
  app = await buildServer({ env, registry, db, runner, tasks, events, git: fakeGit, builds, distribution, releaseNotes, notifications, runService });
  await app.ready();
  const { code } = createPairingCode(db);
  const r = redeemPairingCode(db, code, 'phone');
  token = r.ok ? r.token : '';
});

afterEach(async () => {
  await app.close();
  db.close();
});

const bearer = () => ({ authorization: `Bearer ${token}` });
const startRun = () =>
  app.inject({ method: 'POST', url: '/projects/hedged/runs', headers: bearer(), payload: { deviceSerial: '100.1.1.1:5555', taskId: 't1' } });

describe('run routes', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects/hedged/runs', payload: { deviceSerial: 'x:5555' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid body (400)', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects/hedged/runs', headers: bearer(), payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('starts a run (201) and refuses a second one (409)', async () => {
    const res = await startRun();
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('starting');

    const again = await startRun();
    expect(again.statusCode).toBe(409);
  });

  it('GET /runs/:id returns the row + log tail; unknown → 404', async () => {
    const id = (await startRun()).json().id as string;
    const res = await app.inject({ method: 'GET', url: `/runs/${id}`, headers: bearer() });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(id);
    expect(Array.isArray(res.json().lastLog)).toBe(true);

    const missing = await app.inject({ method: 'GET', url: '/runs/nope', headers: bearer() });
    expect(missing.statusCode).toBe(404);
  });

  it('lists a project\'s runs and replays logs', async () => {
    const id = (await startRun()).json().id as string;
    const list = await app.inject({ method: 'GET', url: '/projects/hedged/runs', headers: bearer() });
    expect(list.json().runs.map((r: { id: string }) => r.id)).toContain(id);

    const logs = await app.inject({ method: 'GET', url: `/runs/${id}/logs?since=0`, headers: bearer() });
    expect(logs.json().events.some((e: { type: string }) => e.type === 'run.created')).toBe(true);
  });

  it('hot reload returns the control result; unknown run → 404', async () => {
    const id = (await startRun()).json().id as string;
    fake.emit({ kind: 'started', appId: 'a1' });
    const res = await app.inject({ method: 'POST', url: `/runs/${id}/reload`, headers: bearer() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, code: 0, message: 'reloaded' });

    const missing = await app.inject({ method: 'POST', url: '/runs/nope/reload', headers: bearer() });
    expect(missing.statusCode).toBe(404);
  });

  it('stop ends the run (202) and the row becomes stopped', async () => {
    const id = (await startRun()).json().id as string;
    fake.emit({ kind: 'started', appId: 'a1' });
    const res = await app.inject({ method: 'POST', url: `/runs/${id}/stop`, headers: bearer() });
    expect(res.statusCode).toBe(202);
    await runService.whenSettled(id);
    const row = await app.inject({ method: 'GET', url: `/runs/${id}`, headers: bearer() });
    expect(row.json().status).toBe('stopped');
  });
});
