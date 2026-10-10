import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
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
import {
  readFileSafe,
  listDir,
  searchFiles,
  FileNotFoundError,
  NotAFileError,
  NotADirectoryError,
} from './fs/fileReader.js';
import type { ProjectRegistry, RegisteredProject } from './registry/projectRegistry.js';
import type { AgentRunner } from './agent/agentRunner.js';
import type { TaskStore } from './db/taskStore.js';
import type { EventLog, StoredEvent } from './db/eventLog.js';
import { GitError, type GitService } from './git/gitService.js';
import { branchBlockedReason, GuardrailError } from './guardrails.js';
import { BuildService, BuildError } from './build/buildService.js';
import { DistributionService, DistributionError } from './build/distributionService.js';
import { verifyDownloadToken } from './build/downloadToken.js';
import { ReleaseNotesService, ReleaseNotesError } from './build/releaseNotes.js';
import type { StoredBuildEvent } from './db/buildLog.js';
import type { NotificationService } from './notify/notificationService.js';
import type { NotificationRow } from './db/notificationStore.js';

export interface ServerDeps {
  env: DaemonEnv;
  registry: ProjectRegistry;
  db: Db;
  runner: AgentRunner;
  tasks: TaskStore;
  events: EventLog;
  git: GitService;
  builds: BuildService;
  distribution: DistributionService;
  releaseNotes: ReleaseNotesService;
  notifications: NotificationService;
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
    hasDistribution:
      m.distribution.firebaseAppDistribution !== undefined ||
      m.distribution.tailscaleServe !== undefined,
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

const DecisionBody = z.object({
  decision: z.enum(['allow', 'deny']),
  reason: z.string().max(2000).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

const DiffQuery = z.object({ path: z.string().min(1) });
const CommitBody = z.object({ message: z.string().min(1).max(2000).optional() });
const RevertBody = z.object({ path: z.string().min(1) });

const CreateBuildBody = z.object({
  flavor: z.string().min(1).max(100).optional(),
  taskId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).optional(),
  runCodegen: z.boolean().optional(),
});

const UploadBuildBody = z.object({
  releaseNotes: z.string().max(20_000).optional(),
  groups: z.array(z.string().min(1).max(200)).max(50).optional(),
});

const BuildTailQuery = z.object({
  tail: z.coerce.number().int().min(0).max(500).default(20),
});

const MarkReadBody = z.object({ upTo: z.coerce.number().int().min(0) });

/** Base ref to diff a task against: its project's manifest git.base. */
function taskBaseRef(deps: ServerDeps, projectId: string): string | undefined {
  return deps.registry.get(projectId)?.manifest.git.base;
}

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

  // Browse a project's files: list one directory (path-safe), folders expand on demand.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/projects/:id/tree',
    auth,
    async (req, reply) => {
      const project = deps.registry.getActive(req.params.id);
      if (!project?.resolvedPath) return reply.code(409).send({ error: 'project not active' });
      try {
        return { entries: listDir(project.resolvedPath, req.query.path ?? '') };
      } catch (err) {
        if (err instanceof PathNotAllowedError) return reply.code(403).send({ error: err.message });
        if (err instanceof FileNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof NotADirectoryError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );

  // Search project files for @-mention autocomplete (q may be empty for top results).
  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    '/projects/:id/search',
    auth,
    async (req, reply) => {
      const project = deps.registry.getActive(req.params.id);
      if (!project?.resolvedPath) return reply.code(409).send({ error: 'project not active' });
      const q = (req.query.q ?? '').slice(0, 200);
      return { matches: searchFiles(project.resolvedPath, q) };
    },
  );

  // Read one file from a project (path-safe), for the project browser.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/projects/:id/files',
    auth,
    async (req, reply) => {
      const project = deps.registry.getActive(req.params.id);
      if (!project?.resolvedPath) return reply.code(409).send({ error: 'project not active' });
      const q = DiffQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'path is required' });
      try {
        return readFileSafe(project.resolvedPath, q.data.path);
      } catch (err) {
        if (err instanceof PathNotAllowedError) return reply.code(403).send({ error: err.message });
        if (err instanceof FileNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof NotAFileError) return reply.code(400).send({ error: err.message });
        throw err;
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

  // Changed-files summary for a task's worktree vs the project base (S2-05).
  app.get<{ Params: { id: string } }>('/tasks/:id/diff/summary', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
    const base = taskBaseRef(deps, task.projectId);
    if (!base) return reply.code(409).send({ error: 'unknown project base' });
    try {
      const files = await deps.git.diffSummary(task.worktree, base);
      return { base, files };
    } catch (err) {
      if (err instanceof GitError) return reply.code(500).send({ error: err.message });
      throw err;
    }
  });

  // One file's unified patch (S2-05), size-capped.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/tasks/:id/diff',
    auth,
    async (req, reply) => {
      const task = deps.tasks.get(req.params.id);
      if (!task) return reply.code(404).send({ error: 'unknown task' });
      if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
      const q = DiffQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'path is required' });
      const base = taskBaseRef(deps, task.projectId);
      if (!base) return reply.code(409).send({ error: 'unknown project base' });
      try {
        return await deps.git.diffFile(task.worktree, base, q.data.path);
      } catch (err) {
        if (err instanceof PathNotAllowedError) return reply.code(403).send({ error: err.message });
        if (err instanceof GitError) return reply.code(500).send({ error: err.message });
        throw err;
      }
    },
  );

  // Read one file from the task worktree (S2-06): read-only, path-safe.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/tasks/:id/files',
    auth,
    async (req, reply) => {
      const task = deps.tasks.get(req.params.id);
      if (!task) return reply.code(404).send({ error: 'unknown task' });
      if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
      const q = DiffQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'path is required' });
      try {
        return readFileSafe(task.worktree, q.data.path);
      } catch (err) {
        if (err instanceof PathNotAllowedError) return reply.code(403).send({ error: err.message });
        if (err instanceof FileNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof NotAFileError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );

  // Pending tool-permission requests for a task (S2-01) — e.g. after reconnect.
  app.get<{ Params: { id: string } }>('/tasks/:id/permissions', auth, async (req, reply) => {
    if (!deps.tasks.get(req.params.id)) return reply.code(404).send({ error: 'unknown task' });
    return { pending: deps.runner.listPendingPermissions(req.params.id) };
  });

  // Approve or deny a parked tool call (S2-01). Resolves the agent's canUseTool promise.
  app.post<{ Params: { id: string; toolUseId: string } }>(
    '/tasks/:id/permissions/:toolUseId',
    auth,
    async (req, reply) => {
      if (!deps.tasks.get(req.params.id)) return reply.code(404).send({ error: 'unknown task' });
      const parsed = DecisionBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
      }
      const ok = deps.runner.decidePermission(req.params.id, req.params.toolUseId, {
        allow: parsed.data.decision === 'allow',
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
        ...(parsed.data.input !== undefined ? { input: parsed.data.input } : {}),
      });
      if (!ok) return reply.code(404).send({ error: 'no pending permission with that id' });
      return { decided: parsed.data.decision };
    },
  );

  // --- Git actions (S2-09) ---------------------------------------------------

  // Suggested commit message (editable in the app).
  app.get<{ Params: { id: string } }>('/tasks/:id/commit-message', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
    const base = taskBaseRef(deps, task.projectId);
    if (!base) return reply.code(409).send({ error: 'unknown project base' });
    return { message: await deps.git.suggestCommitMessage(task.worktree, base) };
  });

  // Suggested tester-facing release notes (S3-03), editable in the app before upload.
  // Asks the task's own Claude session for ≤8 bullets, falling back to diff-derived notes.
  app.get<{ Params: { id: string } }>('/tasks/:id/release-notes', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
    try {
      return await deps.releaseNotes.generate(req.params.id);
    } catch (err) {
      if (err instanceof ReleaseNotesError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Commit all changes with a (Claude/user) message.
  app.post<{ Params: { id: string } }>('/tasks/:id/commit', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
    const base = taskBaseRef(deps, task.projectId);
    if (!base) return reply.code(409).send({ error: 'unknown project base' });
    const parsed = CommitBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const message = parsed.data.message ?? (await deps.git.suggestCommitMessage(task.worktree, base));
    try {
      return await deps.git.commitAll(task.worktree, message);
    } catch (err) {
      if (err instanceof GitError && err.message === 'nothing to commit') {
        return reply.code(409).send({ error: 'nothing to commit' });
      }
      if (err instanceof GitError) return reply.code(500).send({ error: err.message });
      throw err;
    }
  });

  // Revert one file's changes.
  app.post<{ Params: { id: string } }>('/tasks/:id/revert', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree) return reply.code(409).send({ error: 'task has no worktree yet' });
    const parsed = RevertBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'path is required' });
    try {
      await deps.git.revertFile(task.worktree, parsed.data.path);
      return { reverted: parsed.data.path };
    } catch (err) {
      if (err instanceof PathNotAllowedError) return reply.code(403).send({ error: err.message });
      if (err instanceof GitError) return reply.code(500).send({ error: err.message });
      throw err;
    }
  });

  // Push the task's claude/* branch to its remote (never main; the daemon pushes).
  app.post<{ Params: { id: string } }>('/tasks/:id/push', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    if (!task.worktree || !task.branch) return reply.code(409).send({ error: 'task has no branch yet' });
    const project = deps.registry.get(task.projectId);
    if (!project) return reply.code(409).send({ error: 'unknown project' });
    const blocked = branchBlockedReason(project.manifest, task.branch);
    if (blocked) return reply.code(409).send({ error: blocked });
    try {
      await deps.git.pushBranch(task.worktree, project.manifest.git.remote, task.branch);
      return { pushed: true, branch: task.branch, remote: project.manifest.git.remote };
    } catch (err) {
      if (err instanceof GitError) return reply.code(500).send({ error: err.message });
      throw err;
    }
  });

  // Discard a task: cancel if running, remove the worktree + branch, mark discarded.
  app.post<{ Params: { id: string } }>('/tasks/:id/discard', auth, async (req, reply) => {
    const task = deps.tasks.get(req.params.id);
    if (!task) return reply.code(404).send({ error: 'unknown task' });
    const project = deps.registry.getActive(task.projectId);
    if (!project?.resolvedPath) return reply.code(409).send({ error: 'project not active' });
    await deps.runner.cancel(task.id);
    try {
      await deps.git.removeWorktree(project.resolvedPath, task.id);
    } catch (err) {
      if (!(err instanceof GitError)) throw err;
      // Worktree may already be gone; discard is best-effort.
    }
    deps.tasks.setStatus(task.id, 'discarded');
    return { discarded: task.id };
  });

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

  // --- Builds (S3-01) --------------------------------------------------------

  // Queue a build for a project (optionally a task's reviewed worktree). One build runs
  // at a time; the staging-only flavor guardrail is enforced before the build is created.
  app.post<{ Params: { id: string } }>('/projects/:id/builds', auth, async (req, reply) => {
    const parsed = CreateBuildBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const project = deps.registry.get(req.params.id);
    if (!project) return reply.code(404).send({ error: 'unknown project' });
    if (project.status !== 'active') {
      return reply.code(409).send({ error: `project not active: ${project.reason ?? project.status}` });
    }
    try {
      const build = deps.builds.enqueue({
        projectId: req.params.id,
        ...(parsed.data.flavor !== undefined ? { flavor: parsed.data.flavor } : {}),
        ...(parsed.data.taskId !== undefined ? { taskId: parsed.data.taskId } : {}),
        ...(parsed.data.runCodegen !== undefined ? { runCodegen: parsed.data.runCodegen } : {}),
      });
      return reply.code(201).send(build);
    } catch (err) {
      if (err instanceof GuardrailError || err instanceof BuildError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // Builds for a project, newest first.
  app.get<{ Params: { id: string } }>('/projects/:id/builds', auth, async (req, reply) => {
    const project = deps.registry.get(req.params.id);
    if (!project) return reply.code(404).send({ error: 'unknown project' });
    return { builds: deps.builds.listForProject(req.params.id) };
  });

  // One build's status, plus the tail of its log so a failed build can show the reason
  // (build.error / upload_error on the row) alongside its last lines (S3-04). `tail=0`
  // omits the lines.
  app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
    '/builds/:id',
    auth,
    async (req, reply) => {
      const build = deps.builds.get(req.params.id);
      if (!build) return reply.code(404).send({ error: 'unknown build' });
      const t = BuildTailQuery.safeParse(req.query);
      const tail = t.success ? t.data.tail : 20;
      const lastLog = tail > 0 ? deps.builds.lastLogLines(req.params.id, tail) : [];
      return { ...build, lastLog };
    },
  );

  // Retry a finished build: queue a new build with the same settings (S3-04).
  app.post<{ Params: { id: string } }>('/builds/:id/retry', auth, async (req, reply) => {
    if (!deps.builds.get(req.params.id)) return reply.code(404).send({ error: 'unknown build' });
    try {
      const build = deps.builds.retry(req.params.id);
      return reply.code(201).send(build);
    } catch (err) {
      if (err instanceof GuardrailError || err instanceof BuildError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // Replay a build's log (catch-up read; the WebSocket below tails it live).
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/builds/:id/logs',
    auth,
    async (req, reply) => {
      if (!deps.builds.get(req.params.id)) return reply.code(404).send({ error: 'unknown build' });
      const q = EventsQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'invalid query', issues: q.error.issues });
      return { events: deps.builds.logsSince(req.params.id, q.data.since) };
    },
  );

  // Cancel a queued or running build.
  app.post<{ Params: { id: string } }>('/builds/:id/cancel', auth, async (req, reply) => {
    const build = deps.builds.get(req.params.id);
    if (!build) return reply.code(404).send({ error: 'unknown build' });
    const cancelling = deps.builds.cancel(req.params.id);
    if (!cancelling) return reply.code(409).send({ error: `build already ${build.status}` });
    return reply.code(202).send({ status: 'cancelling' });
  });

  // Upload a succeeded build to Firebase App Distribution (S3-02). Guardrail-checked; the
  // upload streams into the same build log, so watch /builds/:id/stream for progress.
  app.post<{ Params: { id: string } }>('/builds/:id/upload', auth, async (req, reply) => {
    const parsed = UploadBuildBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    if (!deps.builds.get(req.params.id)) return reply.code(404).send({ error: 'unknown build' });
    try {
      deps.distribution.upload(req.params.id, {
        ...(parsed.data.releaseNotes !== undefined ? { releaseNotes: parsed.data.releaseNotes } : {}),
        ...(parsed.data.groups !== undefined ? { groups: parsed.data.groups } : {}),
      });
      return reply.code(202).send({ status: 'uploading' });
    } catch (err) {
      if (err instanceof DistributionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Download a build's APK via a signed, time-limited link (tailscaleServe distribution).
  // Deliberately NOT behind `auth`: a tester opens this in a browser, which has no bearer token.
  // The `t` token (HMAC over buildId+expiry, signed by the daemon) gates access, and exposure is
  // tailnet-only via `tailscale serve` (never a public Funnel). The artifact path is daemon-
  // produced, not client input.
  app.get<{ Params: { id: string }; Querystring: { t?: string } }>(
    '/builds/:id/apk',
    async (req, reply) => {
      if (!verifyDownloadToken(deps.env.downloadSecret, req.params.id, req.query.t ?? '')) {
        return reply.code(403).send({ error: 'invalid or expired download token' });
      }
      const build = deps.builds.get(req.params.id);
      if (!build || !build.artifact || !existsSync(build.artifact)) {
        return reply.code(404).send({ error: 'no downloadable artifact for this build' });
      }
      reply.header('Content-Type', 'application/vnd.android.package-archive');
      reply.header('Content-Disposition', `attachment; filename="${basename(build.artifact)}"`);
      return reply.send(createReadStream(build.artifact));
    },
  );

  // Live build log with replay (same shape as the task stream): replay everything after
  // `since` from SQLite, then tail live. A reconnecting phone passes its last seen seq.
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/builds/:id/stream',
    { websocket: true, preHandler: requireAuth(deps.db) },
    (socket, req) => {
      const buildId = req.params.id;
      if (!deps.builds.get(buildId)) {
        socket.send(JSON.stringify({ type: 'stream.error', error: 'unknown build' }));
        socket.close(1008, 'unknown build');
        return;
      }
      const q = EventsQuery.safeParse(req.query);
      const since = q.success ? q.data.since : 0;

      let lastSent = since;
      let live = false;
      const buffered: StoredBuildEvent[] = [];
      const send = (e: StoredBuildEvent): void => {
        try {
          socket.send(
            JSON.stringify({ seq: e.seq, buildId: e.buildId, type: e.type, payload: e.payload, createdAt: e.createdAt }),
          );
        } catch {
          /* socket closed mid-send */
        }
      };

      // Subscribe BEFORE reading the DB so nothing emitted during replay is missed.
      const unsub = deps.builds.onEvent((e) => {
        if (e.buildId !== buildId) return;
        if (!live) {
          buffered.push(e);
          return;
        }
        if (e.seq > lastSent) {
          send(e);
          lastSent = e.seq;
        }
      });

      for (const e of deps.builds.logsSince(buildId, since)) {
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

  // --- Notifications (S3-05) --------------------------------------------------

  // Recent notifications + unread count (for the inbox). Self-contained: derived by the
  // daemon from task/build/upload outcomes; no external push service.
  app.get('/notifications', auth, async () => ({
    notifications: deps.notifications.recent(),
    unread: deps.notifications.unreadCount(),
  }));

  // Mark everything up to a seq as read.
  app.post('/notifications/read', auth, async (req, reply) => {
    const parsed = MarkReadBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    deps.notifications.markReadUpTo(parsed.data.upTo);
    return { ok: true, unread: deps.notifications.unreadCount() };
  });

  // Live notifications with replay: replay everything after `since`, then tail live. A phone
  // that was off the tailnet catches up on reconnect by passing its last seen seq.
  app.get<{ Querystring: { since?: string } }>(
    '/notifications/stream',
    { websocket: true, preHandler: requireAuth(deps.db) },
    (socket, req) => {
      const q = EventsQuery.safeParse(req.query);
      const since = q.success ? q.data.since : 0;

      let lastSent = since;
      let live = false;
      const buffered: NotificationRow[] = [];
      const send = (n: NotificationRow): void => {
        try {
          socket.send(JSON.stringify(n));
        } catch {
          /* socket closed mid-send */
        }
      };

      const unsub = deps.notifications.onEvent((n) => {
        if (!live) {
          buffered.push(n);
          return;
        }
        if (n.seq > lastSent) {
          send(n);
          lastSent = n.seq;
        }
      });

      for (const n of deps.notifications.since(since)) {
        send(n);
        lastSent = n.seq;
      }
      live = true;
      for (const n of buffered) {
        if (n.seq > lastSent) {
          send(n);
          lastSent = n.seq;
        }
      }
      buffered.length = 0;
      socket.send(JSON.stringify({ type: 'stream.caughtup', lastSeq: lastSent }));

      socket.on('close', unsub);
      socket.on('error', unsub);
    },
  );

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
