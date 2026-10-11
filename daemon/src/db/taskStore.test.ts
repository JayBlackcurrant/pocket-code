import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db.js';
import { TaskStore } from './taskStore.js';

let db: Db;
let tasks: TaskStore;

beforeEach(() => {
  db = openDb(':memory:');
  tasks = new TaskStore(db);
});

afterEach(() => db.close());

describe('TaskStore.listForProject', () => {
  it('returns only a project\'s tasks, newest first', () => {
    tasks.create({ id: 'a1', projectId: 'alpha', branch: 'claude/one', worktree: '/p' });
    tasks.create({ id: 'b1', projectId: 'beta', branch: 'claude/x', worktree: '/p' });
    tasks.create({ id: 'a2', projectId: 'alpha', branch: 'claude/two', worktree: '/p' });

    const alpha = tasks.listForProject('alpha');
    expect(alpha.map((t) => t.id)).toEqual(['a2', 'a1']); // newest first
    expect(alpha.every((t) => t.projectId === 'alpha')).toBe(true);
    expect(tasks.listForProject('beta').map((t) => t.id)).toEqual(['b1']);
    expect(tasks.listForProject('none')).toEqual([]);
  });

  it('respects the limit', () => {
    for (let i = 0; i < 5; i++) {
      tasks.create({ id: `t${i}`, projectId: 'p', branch: `claude/${i}`, worktree: '/p' });
    }
    expect(tasks.listForProject('p', 2)).toHaveLength(2);
  });
});
