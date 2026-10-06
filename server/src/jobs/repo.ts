import { randomUUID } from 'node:crypto';
import { transaction, type Db } from '../db';
import type { CopyRow, FileStatus, JobFileRow, JobMode, JobPath, JobRow, JobStatus } from '../types';

export interface NewJob {
  name: string;
  srcFolderId: string;
  srcReaderAccountId: string;
  destAccountId: string;
  destParentId: string;
  destParentName: string;
  destFinalName: string;
  path: JobPath;
  mode: JobMode;
  destFolderId?: string | null;
  fileFilter?: string[] | null;
}

export interface NewJobFile {
  relPath: string;
  srcId: string;
  name: string;
  mimeType: string;
  size: number;
  md5: string | null;
  status?: FileStatus;
  lastError?: string | null;
}

export interface NewCopy {
  srcFolderId: string;
  srcReaderAccountId: string;
  destFolderId: string;
  destAccountId: string;
  name: string;
  path: JobPath;
}

const JOB_COLUMNS = new Set<keyof JobRow>([
  'name', 'src_folder_id', 'src_reader_account_id', 'dest_account_id', 'dest_parent_id', 'dest_parent_name', 'dest_folder_id', 'dest_final_name',
  'path', 'mode', 'status', 'total_files', 'total_bytes', 'done_files', 'done_bytes', 'skipped_files', 'deferred_files', 'message',
  'created_at', 'started_at', 'finished_at', 'paused_until', 'resume_reason', 'file_filter_json',
]);
const FILE_COLUMNS = new Set<keyof JobFileRow>(['src_id', 'name', 'mime_type', 'size', 'md5', 'status', 'dest_id', 'upload_uri', 'bytes_uploaded', 'attempts', 'last_error', 'deferred_until']);
const FILE_STATUSES: FileStatus[] = ['pending', 'done', 'skipped_blocked', 'skipped_native', 'deferred', 'missing', 'failed'];

type SqlValue = string | number | null;

/**
 * Tudo o que o motor e as rotas precisam gravar/ler sobre jobs: o job em si,
 * o inventário por arquivo (a verdade da retomada), as pastas já espelhadas no
 * destino e o registro de cópias para o re-sync.
 */
export class JobsRepo {
  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {}

  // --- jobs ---

