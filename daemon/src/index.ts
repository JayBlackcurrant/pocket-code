import { loadEnv } from './config/env.js';
import { loadProjectManifests } from './config/projectManifest.js';
import { openDb } from './db/db.js';
import { EventLog } from './db/eventLog.js';
import { TaskStore } from './db/taskStore.js';
import { GitService } from './git/gitService.js';
import { AgentRunner } from './agent/agentRunner.js';
import { ProjectRegistry } from './registry/projectRegistry.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const manifests = loadProjectManifests(env.projectsDir);
  const registry = new ProjectRegistry(manifests.values(), env.allowedRoots);
  const db = openDb(env.dbPath);
  const tasks = new TaskStore(db);
  const events = new EventLog(db);
  const runner = new AgentRunner({
    registry,
    git: new GitService(),
    tasks,
    events,
    db,
    ...(env.sandboxEnabled ? {} : { sandbox: false as const }),
  });

  const app = await buildServer({ env, registry, db, runner, tasks, events });

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
