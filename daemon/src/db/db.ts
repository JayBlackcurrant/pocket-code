import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

/**
 * SQLite is the source of truth. Per CLAUDE.md, every event is written here with a
 * monotonically increasing `seq` BEFORE it is streamed over WebSocket, so a phone
 * that disconnects can replay missed events with `since=<seq>`.
 *
 * This module only sets up the schema and connection. Readers/writers live with the
 * services that own each table (task runner, approvals, builds) in later tasks.
 */
export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  branch      TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  status      TEXT NOT NULL,              -- queued | running | waiting | done | failed | cancelled
  session_id  TEXT,                       -- Agent SDK session id, for resume
  cost_usd    REAL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Append-only event log. seq is global and monotonic across all tasks.
CREATE TABLE IF NOT EXISTS events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,               -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_events_task_seq ON events(task_id, seq);

-- Paired phones. We store ONLY the SHA-256 hash of each device's bearer token
-- (CLAUDE.md: store the hash, compare in constant time). The raw token is shown once.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at   INTEGER                      -- NULL while active
);

-- One-time pairing codes. Created on the Mac (filesystem access to this DB is the
-- proof of being on the Mac), redeemed once by a phone over Tailscale. Only the hash
-- of the code is stored.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash   TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER                       -- NULL until redeemed
);

-- Pending/decided tool-permission requests (canUseTool bridge, S2-01). The agent parks
-- on a request; the phone resolves it via the permissions endpoint. Persisted so a
-- reconnecting phone can see what is waiting.
CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,            -- the SDK toolUseID
  task_id     TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  input       TEXT NOT NULL,               -- JSON
  status      TEXT NOT NULL,               -- pending | allowed | denied
  reason      TEXT,                        -- denial reason / note
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id, status);

-- Build jobs (S3-01). One build runs at a time (serial queue in BuildService). A build
-- compiles a project (optionally a task's reviewed worktree) into an APK, streaming its
-- log live. Artifact/upload metadata is filled in by later tasks (S3-02).
CREATE TABLE IF NOT EXISTS builds (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  task_id     TEXT,                       -- optional: build a task's worktree
  flavor      TEXT,
  cwd         TEXT NOT NULL,              -- directory the build ran in
  run_codegen INTEGER NOT NULL DEFAULT 1, -- 1 = ran manifest codegen before the APK build
  retry_of    TEXT,                       -- build id this is a retry of (S3-04), if any
  artifact    TEXT,                       -- produced APK path (best-effort)
  status      TEXT NOT NULL,              -- queued | running | succeeded | failed | cancelled
  exit_code   INTEGER,                    -- failing step's exit code
  error       TEXT,                       -- short failure reason
  upload_status TEXT,                     -- NULL | uploading | uploaded | failed (S3-02)
  release_url   TEXT,                     -- Firebase console link, if parsed from output
  upload_error  TEXT,                     -- upload failure reason
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_builds_project ON builds(project_id, created_at);

-- Append-only build log + lifecycle events. seq is monotonic per build, so a phone that
-- disconnects mid-build can replay with since=<seq> over the build WebSocket (same shape
-- as the task event log).
CREATE TABLE IF NOT EXISTS build_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  build_id   TEXT NOT NULL,
  type       TEXT NOT NULL,               -- build.created | build.started | build.step | build.log | build.completed | build.error | build.cancelled
  payload    TEXT NOT NULL,               -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (build_id) REFERENCES builds(id)
);
CREATE INDEX IF NOT EXISTS idx_build_events_build_seq ON build_events(build_id, seq);

-- User-facing notifications (S3-05). Self-contained: the daemon derives these from task /
-- build / upload outcomes and the phone reads them over the tailnet (live + replay by seq).
-- Content-safe: title/body only, never code or secrets (CLAUDE.md). seq is monotonic.
CREATE TABLE IF NOT EXISTS notifications (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,               -- approval | taskDone | taskFailed | buildReady | buildFailed | shipped | uploadFailed
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  task_id    TEXT,                         -- deep-link target, if any
  build_id   TEXT,
  created_at INTEGER NOT NULL,
  read_at    INTEGER                       -- NULL while unread
);
CREATE INDEX IF NOT EXISTS idx_notifications_seq ON notifications(seq);
`;

/** Add a column if it is not already present. Lets a DB created by an earlier task pick up
 *  columns added by a later one without a destructive migration. */
function addColumnIfMissing(db: Db, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migrations for DBs created before a column existed (S3-02 upload fields, S3-04 fields).
  addColumnIfMissing(db, 'builds', 'upload_status', 'TEXT');
  addColumnIfMissing(db, 'builds', 'release_url', 'TEXT');
  addColumnIfMissing(db, 'builds', 'upload_error', 'TEXT');
  addColumnIfMissing(db, 'builds', 'run_codegen', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'builds', 'retry_of', 'TEXT');
  return db;
}
