import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { parseProjectManifest } from './config/projectManifest.js';
import { ProjectRegistry } from './registry/projectRegistry.js';
import { GitService, runGit } from './git/gitService.js';
import { openDb, type Db } from './db/db.js';
import { EventLog } from './db/eventLog.js';
import { TaskStore } from './db/taskStore.js';
import { AgentRunner, type QueryFn } from './agent/agentRunner.js';
import { createPairingCode, redeemPairingCode } from './auth/store.js';
import { buildServer } from './server.js';
import { loadEnv } from './config/env.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function msg(type: string, extra: Record<string, unknown> = {}): SDKMessage {
  return { type, session_id: 'sess-1', ...extra } as unknown as SDKMessage;
}

/** Fake query that yields messages with a delay between each (to stream over time). */
function delayedQuery(messages: SDKMessage[], delayMs: number): QueryFn {
  return () => {
    const gen = (async function* () {
      for (const m of messages) {
        await sleep(delayMs);
        yield m;
      }
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => undefined;
    return q;
  };
}

/** Fake query that yields one message then blocks until the run is aborted. */
function cancellableQuery(): QueryFn {
  return ({ options }) => {
    const signal = options?.abortController?.signal;
    const gen = (async function* () {
      yield msg('system', { subtype: 'init' });
      await new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new Error('aborted');
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => {
      throw new Error('interrupt unsupported in single-shot');
    };
    return q;
  };
}

/** Fake query that requests tool permission via canUseTool, then reports the outcome. */
function canUseToolQuery(): QueryFn {
  return ({ options }) => {
    const gen = (async function* () {
      yield msg('system', { subtype: 'init' });
      const res = await options!.canUseTool!('Bash', { command: 'ls' }, {
        toolUseID: 'tu1',
        signal: options!.abortController!.signal,
      } as never);
      yield msg('assistant', {
        message: {
          content: [{ type: 'text', text: res.behavior }],
        },
      });
      yield msg('result', { subtype: 'success', is_error: false, total_cost_usd: 0.01 });
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => undefined;
    return q;
  };
}

async function rebuildWith(query: QueryFn): Promise<string> {
  await app.close();
  const tasks = new TaskStore(db);
  runner = new AgentRunner({ registry, git: new GitService(), tasks, events, db, query });
  app = await buildServer({ env: loadEnv({}), registry, db, runner, tasks, events, git: new GitService() });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
  const { code } = createPairingCode(db);
  const r = redeemPairingCode(db, code, 't');
  return r.ok ? r.token : '';
}

interface Client {
  socket: WebSocket;
  messages: Array<Record<string, any>>;
  waitFor: (pred: (m: Array<Record<string, any>>) => boolean, timeout?: number) => Promise<void>;
  eventSeqs: () => number[];
}

function connect(port: number, token: string, taskId: string, since: number): Client {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/tasks/${taskId}/stream?since=${since}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const messages: Array<Record<string, any>> = [];
  const waiters = new Set<() => void>();
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
    for (const w of waiters) w();
  });
  const waitFor: Client['waitFor'] = (pred, timeout = 3000) =>
    new Promise<void>((resolve, reject) => {
      const check = () => {
        if (pred(messages)) {
          cleanup();
          resolve();
        }
      };
      const to = setTimeout(() => {
        cleanup();
        reject(new Error('timeout; got ' + JSON.stringify(messages.map((m) => m.type))));
      }, timeout);
      const w = () => check();
      const cleanup = () => {
        clearTimeout(to);
        waiters.delete(w);
      };
      waiters.add(w);
      check();
    });
  return {
    socket,
    messages,
    waitFor,
    eventSeqs: () => messages.filter((m) => typeof m.seq === 'number').map((m) => m.seq as number),
  };
}

let repo: string;
let registry: ProjectRegistry;

beforeAll(async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-stream-')));
  repo = join(base, 'hedged');
  mkdirSync(repo, { recursive: true });
  await runGit(repo, ['init', '-b', 'stag']);
  writeFileSync(join(repo, 'README.md'), '# base\n');
  await runGit(repo, ['add', 'README.md']);
  await runGit(repo, ['-c', 'user.email=t@t', '-c', 'user.name=Test', 'commit', '-m', 'init']);
  const manifest = parseProjectManifest(
    `
id: hedged
path: "${repo}"
flavorDefault: staging
allowedFlavors: [staging]
build:
  apk: "x {flavor}"
signing:
  mode: in-repo
git:
  remote: origin
  base: stag
`,
    'hedged.yaml',
  );
  registry = new ProjectRegistry([manifest], [base], {});
});

afterAll(() => rmSync(join(repo, '..'), { recursive: true, force: true }));

let db: Db;
let app: FastifyInstance;
let port: number;
let token: string;
let runner: AgentRunner;
let events: EventLog;

beforeEach(async () => {
  db = openDb(':memory:');
  const tasks = new TaskStore(db);
  events = new EventLog(db);
  runner = new AgentRunner({ registry, git: new GitService(), tasks, events, db, query: delayedQuery([], 0) });
  app = await buildServer({ env: loadEnv({}), registry, db, runner, tasks, events, git: new GitService() });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
  const { code } = createPairingCode(db);
  const redeemed = redeemPairingCode(db, code, 'test');
  if (!redeemed.ok) throw new Error('pairing failed');
  token = redeemed.token;
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe('WS /tasks/:id/stream', () => {
  it('replays only events after `since`', async () => {
    runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks: new TaskStore(db),
      events,
      query: delayedQuery([msg('system', { subtype: 'init' }), msg('assistant', { message: {} }), msg('result', { subtype: 'success', is_error: false, total_cost_usd: 0.01 })], 0),
    });
    // rebuild server with this runner
    await app.close();
    const tasks = new TaskStore(db);
    app = await buildServer({ env: loadEnv({}), registry, db, runner, tasks, events, git: new GitService() });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
    const { code } = createPairingCode(db);
    const r = redeemPairingCode(db, code, 't');
    token = r.ok ? r.token : '';

    const started = await runner.start({ projectId: 'hedged', prompt: 'replay' });
    await runner.whenSettled(started.taskId);

    const full = connect(port, token, started.taskId, 0);
    await full.waitFor((m) => m.some((x) => x.type === 'stream.caughtup'));
    const allSeqs = full.eventSeqs();
    expect(allSeqs.length).toBeGreaterThanOrEqual(6); // created, started, system.init, assistant, result, completed
    full.socket.close();

    // Reconnect from the 3rd event's seq → only later events return.
    const since = allSeqs[2]!;
    const tail = connect(port, token, started.taskId, since);
    await tail.waitFor((m) => m.some((x) => x.type === 'stream.caughtup'));
    expect(tail.eventSeqs().every((s) => s > since)).toBe(true);
    expect(tail.eventSeqs()).toEqual(allSeqs.filter((s) => s > since));
    tail.socket.close();
  });

  it('loses no events across a kill + reconnect mid-stream', async () => {
    const messages = [
      msg('system', { subtype: 'init' }),
      msg('assistant', { message: { n: 1 } }),
      msg('assistant', { message: { n: 2 } }),
      msg('assistant', { message: { n: 3 } }),
      msg('result', { subtype: 'success', is_error: false, total_cost_usd: 0.02 }),
    ];
    runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks: new TaskStore(db),
      events,
      query: delayedQuery(messages, 30),
    });
    await app.close();
    const tasks = new TaskStore(db);
    app = await buildServer({ env: loadEnv({}), registry, db, runner, tasks, events, git: new GitService() });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
    const { code } = createPairingCode(db);
    const r = redeemPairingCode(db, code, 't');
    token = r.ok ? r.token : '';

    const started = await runner.start({ projectId: 'hedged', prompt: 'long' });

    // Client A connects, receives the first few events, then is "killed".
    const a = connect(port, token, started.taskId, 0);
    await a.waitFor((m) => m.filter((x) => typeof x.seq === 'number').length >= 3);
    const aSeqs = a.eventSeqs();
    const aMax = Math.max(...aSeqs);
    a.socket.terminate();

    // Client B reconnects from A's last seen seq and runs to completion.
    const b = connect(port, token, started.taskId, aMax);
    await b.waitFor((m) => m.some((x) => x.type === 'task.completed'), 5000);
    await runner.whenSettled(started.taskId);
    const bSeqs = b.eventSeqs();

    const dbSeqs = events.since(started.taskId, 0).map((e) => e.seq);
    // A saw a contiguous prefix; B saw everything after A's last seq; together, all of it.
    expect(bSeqs.every((s) => s > aMax)).toBe(true); // no duplicates across the boundary
    expect([...aSeqs, ...bSeqs]).toEqual(dbSeqs); // no gaps, nothing lost
    b.socket.close();
  });
});

describe('POST /tasks/:id/cancel', () => {
  it('cancels a running task within seconds and emits task.cancelled', async () => {
    token = await rebuildWith(cancellableQuery());

    const startRes = await fetch(`http://127.0.0.1:${port}/projects/hedged/tasks`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'long running' }),
    });
    expect(startRes.status).toBe(201);
    const { taskId } = (await startRes.json()) as { taskId: string };

    const client = connect(port, token, taskId, 0);
    await client.waitFor((m) => m.some((x) => x.type === 'stream.caughtup'));

    const cancelRes = await fetch(`http://127.0.0.1:${port}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cancelRes.status).toBe(202);

    await client.waitFor((m) => m.some((x) => x.type === 'task.cancelled'), 5000);
    await runner.whenSettled(taskId);
    expect(new TaskStore(db).get(taskId)?.status).toBe('cancelled');

    // Cancelling an already-finished task is a 409.
    const again = await fetch(`http://127.0.0.1:${port}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(again.status).toBe(409);
    client.socket.close();
  });

  it('returns 404 for an unknown task', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/tasks/nope/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('tool permissions (S2-01)', () => {
  it('parks a tool call until the phone approves, then resumes', async () => {
    token = await rebuildWith(canUseToolQuery());
    const auth = { authorization: `Bearer ${token}` };

    const startRes = await fetch(`http://127.0.0.1:${port}/projects/hedged/tasks`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'needs a tool' }),
    });
    const { taskId } = (await startRes.json()) as { taskId: string };

    // Poll until the agent has parked on the permission (it waits here indefinitely).
    let pending: Array<{ id: string; toolName: string }> = [];
    for (let i = 0; i < 100; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/tasks/${taskId}/permissions`, { headers: auth });
      pending = (await r.json() as { pending: typeof pending }).pending;
      if (pending.length > 0) break;
      await sleep(20);
    }
    expect(pending).toHaveLength(1);
    expect(pending[0]!.toolName).toBe('Bash');

    // Task is parked in `waiting`, not finished.
    const mid = await (await fetch(`http://127.0.0.1:${port}/tasks/${taskId}`, { headers: auth })).json();
    expect(mid.status).toBe('waiting');

    // Approve from the phone → agent resumes.
    const dec = await fetch(
      `http://127.0.0.1:${port}/tasks/${taskId}/permissions/${pending[0]!.id}`,
      {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'allow' }),
      },
    );
    expect(dec.status).toBe(200);

    await runner.whenSettled(taskId);
    const done = await (await fetch(`http://127.0.0.1:${port}/tasks/${taskId}`, { headers: auth })).json();
    expect(done.status).toBe('done');

    // Deciding again → 404 (no longer pending).
    const again = await fetch(
      `http://127.0.0.1:${port}/tasks/${taskId}/permissions/${pending[0]!.id}`,
      {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'allow' }),
      },
    );
    expect(again.status).toBe(404);
  });
});
