import { loadEnv } from './config/env.js';
import { loadProjectManifests } from './config/projectManifest.js';
import { openDb } from './db/db.js';
import { EventLog } from './db/eventLog.js';
import { TaskStore } from './db/taskStore.js';
import { BuildStore } from './db/buildStore.js';
import { BuildLog } from './db/buildLog.js';
import { RunStore } from './db/runStore.js';
import { RunLog } from './db/runLog.js';
import { GitService } from './git/gitService.js';
import { AgentRunner } from './agent/agentRunner.js';
import { BuildService, makeSpawnRunStep } from './build/buildService.js';
import { DistributionService } from './build/distributionService.js';
import { ReleaseNotesService } from './build/releaseNotes.js';
import { NotificationStore } from './db/notificationStore.js';
import { NotificationService } from './notify/notificationService.js';
import { ProjectRegistry } from './registry/projectRegistry.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const manifests = loadProjectManifests(env.projectsDir);
  const registry = new ProjectRegistry(manifests.values(), env.allowedRoots);
  const db = openDb(env.dbPath);
  const tasks = new TaskStore(db);
  const events = new EventLog(db);
  const buildStore = new BuildStore(db);
  const buildLog = new BuildLog(db);
  // Live-run session stores (S5-01). RunService (S5-03) will own the lifecycle; wired here so
  // the data layer and WS replay share the one db, like builds.
  const runStore = new RunStore(db);
  const runLog = new RunLog(db);
  const git = new GitService();
  const runner = new AgentRunner({
    registry,
    git,
    tasks,
    events,
    db,
    approvalTimeoutMs: env.approvalTimeoutMs,
    ...(env.sandboxEnabled ? {} : { sandbox: false as const }),
  });
  // Long jobs run under `caffeinate -i` so the Mac stays awake mid-build (S3-08).
  const runStep = makeSpawnRunStep({ caffeinate: env.caffeinate });
  const builds = new BuildService({ registry, builds: buildStore, buildLog, tasks, runStep, git });
  const distribution = new DistributionService({
    registry,
    builds: buildStore,
    buildLog,
    runStep,
    advertiseUrl: env.advertiseUrl,
    downloadSecret: env.downloadSecret,
  });
  const releaseNotes = new ReleaseNotesService({ registry, tasks, git });
  // Self-contained notifications (S3-05): derived from the existing task + build event streams.
  const notifications = new NotificationService({
    store: new NotificationStore(db),
    tasks: runner,
    builds: buildLog,
    buildLookup: buildStore,
  });

  const app = await buildServer({
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
    runs: runStore,
    runLog,
  });
  // Route runner + build logs through fastify's pino logger (same stream as HTTP logs).
  runner.setLogger(app.log.child({ mod: 'agent' }));
  builds.setLogger(app.log.child({ mod: 'build' }));
  distribution.setLogger(app.log.child({ mod: 'build' }));
  releaseNotes.setLogger(app.log.child({ mod: 'build' }));

  // Crash recovery (S4-02): fail any task left non-terminal by a previous crash/restart; they
  // can be resumed from their stored session id.
  const recovered = runner.recoverInterrupted();
  if (recovered > 0) app.log.warn({ recovered }, 'marked interrupted tasks failed on startup');

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.host, port: env.port });
  app.log.info(
    {
      host: env.host,
      port: env.port,
      projects: registry.list().map((p) => ({ id: p.manifest.id, status: p.status })),
    },
    'relayd listening',
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- startup failure before the logger exists
  console.error('relayd failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
