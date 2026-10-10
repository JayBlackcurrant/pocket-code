import type { Db } from './db.js';

export type NotificationKind =
  | 'approval'
  | 'taskDone'
  | 'taskFailed'
  | 'buildReady'
  | 'buildFailed'
  | 'shipped'
  | 'uploadFailed';

export interface NotificationRow {
  seq: number;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: string | null;
  buildId: string | null;
  createdAt: number;
  read: boolean;
}

interface RawRow {
  seq: number;
  kind: NotificationKind;
  title: string;
  body: string;
  task_id: string | null;
  build_id: string | null;
  created_at: number;
  read_at: number | null;
}

function toRow(r: RawRow): NotificationRow {
  return {
    seq: r.seq,
    kind: r.kind,
    title: r.title,
    body: r.body,
    taskId: r.task_id,
    buildId: r.build_id,
    createdAt: r.created_at,
    read: r.read_at !== null,
  };
}

/** Persistence for user-facing notifications (S3-05). seq is monotonic, so a phone that
 *  reconnects can replay what it missed with since=<seq>. */
export class NotificationStore {
  constructor(private readonly db: Db) {}

  append(input: {
    kind: NotificationKind;
    title: string;
    body: string;
    taskId?: string | null;
    buildId?: string | null;
  }): NotificationRow {
    const info = this.db
      .prepare(
        'INSERT INTO notifications (kind, title, body, task_id, build_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(input.kind, input.title, input.body, input.taskId ?? null, input.buildId ?? null, Date.now());
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(seq: number): NotificationRow | undefined {
    const r = this.db.prepare('SELECT * FROM notifications WHERE seq = ?').get(seq) as RawRow | undefined;
    return r ? toRow(r) : undefined;
  }

  /** Notifications after `sinceSeq` (0 = from the start), oldest-first. */
  since(sinceSeq: number): NotificationRow[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE seq > ? ORDER BY seq ASC')
      .all(sinceSeq) as RawRow[];
    return rows.map(toRow);
  }

  /** The most recent notifications, newest-first (for the inbox). */
  recent(limit = 100): NotificationRow[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications ORDER BY seq DESC LIMIT ?')
      .all(limit) as RawRow[];
    return rows.map(toRow);
  }

  unreadCount(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get() as {
      n: number;
    };
    return r.n;
  }

  /** Mark everything up to and including `seq` as read. */
  markReadUpTo(seq: number): void {
    this.db
      .prepare('UPDATE notifications SET read_at = ? WHERE seq <= ? AND read_at IS NULL')
      .run(Date.now(), seq);
  }
}
