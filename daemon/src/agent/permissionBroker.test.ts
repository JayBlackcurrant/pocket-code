import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/db.js';
import { TaskStore } from '../db/taskStore.js';
import { PermissionBroker } from './permissionBroker.js';

let db: Db;
let tasks: TaskStore;
let broker: PermissionBroker;
let events: Array<{ taskId: string; type: string; payload: unknown }>;

beforeEach(() => {
  db = openDb(':memory:');
  tasks = new TaskStore(db);
  tasks.create({ id: 't1', projectId: 'p', branch: 'b', worktree: 'w', status: 'running' });
  events = [];
  broker = new PermissionBroker(
    db,
    (taskId, type, payload) => events.push({ taskId, type, payload }),
    tasks,
  );
});
afterEach(() => db.close());

describe('PermissionBroker', () => {
  it('parks a request, then resolves allow with the original input', async () => {
    const p = broker.request('t1', 'tu1', 'Bash', { command: 'ls' }, new AbortController().signal);
    expect(broker.listPending('t1').map((x) => x.id)).toEqual(['tu1']);
    expect(tasks.get('t1')?.status).toBe('waiting');
    expect(events.some((e) => e.type === 'agent.permission_request')).toBe(true);

    expect(broker.decide('t1', 'tu1', { allow: true })).toBe(true);
    const result = await p;
    expect(result.behavior).toBe('allow');
    if (result.behavior === 'allow') expect(result.updatedInput).toEqual({ command: 'ls' });
    expect(broker.listPending('t1')).toHaveLength(0);
    expect(tasks.get('t1')?.status).toBe('running');
  });

  it('resolves deny with the given reason', async () => {
    const p = broker.request('t1', 'tu2', 'Bash', { command: 'rm -rf /' }, new AbortController().signal);
    broker.decide('t1', 'tu2', { allow: false, reason: 'no destructive commands' });
    const result = await p;
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') expect(result.message).toBe('no destructive commands');
  });

  it('allow can edit the tool input', async () => {
    const p = broker.request('t1', 'tu3', 'Bash', { command: 'ls /' }, new AbortController().signal);
    broker.decide('t1', 'tu3', { allow: true, input: { command: 'ls .' } });
    const result = await p;
    if (result.behavior === 'allow') expect(result.updatedInput).toEqual({ command: 'ls .' });
  });

  it('returns false for an unknown permission id', () => {
    expect(broker.decide('t1', 'nope', { allow: true })).toBe(false);
  });

  it('resolves deny+interrupt when the task is aborted while waiting', async () => {
    const ac = new AbortController();
    const p = broker.request('t1', 'tu4', 'Bash', {}, ac.signal);
    ac.abort();
    const result = await p;
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') expect(result.interrupt).toBe(true);
  });
});
