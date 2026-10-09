import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { z } from 'zod';
import type { DaemonEnv } from './config/env.js';
import { resolveBuildFlavor } from './guardrails.js';
import type { Db } from './db/db.js';
import { requireAuth } from './auth/middleware.js';
import {
  listDevices,
  pruneExpiredPairingCodes,
  redeemPairingCode,
  revokeDevice,
} from './auth/store.js';
import { PathNotAllowedError } from './fs/pathSafety.js';
import type { ProjectRegistry, RegisteredProject } from './registry/projectRegistry.js';
import type { AgentRunner } from './agent/agentRunner.js';
import type { TaskStore } from './db/taskStore.js';
import type { EventLog, StoredEvent } from './db/eventLog.js';

export interface ServerDeps {
  env: DaemonEnv;
  registry: ProjectRegistry;
  db: Db;
  runner: AgentRunner;
  tasks: TaskStore;
  events: EventLog;
}

/** Public, non-secret projection of a registered project for the /projects list. */
function projectSummary(p: RegisteredProject) {
  const m = p.manifest;
  return {
    id: m.id,
    displayName: m.displayName ?? m.id,
    status: p.status,
    reason: p.reason ?? null,
    flavorDefault: m.flavorDefault ?? null,
    allowedFlavors: m.allowedFlavors,
    base: m.git.base,
    remote: m.git.remote,
    hasDistribution: m.distribution.firebaseAppDistribution !== undefined,
  };
}

const PairBody = z.object({
  code: z.string().min(1),
  deviceName: z.string().min(1).max(100),
});

const RegisterProjectBody = z.object({
  path: z.string().min(1),
});

const CreateTaskBody = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  taskId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).optional(),
});

