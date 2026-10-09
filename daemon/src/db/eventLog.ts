import type { Db } from './db.js';

export interface StoredEvent {
  seq: number;
  taskId: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

/**
 * Append-only event log (CLAUDE.md: event log first). Each event is written to SQLite
 * with a monotonically increasing `seq` BEFORE it is streamed, so a disconnected phone
 * can replay with `since=<seq>` (S1-06). `seq` is a global AUTOINCREMENT key, so order
 * is total across the whole log and strictly increasing per task.
 */
export class EventLog {
  private readonly insertStmt;
  private readonly sinceStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      'INSERT INTO events (task_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
    );
    this.sinceStmt = db.prepare(
      'SELECT seq, task_id, type, payload, created_at FROM events WHERE task_id = ? AND seq > ? ORDER BY seq ASC',
    );
  }

  /** Persist an event and return it with its assigned seq. */
  append(taskId: string, type: string, payload: unknown): StoredEvent {
    const createdAt = Date.now();
    const info = this.insertStmt.run(taskId, type, JSON.stringify(payload ?? null), createdAt);
    return { seq: Number(info.lastInsertRowid), taskId, type, payload, createdAt };
  }

  /** All events for a task after `sinceSeq` (0 = from the start), in order. */
  since(taskId: string, sinceSeq: number): StoredEvent[] {
    const rows = this.sinceStmt.all(taskId, sinceSeq) as Array<{
      seq: number;
      task_id: string;
      type: string;
      payload: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      taskId: r.task_id,
      type: r.type,
      payload: JSON.parse(r.payload) as unknown,
      createdAt: r.created_at,
    }));
  }
}
