// Schema v1. Para evoluir, acrescente um bloco `if (version < N)` no migrate —
// nunca edite este texto no lugar, senão os bancos já existentes ficam para trás.
//
// Princípios: o inventário em job_files é a verdade (é o que torna qualquer job
// retomável depois de fechar o app); copies sobrevive à limpeza de jobs; nada
// aqui tem caminho de disco — não existe disco, só ids do Drive.
export const SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE oauth_client (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','disconnected')),
  is_default_dest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  failed_since TEXT
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  src_folder_id TEXT NOT NULL,
  src_reader_account_id TEXT NOT NULL,
  dest_account_id TEXT NOT NULL,
  dest_parent_id TEXT NOT NULL,
  dest_parent_name TEXT NOT NULL,
  dest_folder_id TEXT,
  dest_final_name TEXT NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('rift','machine')),
  mode TEXT NOT NULL DEFAULT 'copy' CHECK (mode IN ('copy','merge')),
  status TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  done_files INTEGER NOT NULL DEFAULT 0,
  done_bytes INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0,
  deferred_files INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  paused_until INTEGER,
  resume_reason TEXT,
  file_filter_json TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);

CREATE TABLE job_files (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  src_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  md5 TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','skipped_blocked','skipped_native','deferred','missing','failed')),
  dest_id TEXT,
  upload_uri TEXT,
  bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  deferred_until INTEGER,
  PRIMARY KEY (job_id, rel_path)
);
CREATE INDEX idx_job_files_status ON job_files(job_id, status);

CREATE TABLE job_folders (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  dest_id TEXT NOT NULL,
  PRIMARY KEY (job_id, rel_path)
);

CREATE TABLE copies (
  id TEXT PRIMARY KEY,
  src_folder_id TEXT NOT NULL,
  src_reader_account_id TEXT NOT NULL,
  dest_folder_id TEXT NOT NULL,
  dest_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('rift','machine')),
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_synced_at TEXT,
  UNIQUE (src_folder_id, dest_folder_id)
);

CREATE TABLE quota_usage (
  account_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day_key)
);
`;
