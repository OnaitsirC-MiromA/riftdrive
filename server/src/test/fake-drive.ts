import { createHash, randomUUID } from 'node:crypto';
import { FOLDER_MIME, SHORTCUT_MIME, isNativeGoogleMime } from '../drive/client';

/**
 * Um Google Drive em memória para a suíte.
 *
 * Implementa o subconjunto da API que o app usa — listagem paginada, metadados,
 * cópia servidor-a-servidor, download com Range, upload retomável, criação e
 * renomeação — com os mesmos formatos da API real (size como string, erros em
 * `{error:{code,message,errors:[{reason}]}}`), e cobre também o token endpoint
 * do OAuth. Visibilidade por conta (herdada pelos filhos), arquivos que o dono
 * bloqueou, destino sem espaço e falhas injetadas completam o cenário.
 */

export interface FakeAccount {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export interface FakeNode {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size: number;
  md5: string | null;
  content: Buffer;
  canCopy: boolean;
  canDownload: boolean;
  shortcutTarget: string | null;
  ownerEmail: string;
  readers: Set<string>;
  trashed: boolean;
  modifiedTime: string;
  starred: boolean;
}

interface Session {
  account: string;
  name: string;
  parentId: string;
  mimeType: string;
  total: number;
  chunks: Buffer[];
  received: number;
  expired: boolean;
}

interface Failure {
  reason: string;
  status: number;
  times: number;
  method?: string;
  urlIncludes?: string;
  message?: string;
}

const gerr = (status: number, reason: string, message = reason) =>
  new Response(JSON.stringify({ error: { code: status, message, errors: [{ domain: 'global', reason, message }] } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const header = (init: RequestInit, name: string): string | undefined => {
  const h = init.headers as Record<string, string> | undefined;
  if (!h) return undefined;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name);
  return key ? h[key] : undefined;
};

export class FakeDrive {
  nodes = new Map<string, FakeNode>();
  accounts = new Map<string, FakeAccount>();
  calls: { method: string; url: string }[] = [];
  private sessions = new Map<string, Session>();
  private failures: Failure[] = [];
  private storageFull = new Set<string>();
  private revoked = new Set<string>();
  private codes = new Map<string, string>();

  readonly fetch: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => this.handle(String(url), init ?? {})) as unknown as typeof fetch;

  // --- montagem do cenário ---

  account(id: string, email: string): FakeAccount {
    const a = { id, email, accessToken: `tok-${id}`, refreshToken: `rt-${id}` };
    this.accounts.set(id, a);
    this.addFolder({ id: `root-${id}`, name: 'Meu Drive', parentId: '', owner: email, readers: [id] });
    return a;
  }

  rootOf(accountId: string): string {
    return `root-${accountId}`;
  }

  private put(n: {
    id?: string;
    name: string;
    mimeType: string;
    parentId: string;
    owner: string;
    content?: Buffer;
    canCopy?: boolean;
    canDownload?: boolean;
    shortcutTarget?: string | null;
    readers?: string[];
  }): FakeNode {
    const content = n.content ?? Buffer.alloc(0);
    const binary = n.mimeType !== FOLDER_MIME && n.mimeType !== SHORTCUT_MIME && !isNativeGoogleMime(n.mimeType);
    const node: FakeNode = {
      id: n.id ?? randomUUID(),
      name: n.name,
      mimeType: n.mimeType,
      parents: n.parentId ? [n.parentId] : [],
      size: binary ? content.length : 0,
      md5: binary ? createHash('md5').update(content).digest('hex') : null,
      content,
      canCopy: n.canCopy ?? true,
      canDownload: n.canDownload ?? true,
      shortcutTarget: n.shortcutTarget ?? null,
      ownerEmail: n.owner,
      readers: new Set(n.readers ?? []),
      trashed: false,
      modifiedTime: '2026-01-01T00:00:00.000Z',
      starred: false,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  /** Marca com estrela (o usuário fez isso no Drive). */
  star(nodeId: string): void {
    this.nodes.get(nodeId)!.starred = true;
  }

  addFolder(p: { id?: string; name: string; parentId: string; owner: string; readers?: string[] }): FakeNode {
    return this.put({ ...p, mimeType: FOLDER_MIME });
  }

  addFile(p: {
    id?: string;
    name: string;
    parentId: string;
    owner: string;
    content?: string | Buffer;
    mimeType?: string;
    canCopy?: boolean;
    canDownload?: boolean;
    readers?: string[];
  }): FakeNode {
    const content = typeof p.content === 'string' ? Buffer.from(p.content) : (p.content ?? Buffer.from('x'));
    return this.put({ ...p, mimeType: p.mimeType ?? 'application/octet-stream', content });
  }

  addNative(p: { id?: string; name: string; parentId: string; owner: string; mimeType: string; readers?: string[] }): FakeNode {
    return this.put(p);
  }

  addShortcut(p: { id?: string; name: string; parentId: string; targetId: string; owner: string; readers?: string[] }): FakeNode {
    return this.put({ ...p, mimeType: SHORTCUT_MIME, shortcutTarget: p.targetId });
  }

  /** Dá leitura a uma conta (ou a todos, '*'). Vale para os filhos também. */
  share(nodeId: string, accountId: string | '*'): void {
    this.nodes.get(nodeId)!.readers.add(accountId);
  }

  children(parentId: string): FakeNode[] {
    return [...this.nodes.values()].filter((n) => n.parents[0] === parentId && !n.trashed).sort((a, b) => a.name.localeCompare(b.name));
  }

  byPath(rootId: string, relPath: string): FakeNode | null {
    let cur = rootId;
    for (const seg of relPath.split('/')) {
      const next = this.children(cur).find((n) => n.name === seg);
      if (!next) return null;
      cur = next.id;
    }
    return this.nodes.get(cur) ?? null;
  }

  // --- injeção de condições ---

  failNext(m: { reason: string; status?: number; times?: number; method?: string; urlIncludes?: string; message?: string }): void {
    this.failures.push({ ...m, status: m.status ?? 403, times: m.times ?? 1 });
  }

  setStorageFull(accountId: string, full: boolean): void {
    if (full) this.storageFull.add(accountId);
    else this.storageFull.delete(accountId);
  }

  expireSession(uri: string): void {
    const s = this.sessions.get(new URL(uri).searchParams.get('upload_id') ?? '');
    if (s) s.expired = true;
  }

  revokeRefresh(accountId: string): void {
    this.revoked.add(accountId);
  }

  grantCode(code: string, accountId: string): void {
    this.codes.set(code, accountId);
  }

  // --- o servidor ---

  private canRead(node: FakeNode, accountId: string): boolean {
    let cur: FakeNode | undefined = node;
    while (cur) {
      if (cur.readers.has(accountId) || cur.readers.has('*')) return true;
      cur = cur.parents[0] ? this.nodes.get(cur.parents[0]) : undefined;
    }
    return false;
  }

  private pub(n: FakeNode) {
    return {
      id: n.id,
      name: n.name,
      mimeType: n.mimeType,
      size: n.mimeType === FOLDER_MIME ? undefined : String(n.size),
      md5Checksum: n.md5 ?? undefined,
      modifiedTime: n.modifiedTime,
      trashed: n.trashed,
      parents: n.parents,
      shortcutDetails: n.shortcutTarget
        ? { targetId: n.shortcutTarget, targetMimeType: this.nodes.get(n.shortcutTarget)?.mimeType ?? 'application/octet-stream' }
        : undefined,
      capabilities: { canCopy: n.canCopy, canDownload: n.canDownload },
      owners: [{ emailAddress: n.ownerEmail }],
    };
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const u = new URL(url);
    this.calls.push({ method, url });

    if (u.hostname === 'oauth2.googleapis.com') return this.handleOAuth(u, init);

    const fail = this.failures.find((f) => f.times > 0 && (!f.method || f.method === method) && (!f.urlIncludes || url.includes(f.urlIncludes)));
    if (fail) {
      fail.times--;
      return gerr(fail.status, fail.reason, fail.message);
    }

    const auth = header(init, 'authorization') ?? '';
    const acc = [...this.accounts.values()].find((a) => `Bearer ${a.accessToken}` === auth);
    if (!acc) return gerr(401, 'authError', 'Invalid Credentials');

    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, any>) : null;
    // "root" é o apelido que a API real aceita para a raiz do Meu Drive da conta.
    const resolve = (id: string | undefined): string | undefined => (id === 'root' ? this.rootOf(acc.id) : id);
    if (body?.parents?.[0]) body.parents[0] = resolve(body.parents[0]);
    const path = u.pathname.replace(/\/drive\/v3\/files\/root(\/|$)/, `/drive/v3/files/${this.rootOf(acc.id)}$1`);

    if (path === '/drive/v3/about') return json({ user: { emailAddress: acc.email } });

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      const parent = resolve(q.match(/'([^']+)' in parents/)?.[1]);
      const mimes = [...q.matchAll(/mimeType = '([^']+)'/g)].map((m) => m[1]);
      // `name contains '…'` com os escapes da API desfeitos (\' e \\).
      const term = q
        .match(/name contains '((?:\\.|[^'\\])*)'/)?.[1]
        ?.replace(/\\(.)/g, '$1')
        .toLowerCase();
      const all = () => [...this.nodes.values()].filter((n) => !n.trashed);
      // Quatro tipos de consulta: filhos de uma pasta, "tudo com estrela",
      // "compartilhado comigo" (leitura dada direto ao nó, por outro dono) e
      // busca pelo nome em tudo que a conta enxerga.
      let kids =
        parent !== undefined
          ? this.children(parent)
          : /starred = true/.test(q)
            ? all().filter((n) => n.starred)
            : /sharedWithMe = true/.test(q)
              ? all().filter((n) => n.ownerEmail !== acc.email && (n.readers.has(acc.id) || n.readers.has('*')))
              : term !== undefined
                ? all()
                : [];
      kids = kids
        .filter((n) => this.canRead(n, acc.id) && (mimes.length === 0 || mimes.includes(n.mimeType)) && (term === undefined || n.name.toLowerCase().includes(term)))
        .sort((a, b) => a.name.localeCompare(b.name));
      const size = Number(u.searchParams.get('pageSize') ?? 100);
      const off = Number(u.searchParams.get('pageToken') ?? 0);
      const page = kids.slice(off, off + size);
      return json({ files: page.map((n) => this.pub(n)), ...(off + size < kids.length ? { nextPageToken: String(off + size) } : {}) });
    }

    if (path === '/drive/v3/files' && method === 'POST') {
      const mimeType = body?.mimeType ?? 'application/octet-stream';
      if (mimeType !== FOLDER_MIME && this.storageFull.has(acc.id)) return gerr(403, 'storageQuotaExceeded', "The user's Drive storage quota has been exceeded.");
      const n = this.put({ name: body?.name, mimeType, parentId: body?.parents?.[0] ?? this.rootOf(acc.id), owner: acc.email, readers: [acc.id], content: Buffer.alloc(0) });
      return json(this.pub(n));
    }

    const fileMatch = path.match(/^\/drive\/v3\/files\/([^/]+)(\/copy)?$/);
    if (fileMatch) {
      const n = this.nodes.get(decodeURIComponent(fileMatch[1]));
      if (!n || n.trashed || !this.canRead(n, acc.id)) return gerr(404, 'notFound', 'File not found');
      if (fileMatch[2] && method === 'POST') {
        if (!n.canCopy) return gerr(403, 'cannotCopyFile', 'This file cannot be copied by the user.');
        if (this.storageFull.has(acc.id)) return gerr(403, 'storageQuotaExceeded', "The user's Drive storage quota has been exceeded.");
        const c = this.put({ name: body?.name, mimeType: n.mimeType, parentId: body?.parents?.[0], owner: acc.email, readers: [acc.id], content: n.content });
        return json(this.pub(c));
      }
      if (method === 'PATCH') {
        if (typeof body?.name === 'string') n.name = body.name;
        return json(this.pub(n));
      }
      if (u.searchParams.get('alt') === 'media') {
        if (!n.canDownload) return gerr(403, 'cannotDownloadFile', 'This file cannot be downloaded by the user.');
        if (isNativeGoogleMime(n.mimeType)) return gerr(403, 'fileNotDownloadable', 'Only files with binary content can be downloaded.');
        const range = header(init, 'range')?.match(/bytes=(\d+)-/);
        const start = range ? Number(range[1]) : 0;
        return new Response(new Uint8Array(n.content.subarray(start)), { status: start > 0 ? 206 : 200 });
      }
      return json(this.pub(n));
    }

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const id = randomUUID();
      const total = Number(header(init, 'x-upload-content-length') ?? 0);
      this.sessions.set(id, { account: acc.id, name: body?.name, parentId: body?.parents?.[0], mimeType: body?.mimeType ?? 'application/octet-stream', total, chunks: [], received: 0, expired: false });
      return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } });
    }

    if (path === '/upload/drive/v3/files' && method === 'PUT') {
      const s = this.sessions.get(u.searchParams.get('upload_id') ?? '');
      if (!s || s.expired) return gerr(404, 'notFound', 'upload session not found');
      const cr = header(init, 'content-range') ?? '';
      const finish = () => {
        if (this.storageFull.has(acc.id)) return gerr(403, 'storageQuotaExceeded', "The user's Drive storage quota has been exceeded.");
        const n = this.put({ name: s.name, mimeType: s.mimeType, parentId: s.parentId, owner: acc.email, readers: [acc.id], content: Buffer.concat(s.chunks) });
        return json(this.pub(n));
      };
      const incomplete = () => new Response(null, { status: 308, headers: s.received > 0 ? { range: `bytes=0-${s.received - 1}` } : {} });
      if (/^bytes \*\//.test(cr)) return s.total > 0 && s.received >= s.total ? finish() : incomplete();
      const m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!m) return gerr(400, 'badRequest', 'Content-Range inválido');
      if (Number(m[1]) !== s.received) return gerr(400, 'badRequest', `esperava offset ${s.received}, veio ${m[1]}`);
      const chunk = Buffer.from(await new Response(init.body as BodyInit).arrayBuffer());
      s.chunks.push(chunk);
      s.received += chunk.length;
      return s.received >= s.total ? finish() : incomplete();
    }

    return gerr(404, 'notFound', `rota não simulada: ${method} ${path}`);
  }

  private handleOAuth(u: URL, init: RequestInit): Response {
    if (u.pathname === '/revoke') return new Response('{}', { status: 200 });
    const form = new URLSearchParams(String(init.body ?? ''));
    if (form.get('grant_type') === 'refresh_token') {
      const acc = [...this.accounts.values()].find((a) => a.refreshToken === form.get('refresh_token'));
      if (!acc || this.revoked.has(acc.id)) return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
      return json({ access_token: acc.accessToken, expires_in: 3600, token_type: 'Bearer' });
    }
    const accId = this.codes.get(form.get('code') ?? '');
    const acc = accId ? this.accounts.get(accId) : undefined;
    if (!acc) return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: acc.accessToken, refresh_token: acc.refreshToken, expires_in: 3600, token_type: 'Bearer' });
  }
}
