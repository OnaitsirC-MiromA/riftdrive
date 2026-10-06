// Tipos das linhas do banco (snake_case, como no SQLite) e enums do domínio.

export type JobPath = 'rift' | 'machine';
export type JobMode = 'copy' | 'merge';
export type JobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'paused_quota'
  | 'paused_auth'
  | 'paused_storage'
  | 'paused_offline'
  | 'done'
  | 'canceled'
  | 'failed';
export type FileStatus = 'pending' | 'done' | 'skipped_blocked' | 'skipped_native' | 'deferred' | 'missing' | 'failed';
export type AccountStatus = 'ok' | 'disconnected';

export interface AccountRow {
  id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  access_expires_at: number | null;
  status: AccountStatus;
  is_default_dest: number;
  created_at: string;
  last_checked_at: string | null;
  failed_since: string | null;
}

export interface JobRow {
  id: string;
  name: string;
  src_folder_id: string;
  src_reader_account_id: string;
  dest_account_id: string;
  dest_parent_id: string;
  dest_parent_name: string;
  dest_folder_id: string | null;
  dest_final_name: string;
  path: JobPath;
  mode: JobMode;
  status: JobStatus;
  total_files: number;
  total_bytes: number;
  done_files: number;
  done_bytes: number;
  skipped_files: number;
  deferred_files: number;
  message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  paused_until: number | null;
  resume_reason: string | null;
  file_filter_json: string | null;
}

export interface JobFileRow {
  job_id: string;
  rel_path: string;
  src_id: string;
  name: string;
  mime_type: string;
  size: number;
  md5: string | null;
  status: FileStatus;
  dest_id: string | null;
  upload_uri: string | null;
  bytes_uploaded: number;
  attempts: number;
  last_error: string | null;
  deferred_until: number | null;
}

export interface JobFolderRow {
  job_id: string;
  rel_path: string;
  dest_id: string;
}

export interface CopyRow {
  id: string;
  src_folder_id: string;
  src_reader_account_id: string;
  dest_folder_id: string;
  dest_account_id: string;
  name: string;
  path: JobPath;
  created_at: string;
  last_checked_at: string | null;
  last_synced_at: string | null;
}
