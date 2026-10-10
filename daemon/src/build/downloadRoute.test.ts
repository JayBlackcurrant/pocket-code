import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env.js';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from '../registry/projectRegistry.js';
import { openDb, type Db } from '../db/db.js';
import { EventLog } from '../db/eventLog.js';
import { TaskStore } from '../db/taskStore.js';
import { BuildStore } from '../db/buildStore.js';
import { BuildLog } from '../db/buildLog.js';
import { NotificationStore } from '../db/notificationStore.js';
import { NotificationService } from '../notify/notificationService.js';
import { AgentRunner } from '../agent/agentRunner.js';
import { GitService } from '../git/gitService.js';
import { BuildService } from './buildService.js';
import { DistributionService } from './distributionService.js';
import { ReleaseNotesService } from './releaseNotes.js';
import { signDownloadToken } from './downloadToken.js';
import { buildServer } from '../server.js';

const DL_SECRET = 'download-route-test-secret-01';
const ADVERTISE_URL = 'https://mac.tail1234.ts.net';

function manifestYaml(repoPath: string): string {
  return `
id: hedged
path: ${repoPath}
flavorDefault: staging
allowedFlavors: [staging]
build:
  apk: "x {flavor}"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
distribution:
  tailscaleServe:
    linkTtlMinutes: 10080
`;
}

let repo: string;
let db: Db;
let store: BuildStore;
let app: FastifyInstance;

beforeEach(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'pc-dl-')));
  db = openDb(join(repo, 'data', 'test.sqlite'));
  store = new BuildStore(db);
  const buildLog = new BuildLog(db);
  const tasks = new TaskStore(db);
  const events = new EventLog(db);
  const git = new GitService();
  const registry = new ProjectRegistry([parseProjectManifest(manifestYaml(repo), 'test')], [repo], {});
  const env = loadEnv({ RELAYD_DOWNLOAD_SECRET: DL_SECRET, RELAYD_ADVERTISE_URL: ADVERTISE_URL });
  const runner = new AgentRunner({ registry, git, tasks, events, db });
  const builds = new BuildService({ registry, builds: store, buildLog, tasks });
  const distribution = new DistributionService({
    registry,
    builds: store,
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
  app = await buildServer({
    env,
    registry,
    db,
    runner,
    tasks,
    events,
    git,
    builds,
    distribution,
    releaseNotes,
    notifications,
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(repo, { recursive: true, force: true });
});

/** A succeeded build with an APK file on disk. */
function succeededBuild(id = 'b1', bytes = 'APKBYTES'): void {
  store.create({ id, projectId: 'hedged', cwd: repo });
  const apk = join(repo, `${id}.apk`);
  writeFileSync(apk, bytes);
  store.markSucceeded(id, apk);
}

describe('GET /builds/:id/apk (tailscale-served download, no bearer)', () => {
  it('streams the APK with a valid signed token', async () => {
    succeededBuild('b1', 'HELLOAPK');
    const t = signDownloadToken(DL_SECRET, 'b1', Date.now() + 60_000);
    const res = await app.inject({ method: 'GET', url: `/builds/b1/apk?t=${encodeURIComponent(t)}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.android.package-archive');
    expect(res.headers['content-disposition']).toContain('b1.apk');
    expect(res.body).toBe('HELLOAPK');
  });

  it('rejects a bad/expired token with 403 (before touching the build)', async () => {
    succeededBuild('b1');
    const expired = signDownloadToken(DL_SECRET, 'b1', Date.now() - 1);
    expect((await app.inject({ method: 'GET', url: `/builds/b1/apk?t=${expired}` })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/builds/b1/apk?t=nope` })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/builds/b1/apk` })).statusCode).toBe(403);
  });

  it('returns 404 for a validly-signed token whose build has no artifact', async () => {
    // Signed for a build that does not exist.
    const t = signDownloadToken(DL_SECRET, 'ghost', Date.now() + 60_000);
    expect((await app.inject({ method: 'GET', url: `/builds/ghost/apk?t=${t}` })).statusCode).toBe(404);

    // Build exists but its artifact file is gone.
    store.create({ id: 'b2', projectId: 'hedged', cwd: repo });
    store.markSucceeded('b2', join(repo, 'missing.apk'));
    const t2 = signDownloadToken(DL_SECRET, 'b2', Date.now() + 60_000);
    expect((await app.inject({ method: 'GET', url: `/builds/b2/apk?t=${t2}` })).statusCode).toBe(404);
  });
});
