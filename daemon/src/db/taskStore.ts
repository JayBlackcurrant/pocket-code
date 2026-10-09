import type { Db } from './db.js';

export type TaskStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

export interface TaskRow {
  id: string;
  projectId: string;
  branch: string;
  worktree: string;
  status: TaskStatus;
  sessionId: string | null;
  costUsd: number | null;
  createdAt: number;
  updatedAt: number;
}

interface RawTaskRow {
  id: string;
  project_id: string;
  branch: string;
  worktree: string;
  status: TaskStatus;
  session_id: string | null;
  cost_usd: number | null;
  created_at: number;
  updated_at: number;
}

function toTask(r: RawTaskRow): TaskRow {
  return {
    id: r.id,
    projectId: r.project_id,
    branch: r.branch,
    worktree: r.worktree,
    status: r.status,
    sessionId: r.session_id,
    costUsd: r.cost_usd,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** CRUD for task rows. The agent runner owns the lifecycle; this is just persistence. */
export class TaskStore {
  constructor(private readonly db: Db) {}

  create(input: { id: string; projectId: string; branch: string; worktree: string; status?: TaskStatus }): TaskRow {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO tasks (id, project_id, branch, worktree, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(input.id, input.projectId, input.branch, input.worktree, input.status ?? 'queued', now, now);
    return this.get(input.id)!;
  }

  setStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  }

  setWorktree(id: string, branch: string, worktree: string): void {
    this.db
      .prepare('UPDATE tasks SET branch = ?, worktree = ?, updated_at = ? WHERE id = ?')
      .run(branch, worktree, Date.now(), id);
  }

  setSession(id: string, sessionId: string): void {
    this.db.prepare('UPDATE tasks SET session_id = ?, updated_at = ? WHERE id = ?').run(sessionId, Date.now(), id);
  }

  setResult(id: string, result: { sessionId: string | null; costUsd: number | null; status: TaskStatus }): void {
    this.db
      .prepare('UPDATE tasks SET session_id = COALESCE(?, session_id), cost_usd = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(result.sessionId, result.costUsd, result.status, Date.now(), id);
  }

  get(id: string): TaskRow | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as RawTaskRow | undefined;
    return row ? toTask(row) : undefined;
  }

  list(): TaskRow[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as RawTaskRow[];
    return rows.map(toTask);
  }
}
