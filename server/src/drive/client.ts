import type { TokenProvider } from '../auth/accounts';
import { DriveError, NetworkError, isTransient } from './errors';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

// Docs, Sheets, Slides…: não têm bytes próprios (nem size nem md5), só se
// copiam dentro do Google ou se exportam convertidos.
const FOLDERS_OR_SHORTCUTS = `(mimeType = '${FOLDER_MIME}' or mimeType = '${SHORTCUT_MIME}')`;
// Dentro de aspas simples na consulta `q`, barra e aspa simples levam barra antes.
const escapeQ = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const isNativeGoogleMime = (m: string): boolean => m.startsWith('application/vnd.google-apps.') && m !== FOLDER_MIME && m !== SHORTCUT_MIME;

export const FILE_FIELDS =
  'id,name,mimeType,size,md5Checksum,modifiedTime,trashed,parents,shortcutDetails,capabilities(canCopy,canDownload),owners(emailAddress,displayName)';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum: string | null;
  modifiedTime?: string;
  trashed?: boolean;
  parents?: string[];
  shortcutDetails?: { targetId: string; targetMimeType: string };
  capabilities?: { canCopy?: boolean; canDownload?: boolean };
  owners?: { emailAddress?: string; displayName?: string }[];
}

export type UploadProgress = { done: true; file: DriveFile } | { done: false; received: number };

export interface ClientOptions {
  base?: string;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

// A API devolve `size` como STRING; aqui vira número de uma vez por todas.
const normalize = (raw: Record<string, unknown>): DriveFile =>
  ({
    ...(raw as object),
    id: String(raw.id),
    name: String(raw.name),
    mimeType: String(raw.mimeType),
    size: raw.size === undefined || raw.size === null ? 0 : Number(raw.size),
    md5Checksum: typeof raw.md5Checksum === 'string' ? raw.md5Checksum : null,
  }) as DriveFile;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Header Range de um 308: "bytes=0-1048575" → 1048576 bytes recebidos.
export const parseRangeEnd = (range: string | null): number => {
  const m = range?.match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
};

interface Req {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  rawBody?: Uint8Array;
  headers?: Record<string, string>;
  /** 308 (Resume Incomplete) é resposta normal do upload retomável, não erro. */
  allow308?: boolean;
}

/**
 * Cliente mínimo da Drive API v3 para UMA conta.
 *
 * Toda chamada passa por `request`: token da conta, `supportsAllDrives`, erro
 * estruturado (`DriveError`), uma retentativa em 401 depois de invalidar o
 * token, e backoff exponencial em erro transitório. O `fetch` é injetável —
 * é assim que a suíte roda sem rede.
 */
export class DriveClient {
  private base: string;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;

  constructor(
    readonly accountId: string,
    private tokens: TokenProvider,
    private fetchFn: typeof fetch = fetch,
    opts: ClientOptions = {},
  ) {
    this.base = opts.base ?? 'https://www.googleapis.com';
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  private async request(path: string, r: Req = {}): Promise<Response> {
    const url = path.startsWith('http') ? new URL(path) : new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(r.query ?? {})) url.searchParams.set(k, v);
    if (!path.startsWith('http') && url.pathname.startsWith('/drive/')) url.searchParams.set('supportsAllDrives', 'true');

    let retriedAuth = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokens.getAccessToken(this.accountId);
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...(r.headers ?? {}) };
      const init: RequestInit = { method: r.method ?? 'GET', headers };
      if (r.rawBody) init.body = r.rawBody as BodyInit;
      else if (r.body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(r.body);
      }

      let res: Response;
      try {
        res = await this.fetchFn(url.toString(), init);
      } catch (err) {
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw new NetworkError(err instanceof Error ? err.message : String(err));
      }

      if (res.ok || (r.allow308 && res.status === 308)) return res;

