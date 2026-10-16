import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parseProjectManifest } from './config/projectManifest.js';
import { ProjectRegistry } from './registry/projectRegistry.js';
import { GitService, runGit } from './git/gitService.js';
import { openDb, type Db } from './db/db.js';
import { EventLog } from './db/eventLog.js';
import { TaskStore } from './db/taskStore.js';
import { BuildStore } from './db/buildStore.js';
import { BuildLog } from './db/buildLog.js';
import { RunStore } from './db/runStore.js';
import { RunLog } from './db/runLog.js';
import { NotificationStore } from './db/notificationStore.js';
import { NotificationService } from './notify/notificationService.js';
import { AgentRunner } from './agent/agentRunner.js';
import { BuildService } from './build/buildService.js';
import { DistributionService } from './build/distributionService.js';
import { ReleaseNotesService } from './build/releaseNotes.js';
import { RunService } from './run/runService.js';
import { DeviceService } from './run/deviceService.js';
import { createPairingCode, redeemPairingCode } from './auth/store.js';
import { loadEnv } from './config/env.js';
import { buildServer } from './server.js';

function manifestYaml(repo: string): string {
  return `
id: hedged
path: "${repo}"
build:
  apk: "fvm flutter build apk"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`;
}

let repo: string;
let db: Db;
let app: FastifyInstance;
let token: string;

beforeEach(async () => {
  repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-fw-')));
  await runGit(repo, ['init', '-b', 'stag']);
  writeFileSync(join(repo, 'README.md'), '# base\n');
  await runGit(repo, ['add', 'README.md']);
  await runGit(repo, ['-c', 'user.email=t@t', '-c', 'user.name=Test', 'commit', '-m', 'init']);
  await runGit(repo, ['checkout', '-b', 'claude/x']);

  db = openDb(join(repo, 'data', 'test.sqlite'));
  const tasks = new TaskStore(db);
  const events = new EventLog(db);
  const buildStore = new BuildStore(db);
  const buildLog = new BuildLog(db);
  const git = new GitService();
  const registry = new ProjectRegistry([parseProjectManifest(manifestYaml(repo), 'hedged.yaml')], [repo], {});
  const env = loadEnv({});
  const runner = new AgentRunner({ registry, git, tasks, events, db });
  const builds = new BuildService({ registry, builds: buildStore, buildLog, tasks });
  const distribution = new DistributionService({
    registry,
    builds: buildStore,
    buildLog,
    advertiseUrl: env.advertiseUrl,
    downloadSecret: env.downloadSecret,
  });
  const releaseNotes = new ReleaseNotesService({ registry, tasks, git, query: null });
  const notifications = new NotificationService({
    store: new NotificationStore(db),
    tasks: runner,
    builds: { onEvent: () => () => {} },
    buildLookup: { get: () => undefined },
  });
  const runService = new RunService({ registry, runs: new RunStore(db), runLog: new RunLog(db), tasks });
  app = await buildServer({
    env, registry, db, runner, tasks, events, git, builds, distribution, releaseNotes, notifications,
    runService, deviceService: new DeviceService({ registry }),
  });
  await app.ready();

  tasks.create({ id: 't1', projectId: 'hedged', branch: 'claude/x', worktree: repo });
  const { code } = createPairingCode(db);
  const r = redeemPairingCode(db, code, 'phone');
  token = r.ok ? r.token : '';
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(repo, { recursive: true, force: true });
});

const bearer = () => ({ authorization: `Bearer ${token}` });

describe('POST /tasks/:id/file (S5-12 manual write)', () => {
  it('writes a file to the task checkout when its branch is checked out', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/t1/file',
      headers: bearer(),
      payload: { path: 'lib/edited.dart', content: 'void main() {}\n' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, path: 'lib/edited.dart', reloadTriggered: false });
    expect(readFileSync(join(repo, 'lib/edited.dart'), 'utf8')).toBe('void main() {}\n');
  });

  it('rejects a path escaping the project (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/t1/file',
      headers: bearer(),
      payload: { path: '../escape.dart', content: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses to write when the task branch is not checked out (409)', async () => {
    await runGit(repo, ['checkout', 'stag']);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/t1/file',
      headers: bearer(),
      payload: { path: 'lib/edited.dart', content: 'x' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('requires auth and a valid body', async () => {
    expect((await app.inject({ method: 'POST', url: '/tasks/t1/file', payload: {} })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/t1/file', headers: bearer(), payload: {} })).statusCode,
    ).toBe(400);
  });
});
