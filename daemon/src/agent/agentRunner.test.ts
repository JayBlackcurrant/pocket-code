import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { parseProjectManifest } from '../config/projectManifest.js';
import { ProjectRegistry } from '../registry/projectRegistry.js';
import { GitService, runGit } from '../git/gitService.js';
import { openDb, type Db } from '../db/db.js';
import { EventLog } from '../db/eventLog.js';
import { TaskStore } from '../db/taskStore.js';
import { AgentRunner, type QueryFn } from './agentRunner.js';

let repo: string;
let registry: ProjectRegistry;

const sysInit = { type: 'system', subtype: 'init', session_id: 'sess-1' } as unknown as SDKMessage;
const assistant = { type: 'assistant', session_id: 'sess-1', message: {} } as unknown as SDKMessage;
const resultOk = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.0123,
  session_id: 'sess-1',
} as unknown as SDKMessage;
const resultErr = {
  type: 'result',
  subtype: 'error_during_execution',
  is_error: true,
  total_cost_usd: 0.5,
  session_id: 'sess-2',
  errors: ['boom'],
} as unknown as SDKMessage;

/** A fake query() that yields the given messages then ends. */
function fakeQuery(messages: SDKMessage[]): QueryFn {
  return () => {
    const gen = (async function* () {
      for (const m of messages) yield m;
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => undefined;
    return q;
  };
}

/** A fake query() that yields one message then blocks until aborted, then throws. */
function cancellableQuery(): QueryFn {
  return ({ options }) => {
    const signal = options?.abortController?.signal;
    const gen = (async function* () {
      yield sysInit;
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

/** Fake query that invokes canUseTool once with the given tool, then finishes. */
function toolQuery(toolName: string, input: Record<string, unknown>): QueryFn {
  return ({ options }) => {
    const gen = (async function* () {
      yield sysInit;
      const res = await options!.canUseTool!(toolName, input, {
        toolUseID: 'tu1',
        signal: options!.abortController!.signal,
      } as never);
      yield {
        type: 'assistant',
        session_id: 'sess-1',
        message: { content: [{ type: 'text', text: res.behavior }] },
      } as unknown as SDKMessage;
      yield resultOk;
    })();
    const q = gen as unknown as Query;
    (q as unknown as { interrupt: () => Promise<void> }).interrupt = async () => undefined;
    return q;
  };
}

beforeAll(async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'pc-runner-')));
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
  apk: "fvm flutter build apk --flavor {flavor} --release"
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

afterAll(() => {
  rmSync(join(repo, '..'), { recursive: true, force: true });
});

let db: Db;
let tasks: TaskStore;
let events: EventLog;

beforeEach(() => {
  db = openDb(':memory:');
  tasks = new TaskStore(db);
  events = new EventLog(db);
});

describe('AgentRunner', () => {
  it('runs a task, stores events in order, and records session id + cost', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: fakeQuery([sysInit, assistant, resultOk]),
    });

    const started = await runner.start({ projectId: 'hedged', prompt: 'Do a thing' });
    expect(started.branch).toBe('claude/do-a-thing');
    await runner.whenSettled(started.taskId);

    const task = tasks.get(started.taskId);
    expect(task?.status).toBe('done');
    expect(task?.sessionId).toBe('sess-1');
    expect(task?.costUsd).toBeCloseTo(0.0123);

    const log = events.since(started.taskId, 0);
    expect(log.map((e) => e.type)).toEqual([
      'task.created',
      'task.started',
      'agent.system.init',
      'agent.assistant',
      'agent.result.success',
      'task.completed',
    ]);
    // seq is strictly increasing.
    const seqs = log.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('marks the task failed when the result is an error', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: fakeQuery([sysInit, resultErr]),
    });
    const started = await runner.start({ projectId: 'hedged', prompt: 'boom task' });
    await runner.whenSettled(started.taskId);

    const task = tasks.get(started.taskId);
    expect(task?.status).toBe('failed');
    expect(task?.costUsd).toBeCloseTo(0.5);
  });

  it('replays events only after the given seq', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: fakeQuery([sysInit, assistant, resultOk]),
    });
    const started = await runner.start({ projectId: 'hedged', prompt: 'replay me' });
    await runner.whenSettled(started.taskId);

    const all = events.since(started.taskId, 0);
    const tail = events.since(started.taskId, all[2]!.seq);
    expect(tail.map((e) => e.type)).toEqual(['agent.assistant', 'agent.result.success', 'task.completed']);
  });

  it('cancels a running task', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: cancellableQuery(),
    });
    const started = await runner.start({ projectId: 'hedged', prompt: 'long task' });
    expect(await runner.cancel(started.taskId)).toBe(true);
    await runner.whenSettled(started.taskId);
    expect(tasks.get(started.taskId)?.status).toBe('cancelled');
  });

  it('rejects an unknown or inactive project', async () => {
    const runner = new AgentRunner({ registry, git: new GitService(), tasks, events, db, query: fakeQuery([]) });
    await expect(runner.start({ projectId: 'nope', prompt: 'x' })).rejects.toThrow(/not active/);
  });

  it('auto-denies a dangerous command without parking it (S2-02)', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: toolQuery('Bash', { command: 'sudo rm -rf /' }),
    });
    const started = await runner.start({ projectId: 'hedged', prompt: 'danger' });
    await runner.whenSettled(started.taskId);

    expect(runner.listPendingPermissions(started.taskId)).toHaveLength(0);
    const types = events.since(started.taskId, 0).map((e) => e.type);
    expect(types).toContain('agent.permission_auto_denied');
    expect(types).not.toContain('agent.permission_request'); // never asked the phone
  });

  it('auto-allows a safe command without parking it (S2-02)', async () => {
    const runner = new AgentRunner({
      registry,
      git: new GitService(),
      tasks,
      events,
      db,
      query: toolQuery('Bash', { command: 'flutter test' }),
    });
    const started = await runner.start({ projectId: 'hedged', prompt: 'safe' });
    await runner.whenSettled(started.taskId);

    expect(runner.listPendingPermissions(started.taskId)).toHaveLength(0);
    const types = events.since(started.taskId, 0).map((e) => e.type);
    expect(types).toContain('agent.permission_auto_allowed');
    expect(types).not.toContain('agent.permission_request');
  });
});
