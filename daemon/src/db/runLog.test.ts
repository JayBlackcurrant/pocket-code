import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db.js';
import { RunLog, type StoredRunEvent } from './runLog.js';
import { RunStore } from './runStore.js';

let db: Db;
let log: RunLog;

beforeEach(() => {
  db = openDb(':memory:');
  log = new RunLog(db);
  // run_events has an FK to runs(id); create the referenced sessions first (as RunService does).
  const runs = new RunStore(db);
  runs.create({ id: 'r1', projectId: 'hedged', branch: 'claude/x', cwd: '/p' });
  runs.create({ id: 'r2', projectId: 'hedged', branch: 'claude/y', cwd: '/p' });
});

afterEach(() => db.close());

describe('RunLog append + replay', () => {
  it('assigns a strictly increasing seq and round-trips the payload', () => {
    const a = log.append('r1', 'run.started', { device: '100.1.1.1:5555' });
    const b = log.append('r1', 'run.log', { stream: 'stdout', line: 'Reloaded in 231ms' });
    expect(b.seq).toBeGreaterThan(a.seq);
    expect(a.payload).toEqual({ device: '100.1.1.1:5555' });
    const all = log.since('r1', 0);
    expect(all.map((e) => e.type)).toEqual(['run.started', 'run.log']);
    expect(all[1]?.payload).toEqual({ stream: 'stdout', line: 'Reloaded in 231ms' });
  });

  it('since(runId, seq) returns only events after seq, in order', () => {
    const a = log.append('r1', 'run.log', { line: '1' });
    log.append('r1', 'run.log', { line: '2' });
    log.append('r1', 'run.log', { line: '3' });
    const after = log.since('r1', a.seq);
    expect(after.map((e) => (e.payload as { line: string }).line)).toEqual(['2', '3']);
  });

  it('keeps runs isolated (global seq, per-run filtering)', () => {
    log.append('r1', 'run.log', { line: 'one' });
    log.append('r2', 'run.log', { line: 'two' });
    log.append('r1', 'run.log', { line: 'three' });
    expect(log.since('r1', 0).map((e) => (e.payload as { line: string }).line)).toEqual(['one', 'three']);
    expect(log.since('r2', 0).map((e) => (e.payload as { line: string }).line)).toEqual(['two']);
  });

  it('lastLines returns only run.log, oldest-first, within the limit', () => {
    log.append('r1', 'run.started', { device: 'x' }); // not a log line
    for (let i = 1; i <= 5; i++) log.append('r1', 'run.log', { line: `L${i}` });
    const tail = log.lastLines('r1', 3);
    expect(tail.map((e) => (e.payload as { line: string }).line)).toEqual(['L3', 'L4', 'L5']);
    expect(tail.every((e) => e.type === 'run.log')).toBe(true);
  });

  it('emits live events to subscribers', () => {
    const seen: StoredRunEvent[] = [];
    const unsub = log.onEvent((e) => seen.push(e));
    log.append('r1', 'run.log', { line: 'live' });
    unsub();
    log.append('r1', 'run.log', { line: 'after-unsub' });
    expect(seen).toHaveLength(1);
    expect((seen[0]?.payload as { line: string }).line).toBe('live');
  });
});
