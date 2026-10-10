import type { Db } from './db.js';

export interface StoredBuildEvent {
  seq: number;
  buildId: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

/**
 * Append-only build log (S3-01), the build-side twin of EventLog. Each line/lifecycle
 * event is written to SQLite with a monotonically increasing `seq` BEFORE it is streamed,
 * so a phone that disconnects mid-build can replay with `since=<seq>`.
 */
export class BuildLog {
  private readonly insertStmt;
  private readonly sinceStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      'INSERT INTO build_events (build_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
    );
    this.sinceStmt = db.prepare(
      'SELECT seq, build_id, type, payload, created_at FROM build_events WHERE build_id = ? AND seq > ? ORDER BY seq ASC',
    );
  }

  /** Persist an event and return it with its assigned seq. */
  append(buildId: string, type: string, payload: unknown): StoredBuildEvent {
    const createdAt = Date.now();
    const info = this.insertStmt.run(buildId, type, JSON.stringify(payload ?? null), createdAt);
    return { seq: Number(info.lastInsertRowid), buildId, type, payload, createdAt };
  }

  /** All events for a build after `sinceSeq` (0 = from the start), in order. */
  since(buildId: string, sinceSeq: number): StoredBuildEvent[] {
    const rows = this.sinceStmt.all(buildId, sinceSeq) as Array<{
      seq: number;
      build_id: string;
      type: string;
      payload: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      buildId: r.build_id,
      type: r.type,
      payload: JSON.parse(r.payload) as unknown,
      createdAt: r.created_at,
    }));
  }
}