  create(j: NewJob): JobRow {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO jobs(id, name, src_folder_id, src_reader_account_id, dest_account_id, dest_parent_id, dest_parent_name, dest_folder_id, dest_final_name, path, mode, status, created_at, file_filter_json)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
      )
      .run(
        id, j.name, j.srcFolderId, j.srcReaderAccountId, j.destAccountId, j.destParentId, j.destParentName, j.destFolderId ?? null, j.destFinalName,
        j.path, j.mode, new Date(this.now()).toISOString(), j.fileFilter ? JSON.stringify(j.fileFilter) : null,
      );
    return this.get(id)!;
  }

  get(id: string): JobRow | null {
    return (this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined) ?? null;
  }

  list(): JobRow[] {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC').all() as unknown as JobRow[];
  }

  listByStatus(statuses: JobStatus[]): JobRow[] {
    if (!statuses.length) return [];
    const marks = statuses.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM jobs WHERE status IN (${marks}) ORDER BY created_at ASC, rowid ASC`).all(...statuses) as unknown as JobRow[];
  }

  update(id: string, patch: Partial<Omit<JobRow, 'id'>>): void {
    const keys = Object.keys(patch) as (keyof Omit<JobRow, 'id'>)[];
    if (!keys.length) return;
    for (const k of keys) if (!JOB_COLUMNS.has(k)) throw new Error(`coluna desconhecida em jobs: ${String(k)}`);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE jobs SET ${sets} WHERE id = ?`).run(...keys.map((k) => patch[k] as SqlValue), id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  }

  // --- inventário ---

  insertFiles(jobId: string, files: NewJobFile[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO job_files(job_id, rel_path, src_id, name, mime_type, size, md5, status, last_error) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_id, rel_path) DO NOTHING`,
    );
    transaction(this.db, () => {
      for (const f of files) stmt.run(jobId, f.relPath, f.srcId, f.name, f.mimeType, f.size, f.md5, f.status ?? 'pending', f.lastError ?? null);
      const totals = this.db
        .prepare(
          `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS files, COALESCE(SUM(size) FILTER (WHERE status = 'pending'), 0) AS bytes
           FROM job_files WHERE job_id = ?`,
        )
        .get(jobId) as { files: number; bytes: number };
      this.update(jobId, { total_files: totals.files, total_bytes: totals.bytes });
      this.recount(jobId);
    });
  }

  nextPending(jobId: string, limit: number): JobFileRow[] {
    return this.db
      .prepare(
        `SELECT * FROM job_files WHERE job_id = ? AND (status = 'pending' OR (status = 'deferred' AND deferred_until <= ?))
         ORDER BY attempts ASC, rel_path ASC LIMIT ?`,
      )
      .all(jobId, this.now(), limit) as unknown as JobFileRow[];
  }

  countPending(jobId: string): { pending: number; deferredFuture: number; minDeferredUntil: number | null } {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending' OR (status = 'deferred' AND deferred_until <= ?)) AS pending,
                COUNT(*) FILTER (WHERE status = 'deferred' AND deferred_until > ?) AS deferredFuture,
                MIN(CASE WHEN status = 'deferred' THEN deferred_until END) AS minDeferredUntil
         FROM job_files WHERE job_id = ?`,
      )
      .get(this.now(), this.now(), jobId) as { pending: number; deferredFuture: number; minDeferredUntil: number | null };
    return { pending: r.pending, deferredFuture: r.deferredFuture, minDeferredUntil: r.minDeferredUntil ?? null };
  }

  setFile(jobId: string, relPath: string, patch: Partial<JobFileRow>): void {
    const keys = Object.keys(patch) as (keyof JobFileRow)[];
    if (!keys.length) return;
    for (const k of keys) if (!FILE_COLUMNS.has(k)) throw new Error(`coluna desconhecida em job_files: ${String(k)}`);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE job_files SET ${sets} WHERE job_id = ? AND rel_path = ?`).run(...keys.map((k) => patch[k] as SqlValue), jobId, relPath);
  }

  recount(jobId: string): void {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) FILTER (WHERE status = 'done') AS done_files,
                COALESCE(SUM(size) FILTER (WHERE status = 'done'), 0) AS done_bytes,
                COUNT(*) FILTER (WHERE status IN ('skipped_blocked', 'skipped_native')) AS skipped_files,
                COUNT(*) FILTER (WHERE status = 'deferred') AS deferred_files
         FROM job_files WHERE job_id = ?`,
      )
      .get(jobId) as { done_files: number; done_bytes: number; skipped_files: number; deferred_files: number };
    this.update(jobId, r);
  }

  files(jobId: string, status?: FileStatus, limit = 200, offset = 0): JobFileRow[] {
    if (status) {
      return this.db
        .prepare('SELECT * FROM job_files WHERE job_id = ? AND status = ? ORDER BY rel_path LIMIT ? OFFSET ?')
        .all(jobId, status, limit, offset) as unknown as JobFileRow[];
    }
    return this.db.prepare('SELECT * FROM job_files WHERE job_id = ? ORDER BY rel_path LIMIT ? OFFSET ?').all(jobId, limit, offset) as unknown as JobFileRow[];
  }

  fileCounts(jobId: string): Record<FileStatus, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM job_files WHERE job_id = ? GROUP BY status').all(jobId) as unknown as { status: FileStatus; n: number }[];
    const out = Object.fromEntries(FILE_STATUSES.map((s) => [s, 0])) as Record<FileStatus, number>;
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  // --- pastas espelhadas ---

  folder(jobId: string, relPath: string): string | null {
    const r = this.db.prepare('SELECT dest_id FROM job_folders WHERE job_id = ? AND rel_path = ?').get(jobId, relPath) as { dest_id: string } | undefined;
    return r?.dest_id ?? null;
  }

  setFolder(jobId: string, relPath: string, destId: string): void {
    this.db
      .prepare('INSERT INTO job_folders(job_id, rel_path, dest_id) VALUES(?, ?, ?) ON CONFLICT(job_id, rel_path) DO UPDATE SET dest_id = excluded.dest_id')
      .run(jobId, relPath, destId);
  }

  // --- cópias registradas (re-sync) ---

  upsertCopy(c: NewCopy): CopyRow {
    this.db
      .prepare(
        `INSERT INTO copies(id, src_folder_id, src_reader_account_id, dest_folder_id, dest_account_id, name, path, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(src_folder_id, dest_folder_id) DO UPDATE SET name = excluded.name, path = excluded.path, src_reader_account_id = excluded.src_reader_account_id`,
      )
      .run(randomUUID(), c.srcFolderId, c.srcReaderAccountId, c.destFolderId, c.destAccountId, c.name, c.path, new Date(this.now()).toISOString());
    return this.db.prepare('SELECT * FROM copies WHERE src_folder_id = ? AND dest_folder_id = ?').get(c.srcFolderId, c.destFolderId) as unknown as CopyRow;
  }

  copies(): CopyRow[] {
    return this.db.prepare('SELECT * FROM copies ORDER BY created_at DESC, rowid DESC').all() as unknown as CopyRow[];
  }

  copy(id: string): CopyRow | null {
    return (this.db.prepare('SELECT * FROM copies WHERE id = ?').get(id) as CopyRow | undefined) ?? null;
  }

  touchCopy(id: string, p: { checked?: boolean; synced?: boolean }): void {
    const now = new Date(this.now()).toISOString();
    if (p.checked) this.db.prepare('UPDATE copies SET last_checked_at = ? WHERE id = ?').run(now, id);
    if (p.synced) this.db.prepare('UPDATE copies SET last_synced_at = ? WHERE id = ?').run(now, id);
  }

  removeCopy(id: string): void {
    this.db.prepare('DELETE FROM copies WHERE id = ?').run(id);
  }
}
