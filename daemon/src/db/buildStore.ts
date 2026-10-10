import type { Db } from './db.js';

export type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type UploadStatus = 'uploading' | 'uploaded' | 'failed';

export interface BuildRow {
  id: string;
  projectId: string;
  taskId: string | null;
  flavor: string | null;
  cwd: string;
  runCodegen: boolean;
  retryOf: string | null;
  artifact: string | null;
  status: BuildStatus;
  exitCode: number | null;
  error: string | null;
  uploadStatus: UploadStatus | null;
  releaseUrl: string | null;
  uploadError: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

interface RawBuildRow {
  id: string;
  project_id: string;
  task_id: string | null;
  flavor: string | null;
  cwd: string;
  run_codegen: number;
  retry_of: string | null;
  artifact: string | null;
  status: BuildStatus;
  exit_code: number | null;
  error: string | null;
  upload_status: UploadStatus | null;
  release_url: string | null;
  upload_error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  updated_at: number;
}

function toBuild(r: RawBuildRow): BuildRow {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    flavor: r.flavor,
    cwd: r.cwd,
    runCodegen: r.run_codegen === 1,
    retryOf: r.retry_of,
    artifact: r.artifact,
    status: r.status,
    exitCode: r.exit_code,
    error: r.error,
    uploadStatus: r.upload_status,
    releaseUrl: r.release_url,
    uploadError: r.upload_error,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    updatedAt: r.updated_at,
  };
}

/** CRUD for build rows (S3-01). BuildService owns the lifecycle; this is persistence. */
export class BuildStore {
  constructor(private readonly db: Db) {}

  create(input: {
    id: string;
    projectId: string;
    taskId?: string | null;
    flavor?: string | null;
    cwd: string;
    runCodegen?: boolean;
    retryOf?: string | null;
    status?: BuildStatus;
  }): BuildRow {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO builds (id, project_id, task_id, flavor, cwd, run_codegen, retry_of, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.id,
        input.projectId,
        input.taskId ?? null,
        input.flavor ?? null,
        input.cwd,
        input.runCodegen === false ? 0 : 1,
        input.retryOf ?? null,
        input.status ?? 'queued',
        now,
        now,
      );
    return this.get(input.id)!;
  }

  markStarted(id: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE builds SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  markSucceeded(id: string, artifact: string | null): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE builds SET status = 'succeeded', artifact = ?, finished_at = ?, updated_at = ? WHERE id = ?")
      .run(artifact, now, now, id);
  }

  markFailed(id: string, reason: string, exitCode: number | null): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE builds SET status = 'failed', error = ?, exit_code = ?, finished_at = ?, updated_at = ? WHERE id = ?")
      .run(reason, exitCode, now, now, id);
  }

  markCancelled(id: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE builds SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  // --- Distribution (S3-02) -------------------------------------------------

  markUploading(id: string): void {
    this.db
      .prepare("UPDATE builds SET upload_status = 'uploading', upload_error = NULL, updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  markUploaded(id: string, releaseUrl: string | null): void {
    this.db
      .prepare("UPDATE builds SET upload_status = 'uploaded', release_url = ?, updated_at = ? WHERE id = ?")
      .run(releaseUrl, Date.now(), id);
  }

  markUploadFailed(id: string, reason: string): void {
    this.db
      .prepare("UPDATE builds SET upload_status = 'failed', upload_error = ?, updated_at = ? WHERE id = ?")
      .run(reason, Date.now(), id);
  }

  get(id: string): BuildRow | undefined {
    const row = this.db.prepare('SELECT * FROM builds WHERE id = ?').get(id) as RawBuildRow | undefined;
    return row ? toBuild(row) : undefined;
  }

  listForProject(projectId: string): BuildRow[] {
    const rows = this.db
      .prepare('SELECT * FROM builds WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as RawBuildRow[];
    return rows.map(toBuild);
  }
}