      const error = await toDriveError(res);
      error.accountId = this.accountId;
      if (error.status === 401 && !retriedAuth) {
        retriedAuth = true;
        this.tokens.invalidate(this.accountId);
        continue;
      }
      if (isTransient(error) && attempt < this.maxRetries) {
        await this.backoff(attempt);
        continue;
      }
      throw error;
    }
  }

  private backoff(attempt: number): Promise<void> {
    return this.sleep(Math.min(60_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200));
  }

  async getFile(id: string, fields = FILE_FIELDS): Promise<DriveFile> {
    const res = await this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { query: { fields } });
    return normalize((await res.json()) as Record<string, unknown>);
  }

  // files.list com uma consulta `q`, todas as páginas.
  private async listQuery(q: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const query: Record<string, string> = { q, fields: `nextPageToken,files(${FILE_FIELDS})`, pageSize: '1000', includeItemsFromAllDrives: 'true' };
      if (pageToken) query.pageToken = pageToken;
      const json = (await (await this.request('/drive/v3/files', { query })).json()) as { files?: Record<string, unknown>[]; nextPageToken?: string };
      out.push(...(json.files ?? []).map(normalize));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  listChildren(parentId: string): Promise<DriveFile[]> {
    return this.listQuery(`'${parentId}' in parents and trashed = false`);
  }

  // As pastas que o usuário marcou com estrela no Drive, estejam onde estiverem.
  listStarredFolders(): Promise<DriveFile[]> {
    return this.listQuery(`starred = true and mimeType = '${FOLDER_MIME}' and trashed = false`);
  }

  // O que outras pessoas compartilharam com a conta, só o que dá para copiar:
  // pastas e atalhos (o alvo do atalho é conferido por quem lista).
  listSharedWithMe(): Promise<DriveFile[]> {
    return this.listQuery(`sharedWithMe = true and trashed = false and ${FOLDERS_OR_SHORTCUTS}`);
  }

  // Busca pelo nome em toda a conta — Meu Drive, compartilhados, drives
  // compartilhados. Aspas e barras no termo são escapadas como a API exige.
  searchFolders(term: string): Promise<DriveFile[]> {
    return this.listQuery(`name contains '${escapeQ(term)}' and trashed = false and ${FOLDERS_OR_SHORTCUTS}`);
  }

  // Cópia servidor-a-servidor: o "rift". Os bytes nunca saem do Google.
  async copyFile(id: string, name: string, parentId: string): Promise<DriveFile> {
    const res = await this.request(`/drive/v3/files/${encodeURIComponent(id)}/copy`, {
      method: 'POST',
      query: { fields: FILE_FIELDS },
      body: { name, parents: [parentId] },
    });
    return normalize((await res.json()) as Record<string, unknown>);
  }

  async createFolder(name: string, parentId: string): Promise<DriveFile> {
    const res = await this.request('/drive/v3/files', {
      method: 'POST',
      query: { fields: FILE_FIELDS },
      body: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    });
    return normalize((await res.json()) as Record<string, unknown>);
  }

  async createEmptyFile(name: string, parentId: string, mimeType: string): Promise<DriveFile> {
    const res = await this.request('/drive/v3/files', { method: 'POST', query: { fields: FILE_FIELDS }, body: { name, mimeType, parents: [parentId] } });
    return normalize((await res.json()) as Record<string, unknown>);
  }

  async rename(id: string, name: string): Promise<DriveFile> {
    const res = await this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { method: 'PATCH', query: { fields: FILE_FIELDS }, body: { name } });
    return normalize((await res.json()) as Record<string, unknown>);
  }

  async aboutEmail(): Promise<string> {
    const json = (await (await this.request('/drive/v3/about', { query: { fields: 'user(emailAddress)' } })).json()) as {
      user?: { emailAddress?: string };
    };
    return json.user?.emailAddress ?? '';
  }

  // Devolve a Response inteira: quem chama consome o stream do corpo.
  download(id: string, rangeStart = 0): Promise<Response> {
    return this.request(`/drive/v3/files/${encodeURIComponent(id)}`, {
      query: { alt: 'media' },
      headers: rangeStart > 0 ? { range: `bytes=${rangeStart}-` } : {},
    });
  }

  async createUploadSession(p: { name: string; parentId: string; mimeType: string; size: number }): Promise<string> {
    const res = await this.request('/upload/drive/v3/files', {
      method: 'POST',
      query: { uploadType: 'resumable', supportsAllDrives: 'true' },
      headers: { 'x-upload-content-type': p.mimeType, 'x-upload-content-length': String(p.size) },
      body: { name: p.name, parents: [p.parentId], mimeType: p.mimeType },
    });
    const loc = res.headers.get('location');
    if (!loc) throw new DriveError(res.status, 'noUploadLocation', 'Sessão de upload sem Location');
    return loc;
  }

  private async uploadResult(res: Response): Promise<UploadProgress> {
    if (res.status === 308) return { done: false, received: parseRangeEnd(res.headers.get('range')) };
    return { done: true, file: normalize((await res.json()) as Record<string, unknown>) };
  }

  async uploadChunk(sessionUri: string, chunk: Uint8Array, start: number, total: number): Promise<UploadProgress> {
    const end = start + chunk.byteLength - 1;
    const res = await this.request(sessionUri, {
      method: 'PUT',
      rawBody: chunk,
      headers: { 'content-length': String(chunk.byteLength), 'content-range': `bytes ${start}-${end}/${total}` },
      allow308: true,
    });
    return this.uploadResult(res);
  }

  // "Onde parei?" — PUT vazio com `bytes */total`.
  async uploadStatus(sessionUri: string, total: number): Promise<UploadProgress> {
    const res = await this.request(sessionUri, { method: 'PUT', headers: { 'content-length': '0', 'content-range': `bytes */${total}` }, allow308: true });
    return this.uploadResult(res);
  }
}

async function toDriveError(res: Response): Promise<DriveError> {
  let reason = '';
  let message = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } | string };
    if (typeof j.error === 'string') reason = j.error;
    else {
      message = j.error?.message ?? message;
      reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? '';
    }
  } catch {
    /* corpo não-JSON */
  }
  if (!reason) {
    reason = res.status === 404 ? 'notFound' : res.status === 401 ? 'authError' : res.status === 429 ? 'rateLimitExceeded' : res.status >= 500 ? 'backendError' : 'unknown';
  }
  return new DriveError(res.status, reason, message);
}