const EventsQuery = z.object({
  since: z.coerce.number().int().min(0).default(0),
});

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      // Never log tokens, keys, or file contents from secret paths (CLAUDE.md).
      redact: ['req.headers.authorization', 'req.body.code'],
    },
  });
  const auth = { preHandler: requireAuth(deps.db) };
  // Must finish registering before the websocket route is defined, otherwise its
  // onRoute hook misses the route and `{ websocket: true }` is silently ignored.
  await app.register(fastifyWebsocket);

  // --- Public routes -------------------------------------------------------

  app.get('/healthz', async () => ({ ok: true, projects: deps.registry.list().length }));

  app.post('/pair', async (req, reply) => {
    const parsed = PairBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    pruneExpiredPairingCodes(deps.db);
    const result = redeemPairingCode(deps.db, parsed.data.code, parsed.data.deviceName);
    if (!result.ok) {
      return reply.code(401).send({ error: `pairing ${result.reason}` });
    }
    return reply.code(201).send({ deviceId: result.deviceId, token: result.token });
  });

  // --- Authenticated routes ------------------------------------------------

  app.get('/projects', auth, async () => ({
    projects: deps.registry.list().map(projectSummary),
  }));

  // Validate a candidate repo path for registration. Enforces the path allowlist
  // (S1-03): a path outside the allowlist (or using `..`/symlink escape) is rejected.
  app.post('/projects', auth, async (req, reply) => {
    const parsed = RegisterProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    try {
      const { canonicalPath, isGitRepo } = deps.registry.validateRegistrablePath(parsed.data.path);
      return { ok: true, canonicalPath, isGitRepo };
    } catch (err) {
      if (err instanceof PathNotAllowedError) {
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get<{ Params: { id: string }; Querystring: { flavor?: string } }>(
    '/projects/:id/build-command',
    auth,
    async (req, reply) => {
      const project = deps.registry.get(req.params.id);
      if (!project) return reply.code(404).send({ error: 'unknown project' });
      if (project.status !== 'active') {
        return reply.code(409).send({ error: `project not active: ${project.reason ?? project.status}` });
      }
      try {
        const flavor = resolveBuildFlavor(project.manifest, req.query.flavor);
        const apk = project.manifest.build.apk.replaceAll('{flavor}', flavor);
        return { project: project.manifest.id, flavor, apk, executed: false };
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message });
      }
    },
  );

  // Create and start a task on a project (S1-05).
  app.post<{ Params: { id: string } }>('/projects/:id/tasks', auth, async (req, reply) => {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const project = deps.registry.get(req.params.id);
    if (!project) return reply.code(404).send({ error: 'unknown project' });
    if (project.status !== 'active') {
      return reply.code(409).send({ error: `project not active: ${project.reason ?? project.status}` });
    }
    const started = await deps.runner.start({
      projectId: req.params.id,
      prompt: parsed.data.prompt,
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
      ...(parsed.data.taskId !== undefined ? { taskId: parsed.data.taskId } : {}),
    });
    return reply.code(201).send(started);
  });

  app.get<{ Params: { id: string } }>('/tasks/:id', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    return task;
  });

  // Replay a task's events (S1-06 adds the WebSocket; this is the catch-up read).
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/tasks/:id/events',
    auth,
    async (req, reply) => {
      const task = deps.tasks.get(req.params.id);
      if (!task) return reply.code(404).send({ error: 'unknown task' });
      const q = EventsQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'invalid query', issues: q.error.issues });
      return { events: deps.events.since(req.params.id, q.data.since) };
    },
  );

  // Cancel a running task (S1-07). The runner interrupts the agent (SDK interrupt(),
  // falling back to aborting the process), which unwinds the run loop and emits
  // `task.cancelled` over the stream within a second or two.
  app.post<{ Params: { id: string } }>('/tasks/:id/cancel', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
      return reply.code(409).send({ error: `task already ${task.status}` });
    }
    const cancelling = await deps.runner.cancel(req.params.id);
    if (!cancelling) {
      // Non-terminal status but no live run (e.g. after a daemon restart). Proper
      // crash recovery is S4-02; for now report it rather than silently stranding it.
      return reply.code(409).send({ error: 'task is not running on this daemon' });
    }
    return reply.code(202).send({ status: 'cancelling' });
  });

  // Live event stream with replay (S1-06): replay everything after `since` from SQLite,
  // then tail live events. A reconnecting phone passes its last seen seq, so no events
  // are lost or duplicated across a disconnect. The whole setup below runs synchronously,
  // so no runner event can interleave between the DB replay and going live.
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/tasks/:id/stream',
    { websocket: true, preHandler: requireAuth(deps.db) },
    (socket, req) => {
      const taskId = req.params.id;
      if (!deps.tasks.get(taskId)) {
        socket.send(JSON.stringify({ type: 'stream.error', error: 'unknown task' }));
        socket.close(1008, 'unknown task');
        return;
      }
      const q = EventsQuery.safeParse(req.query);
      const since = q.success ? q.data.since : 0;

      let lastSent = since;
      let live = false;
      const buffered: StoredEvent[] = [];
      const send = (e: StoredEvent): void => {
        try {
          socket.send(
            JSON.stringify({ seq: e.seq, taskId: e.taskId, type: e.type, payload: e.payload, createdAt: e.createdAt }),
          );
        } catch {
          /* socket closed mid-send */
        }
      };

      // Subscribe BEFORE reading the DB so nothing emitted during replay is missed.
      const unsub = deps.runner.onEvent((e) => {
        if (e.taskId !== taskId) return;
        if (!live) {
          buffered.push(e);
          return;
        }
        if (e.seq > lastSent) {
          send(e);
          lastSent = e.seq;
        }
      });

      for (const e of deps.events.since(taskId, since)) {
        send(e);
        lastSent = e.seq;
      }
      live = true;
      for (const e of buffered) {
        if (e.seq > lastSent) {
          send(e);
          lastSent = e.seq;
        }
      }
      buffered.length = 0;
      socket.send(JSON.stringify({ type: 'stream.caughtup', lastSeq: lastSent }));

      socket.on('close', unsub);
      socket.on('error', unsub);
    },
  );

  app.get('/devices', auth, async () => ({ devices: listDevices(deps.db) }));

  app.post<{ Params: { id: string } }>('/devices/:id/revoke', auth, async (req, reply) => {
    const ok = revokeDevice(deps.db, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'unknown or already revoked device' });
    return { revoked: req.params.id };
  });

  return app;
}
