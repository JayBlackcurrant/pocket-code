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
`;

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
