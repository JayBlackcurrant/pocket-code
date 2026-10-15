import { EventEmitter } from 'node:events';
import type { Db } from './db.js';

export interface StoredRunEvent {
  seq: number;
  runId: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

/**
 * Append-only run log (S5-01), the live-run twin of BuildLog. Each log line / lifecycle event
 * is written to SQLite with a monotonically increasing `seq` BEFORE it is streamed, so a phone
 * that disconnects mid-session can replay with `since=<seq>` over the run WebSocket (S5-05).
 *
 * Owns the live emitter so RunService (S5-03) streams through one feed and `/runs/:id/stream`
 * shows logs + lifecycle together.
 */
export class RunLog {
  private readonly insertStmt;
  private readonly sinceStmt;
  private readonly emitter = new EventEmitter();

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      'INSERT INTO run_events (run_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
    );
    this.sinceStmt = db.prepare(
      'SELECT seq, run_id, type, payload, created_at FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC',
    );
    // A busy run may have several WS clients; lift the default 10-listener cap.
    this.emitter.setMaxListeners(0);
  }

  /** Subscribe to persisted events as they are appended (used by the run WebSocket). */
  onEvent(listener: (e: StoredRunEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  /** Persist an event, emit it live, and return it with its assigned seq. */
  append(runId: string, type: string, payload: unknown): StoredRunEvent {
    const createdAt = Date.now();
    const info = this.insertStmt.run(runId, type, JSON.stringify(payload ?? null), createdAt);
    const stored = { seq: Number(info.lastInsertRowid), runId, type, payload, createdAt };
    this.emitter.emit('event', stored);
    return stored;
  }

  /** The last `limit` log lines for a run (run.log), oldest-first. Used to show a session's
   *  tail without replaying the whole log. */
  lastLines(runId: string, limit = 50): StoredRunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT seq, run_id, type, payload, created_at FROM run_events
         WHERE run_id = ? AND type = 'run.log'
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(runId, limit) as Array<{
      seq: number;
      run_id: string;
      type: string;
      payload: string;
      created_at: number;
    }>;
    return rows
      .map((r) => ({
        seq: r.seq,
        runId: r.run_id,
        type: r.type,
        payload: JSON.parse(r.payload) as unknown,
        createdAt: r.created_at,
      }))
      .reverse();
  }

  /** All events for a run after `sinceSeq` (0 = from the start), in order. */
  since(runId: string, sinceSeq: number): StoredRunEvent[] {
    const rows = this.sinceStmt.all(runId, sinceSeq) as Array<{
      seq: number;
      run_id: string;
      type: string;
      payload: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      runId: r.run_id,
      type: r.type,
      payload: JSON.parse(r.payload) as unknown,
      createdAt: r.created_at,
    }));
  }
}
