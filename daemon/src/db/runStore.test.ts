import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db.js';
import { RunStore } from './runStore.js';

let db: Db;
let runs: RunStore;

beforeEach(() => {
  db = openDb(':memory:');
  runs = new RunStore(db);
});

afterEach(() => db.close());

const base = { projectId: 'hedged', branch: 'claude/x', cwd: '/p' };

describe('RunStore lifecycle', () => {
  it('creates a run defaulting to starting', () => {
    const r = runs.create({ id: 'r1', ...base, taskId: 't1' });
    expect(r.status).toBe('starting');
    expect(r.taskId).toBe('t1');
    expect(r.startedAt).toBeNull();
    expect(r.endedAt).toBeNull();
    expect(runs.get('r1')?.branch).toBe('claude/x');
  });

  it('markRunning sets started_at, serial and port; keeps started_at on a later running', () => {
    runs.create({ id: 'r1', ...base });
    runs.markRunning('r1', { deviceSerial: '100.1.1.1:5555', debugPort: 'http://127.0.0.1:1/ws' });
    const first = runs.get('r1')!;
    expect(first.status).toBe('running');
    expect(first.startedAt).not.toBeNull();
    expect(first.deviceSerial).toBe('100.1.1.1:5555');
    expect(first.debugPort).toBe('http://127.0.0.1:1/ws');

    // reload then running again must not move started_at nor clear serial/port
    runs.markReloading('r1');
    expect(runs.get('r1')?.status).toBe('reloading');
    runs.markRunning('r1');
    const second = runs.get('r1')!;
    expect(second.status).toBe('running');
    expect(second.startedAt).toBe(first.startedAt);
    expect(second.deviceSerial).toBe('100.1.1.1:5555');
  });

  it('markReloaded returns to running', () => {
    runs.create({ id: 'r1', ...base });
    runs.markReloading('r1');
    runs.markReloaded('r1');
    expect(runs.get('r1')?.status).toBe('running');
  });

  it('markStopped sets ended_at; markFailed records the reason', () => {
    runs.create({ id: 'r1', ...base });
    runs.markStopped('r1');
    expect(runs.get('r1')?.status).toBe('stopped');
    expect(runs.get('r1')?.endedAt).not.toBeNull();

    runs.create({ id: 'r2', ...base });
    runs.markFailed('r2', 'device offline');
    const failed = runs.get('r2')!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('device offline');
    expect(failed.endedAt).not.toBeNull();
  });

  it('setDebugPort and setDeviceSerial update in place', () => {
    runs.create({ id: 'r1', ...base });
    runs.setDeviceSerial('r1', '100.2.2.2:5555');
    runs.setDebugPort('r1', 'http://127.0.0.1:2/ws');
    const r = runs.get('r1')!;
    expect(r.deviceSerial).toBe('100.2.2.2:5555');
    expect(r.debugPort).toBe('http://127.0.0.1:2/ws');
  });
});

describe('RunStore queries', () => {
  it('listForProject returns only the project, newest first, respecting limit', () => {
    runs.create({ id: 'a1', ...base, projectId: 'alpha' });
    runs.create({ id: 'b1', ...base, projectId: 'beta' });
    runs.create({ id: 'a2', ...base, projectId: 'alpha' });

    expect(runs.listForProject('alpha').map((r) => r.id)).toEqual(['a2', 'a1']);
    expect(runs.listForProject('beta').map((r) => r.id)).toEqual(['b1']);
    expect(runs.listForProject('alpha', 1).map((r) => r.id)).toEqual(['a2']);
    expect(runs.listForProject('none')).toEqual([]);
  });

  it('listActive returns non-terminal runs across all projects', () => {
    runs.create({ id: 'a1', ...base, projectId: 'alpha' });
    runs.create({ id: 'b1', ...base, projectId: 'beta' });
    runs.create({ id: 'a2', ...base, projectId: 'alpha' });
    runs.markStopped('a1');
    expect(runs.listActive().map((r) => r.id).sort()).toEqual(['a2', 'b1']);
    runs.markFailed('b1', 'x');
    expect(runs.listActive().map((r) => r.id)).toEqual(['a2']);
  });

  it('activeForProject finds a non-terminal run and ignores terminal ones', () => {
    expect(runs.activeForProject('hedged')).toBeUndefined();

    runs.create({ id: 'r1', ...base });
    expect(runs.activeForProject('hedged')?.id).toBe('r1'); // starting counts

    runs.markRunning('r1');
    expect(runs.activeForProject('hedged')?.id).toBe('r1'); // running counts

    runs.markStopped('r1');
    expect(runs.activeForProject('hedged')).toBeUndefined(); // terminal ignored

    runs.create({ id: 'r2', ...base });
    runs.markReloading('r2');
    expect(runs.activeForProject('hedged')?.id).toBe('r2'); // reloading counts
  });
});
