// Cliente HTTP único e os DTOs — espelho dos tipos que o servidor devolve.

export type JobPath = 'rift' | 'machine';
export type JobMode = 'copy' | 'merge';
export type JobStatus = 'queued' | 'running' | 'paused' | 'paused_quota' | 'paused_auth' | 'paused_storage' | 'paused_offline' | 'done' | 'canceled' | 'failed';
export type FileStatus = 'pending' | 'done' | 'skipped_blocked' | 'skipped_native' | 'deferred' | 'missing' | 'failed';

export interface Info {
  version: string;
  platform: string;
  configured: { client: boolean; accounts: number };
}
export interface AuthClient {
  configured: boolean;
  clientIdMasked: string | null;
}
export type LoginStatus = { state: 'idle' } | { state: 'pending'; authUrl: string } | { state: 'done'; email: string } | { state: 'error'; message: string };
export interface Account {
  id: string;
  email: string;
  status: 'ok' | 'disconnected';
  isDefaultDest: boolean;
  failedSince: string | null;
}
export interface QuotaEvaluation {
  fits: boolean;
  mode: 'limit' | 'unlimited';
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
  resetAt: string;
}
export interface Inspection {
  inspectionId: string;
  destParentId: string;
  destParentName: string;
  folderId: string;
  name: string;
  owner: string | null;
  path: JobPath;
  readerAccountId: string;
  readerEmail: string;
  destAccountId: string;
  destEmail: string;
  totals: { files: number; bytes: number };
  blocked: { count: number; bytes: number; sample: { name: string; relPath: string }[] };
  native: { count: number };
  copyableBytes: number;
  destConflict: { existingFolderId: string } | null;
  quota: QuotaEvaluation;
  shareRequestText: string | null;
}
export interface JobStats {
  bytesPerSec: number;
  etaSec: number | null;
}
export interface Job {
  id: string;
  name: string;
  path: JobPath;
  mode: JobMode;
  status: JobStatus;
  totals: { files: number; bytes: number };
  done: { files: number; bytes: number };
  skippedFiles: number;
  deferredFiles: number;
  message: string | null;
  pausedUntil: string | null;
  resumeReason: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  dest: { accountEmail: string; parentName: string; folderId: string | null; finalName: string };
  source: { folderId: string; readerEmail: string };
  stats: JobStats | null;
}
export interface JobFile {
  relPath: string;
  name: string;
  size: number;
  status: FileStatus;
  error: string | null;
  bytesUploaded: number;
  srcUrl: string;
  destUrl: string | null;
}
export interface Copy {
  id: string;
  name: string;
  path: JobPath;
  destFolderId: string;
  destAccountEmail: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  destUrl: string;
}
export interface DiffGroup {
  folder: string;
  newFiles: number;
  updatedFiles: number;
  bytes: number;
}
export interface Settings {
  quotaMode: 'limit' | 'unlimited';
  quotaGb: number;
  quotaResetHour: number;
  defaultDest: { accountId: string; folderId: string; folderName: string } | null;
}
export interface Quota {
  mode: 'limit' | 'unlimited';
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
  resetAt: string;
  accountEmail: string;
}
export interface Folder {
  id: string;
  name: string;
  /** Atalho para pasta; `id` já é o da pasta alvo. */
  shortcut?: true;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, String(body.error ?? `HTTP ${res.status}`), typeof body.code === 'string' ? body.code : undefined);
  return body as T;
}
const post = <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(url: string, body: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(url: string) => request<T>(url, { method: 'DELETE' });

export const api = {
  info: () => request<Info>('/api/info'),
  authClient: () => request<AuthClient>('/api/auth/client'),
  setAuthClient: (clientId: string, clientSecret: string) => post<{ ok: true }>('/api/auth/client', { clientId, clientSecret }),
  loginStart: (loginHint?: string) => post<{ authUrl: string }>('/api/auth/login/start', { loginHint }),
  loginStatus: () => request<LoginStatus>('/api/auth/login/status'),
  accounts: () => request<{ accounts: Account[] }>('/api/accounts'),
  removeAccount: (id: string) => del<{ ok: true }>(`/api/accounts/${id}`),
  testAccount: (id: string) => post<{ ok: boolean; email?: string; error?: string }>(`/api/accounts/${id}/test`),
  setDefaultAccount: (id: string) => post<{ ok: true }>(`/api/accounts/${id}/default`),
  inspect: (body: { link: string; destAccountId?: string; destParentId?: string; destParentName?: string }) => post<Inspection>('/api/inspect', body),
  // `parentId` aceita um id, `root`, `starred` ou `shared`; com `q`, busca pelo nome e ignora o pai.
  folders: (accountId: string, parentId: string, q = '') =>
    request<{ folders: Folder[] }>(`/api/drive/folders?accountId=${encodeURIComponent(accountId)}&parentId=${encodeURIComponent(parentId)}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  createFolder: (body: { accountId: string; parentId: string; name: string }) => post<{ folder: Folder }>('/api/drive/folders', body),
  jobs: () => request<{ jobs: Job[] }>('/api/jobs'),
  job: (id: string) => request<{ job: Job; counts: Record<FileStatus, number> }>(`/api/jobs/${id}`),
  jobFiles: (id: string, status?: FileStatus, limit = 200, offset = 0) =>
    request<{ files: JobFile[] }>(`/api/jobs/${id}/files?${status ? `status=${status}&` : ''}limit=${limit}&offset=${offset}`),
  createJob: (body: { inspectionId: string; name: string; destAccountId: string; destParentId: string; destParentName: string; conflict?: 'rename' | 'merge' }) =>
    post<{ job: Job }>('/api/jobs', body),
  pauseJob: (id: string) => post<{ ok: true; job: Job }>(`/api/jobs/${id}/pause`),
  resumeJob: (id: string) => post<{ ok: true; job: Job }>(`/api/jobs/${id}/resume`),
  cancelJob: (id: string) => post<{ ok: true; job: Job }>(`/api/jobs/${id}/cancel`),
  deleteJob: (id: string) => del<{ ok: true }>(`/api/jobs/${id}`),
  copies: () => request<{ copies: Copy[] }>('/api/copies'),
  checkCopy: (id: string) => post<{ groups: DiffGroup[] }>(`/api/copies/${id}/check`),
  syncCopy: (id: string, folders: string[]) => post<{ job: Job }>(`/api/copies/${id}/sync`, { folders }),
  deleteCopy: (id: string) => del<{ ok: true }>(`/api/copies/${id}`),
  settings: () => request<Settings>('/api/settings'),
  patchSettings: (body: Partial<Settings>) => patch<Settings>('/api/settings', body),
  quota: (accountId?: string) => request<Quota>(`/api/quota${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
};
