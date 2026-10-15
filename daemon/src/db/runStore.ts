import type { Db } from './db.js';

/** starting → running ↔ reloading, then terminal stopped | failed. */
export type RunStatus = 'starting' | 'running' | 'reloading' | 'stopped' | 'failed';

/** Non-terminal statuses: a session still holding the checkout. */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['starting', 'running', 'reloading'];

export interface RunRow {
  id: string;
  projectId: string;
  taskId: string | null;
  branch: string;
  cwd: string;
  deviceSerial: string | null;
  debugPort: string | null;
  status: RunStatus;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  updatedAt: number;
}

interface RawRunRow {
  id: string;
  project_id: string;
  task_id: string | null;
  branch: string;
  cwd: string;
  device_serial: string | null;
  debug_port: string | null;
  status: RunStatus;
  error: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  updated_at: number;
}

function toRun(r: RawRunRow): RunRow {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    branch: r.branch,
    cwd: r.cwd,
    deviceSerial: r.device_serial,
    debugPort: r.debug_port,
    status: r.status,
    error: r.error,
    createdAt: r.created_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    updatedAt: r.updated_at,
  };
}

/**
 * CRUD for live-run session rows (S5-01), the run-side twin of BuildStore. RunService owns
 * the lifecycle (spawning `flutter run`, hot reload/restart, S5-03); this is only persistence
 * and recovery state. See LIVE_RUN_PLAN.md §4.
 */
export class RunStore {
  constructor(private readonly db: Db) {}

  create(input: {
    id: string;
    projectId: string;
    taskId?: string | null;
    branch: string;
    cwd: string;
    deviceSerial?: string | null;
    status?: RunStatus;
  }): RunRow {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO runs (id, project_id, task_id, branch, cwd, device_serial, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.id,
        input.projectId,
        input.taskId ?? null,
        input.branch,
        input.cwd,
        input.deviceSerial ?? null,
        input.status ?? 'starting',
        now,
        now,
      );
    return this.get(input.id)!;
  }

  /** The app running and attached. Sets started_at once; fills serial/port when provided. */
  markRunning(id: string, opts: { deviceSerial?: string | null; debugPort?: string | null } = {}): void {
    const now = Date.now();
    this.db
      .prepare(
        "UPDATE runs SET status = 'running', started_at = COALESCE(started_at, ?), device_serial = COALESCE(?, device_serial), debug_port = COALESCE(?, debug_port), updated_at = ? WHERE id = ?",
      )
      .run(now, opts.deviceSerial ?? null, opts.debugPort ?? null, now, id);
  }

  /** A hot reload/restart is in flight. */
  markReloading(id: string): void {
    const now = Date.now();
    this.db.prepare("UPDATE runs SET status = 'reloading', updated_at = ? WHERE id = ?").run(now, id);
  }

  /** The reload/restart finished; back to running. */
  markReloaded(id: string): void {
    const now = Date.now();
    this.db.prepare("UPDATE runs SET status = 'running', updated_at = ? WHERE id = ?").run(now, id);
  }

  markStopped(id: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE runs SET status = 'stopped', ended_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  markFailed(id: string, reason: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE runs SET status = 'failed', error = ?, ended_at = ?, updated_at = ? WHERE id = ?")
      .run(reason, now, now, id);
  }

  setDebugPort(id: string, debugPort: string): void {
    this.db.prepare('UPDATE runs SET debug_port = ?, updated_at = ? WHERE id = ?').run(debugPort, Date.now(), id);
  }

  setDeviceSerial(id: string, deviceSerial: string): void {
    this.db.prepare('UPDATE runs SET device_serial = ?, updated_at = ? WHERE id = ?').run(deviceSerial, Date.now(), id);
  }

  get(id: string): RunRow | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RawRunRow | undefined;
    return row ? toRun(row) : undefined;
  }

  listForProject(projectId: string, limit = 50): RunRow[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(projectId, limit) as RawRunRow[];
    return rows.map(toRun);
  }

  /** The project's current non-terminal run (starting/running/reloading), if any. Drives the
   *  concurrency gate (S5-04) and the app's resume-in-progress behaviour. */
  activeForProject(projectId: string): RunRow | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM runs WHERE project_id = ? AND status IN ('starting', 'running', 'reloading') ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(projectId) as RawRunRow | undefined;
    return row ? toRun(row) : undefined;
  }
}
