import { describe, expect, it } from 'vitest';
import { DriveClient, isNativeGoogleMime, parseRangeEnd } from './client';
import { DriveError, NetworkError } from './errors';

const tokens = { getAccessToken: async () => 'tok', invalidate: () => {} };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const gerr = (status: number, reason: string, message = 'm') => json(status, { error: { code: status, message, errors: [{ reason, message }] } });
const scripted = (responses: Array<() => Response>) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('resposta não roteirizada');
    return next();
  }) as unknown as typeof fetch;
  return { f, calls };
};
const noSleep = { sleep: async () => {} };
const headers = (c: { init: RequestInit }) => c.init.headers as Record<string, string>;

describe('mimes', () => {
  it('nativos do Google, exceto pasta e atalho', () => {
    expect(isNativeGoogleMime('application/vnd.google-apps.document')).toBe(true);
    expect(isNativeGoogleMime('application/vnd.google-apps.folder')).toBe(false);
    expect(isNativeGoogleMime('application/vnd.google-apps.shortcut')).toBe(false);
    expect(isNativeGoogleMime('video/mp4')).toBe(false);
  });
  it('parseRangeEnd', () => {
    expect(parseRangeEnd('bytes=0-1048575')).toBe(1048576);
    expect(parseRangeEnd(null)).toBe(0);
  });
});

describe('DriveClient', () => {
  it('getFile manda Bearer, supportsAllDrives e normaliza size (string → number)', async () => {
    const { f, calls } = scripted([() => json(200, { id: 'a', name: 'A', mimeType: 'video/mp4', size: '123' })]);
    const file = await new DriveClient('acc', tokens, f, noSleep).getFile('a');
    expect(file.size).toBe(123);
    expect(file.md5Checksum).toBeNull();
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe('/drive/v3/files/a');
    expect(u.searchParams.get('supportsAllDrives')).toBe('true');
    expect(headers(calls[0]).authorization).toBe('Bearer tok');
  });

  it('listChildren pagina até acabar', async () => {
    const { f, calls } = scripted([
      () => json(200, { files: [{ id: '1', name: 'a', mimeType: 'x' }], nextPageToken: 'T' }),
      () => json(200, { files: [{ id: '2', name: 'b', mimeType: 'x' }] }),
    ]);
    const list = await new DriveClient('acc', tokens, f, noSleep).listChildren('P');
    expect(list.map((x) => x.id)).toEqual(['1', '2']);
    expect(new URL(calls[1].url).searchParams.get('pageToken')).toBe('T');
    expect(new URL(calls[0].url).searchParams.get('q')).toBe("'P' in parents and trashed = false");
  });

  it('erro da API vira DriveError com reason', async () => {
    const { f } = scripted([() => gerr(403, 'cannotCopyFile', 'This file cannot be copied by the user.')]);
    await expect(new DriveClient('acc', tokens, f, noSleep).copyFile('a', 'n', 'p')).rejects.toMatchObject({ status: 403, reason: 'cannotCopyFile' });
  });

  it('transitório é retentado com backoff; depois do limite, sobe', async () => {
    const { f, calls } = scripted([
      () => gerr(429, 'rateLimitExceeded'),
      () => gerr(503, 'backendError'),
      () => json(200, { id: 'ok', name: 'n', mimeType: 'x' }),
    ]);
    expect((await new DriveClient('acc', tokens, f, noSleep).getFile('a')).id).toBe('ok');
    expect(calls).toHaveLength(3);

    const again = scripted(Array.from({ length: 6 }, () => () => gerr(429, 'rateLimitExceeded')));
    await expect(new DriveClient('acc', tokens, again.f, { ...noSleep, maxRetries: 2 }).getFile('a')).rejects.toBeInstanceOf(DriveError);
    expect(again.calls).toHaveLength(3);
  });

  it('rede fora é retentada e, persistindo, vira NetworkError', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new DriveClient('acc', tokens, f, { ...noSleep, maxRetries: 1 }).getFile('a')).rejects.toBeInstanceOf(NetworkError);
  });

  it('401 invalida o token e tenta uma vez de novo', async () => {
    let invalidated = 0;
    const tk = {
      getAccessToken: async () => 'tok',
      invalidate: () => {
        invalidated++;
      },
    };
    const { f, calls } = scripted([() => gerr(401, 'authError'), () => json(200, { id: 'a', name: 'n', mimeType: 'x' })]);
    await new DriveClient('acc', tk, f, noSleep).getFile('a');
    expect(invalidated).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('copyFile, createFolder e rename mandam o corpo certo', async () => {
    const { f, calls } = scripted([
      () => json(200, { id: 'c', name: 'n', mimeType: 'x' }),
      () => json(200, { id: 'd', name: 'Pasta', mimeType: 'application/vnd.google-apps.folder' }),
      () => json(200, { id: 'c', name: 'novo', mimeType: 'x' }),
    ]);
    const c = new DriveClient('acc', tokens, f, noSleep);
    await c.copyFile('src', 'n', 'parent');
    expect(calls[0].init.method).toBe('POST');
    expect(new URL(calls[0].url).pathname).toBe('/drive/v3/files/src/copy');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: 'n', parents: ['parent'] });
    await c.createFolder('Pasta', 'parent');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: 'Pasta', mimeType: 'application/vnd.google-apps.folder', parents: ['parent'] });
    await c.rename('c', 'novo');
    expect(calls[2].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ name: 'novo' });
  });

  it('upload: sessão, chunk 308 com Range, chunk final 200', async () => {
    const { f, calls } = scripted([
      () => new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=S' } }),
      () => new Response(null, { status: 308, headers: { range: 'bytes=0-9' } }),
      () => json(200, { id: 'new', name: 'n', mimeType: 'x', size: '20' }),
    ]);
    const c = new DriveClient('acc', tokens, f, noSleep);
    const uri = await c.createUploadSession({ name: 'n', parentId: 'p', mimeType: 'application/octet-stream', size: 20 });
    expect(uri).toContain('upload_id=S');
    expect(headers(calls[0])['x-upload-content-length']).toBe('20');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: 'n', parents: ['p'], mimeType: 'application/octet-stream' });
    expect(await c.uploadChunk(uri, new Uint8Array(10), 0, 20)).toEqual({ done: false, received: 10 });
    expect(headers(calls[1])['content-range']).toBe('bytes 0-9/20');
    expect(calls[1].url).toBe(uri);
    const fin = await c.uploadChunk(uri, new Uint8Array(10), 10, 20);
    expect(fin.done && fin.file.id).toBe('new');
  });

  it('uploadStatus consulta com bytes */total', async () => {
    const { f, calls } = scripted([() => new Response(null, { status: 308 })]);
    expect(await new DriveClient('acc', tokens, f, noSleep).uploadStatus('https://x/u', 50)).toEqual({ done: false, received: 0 });
    expect(headers(calls[0])['content-range']).toBe('bytes */50');
  });

  it('download com Range', async () => {
    const { f, calls } = scripted([() => new Response('abc', { status: 206 })]);
    const res = await new DriveClient('acc', tokens, f, noSleep).download('a', 5);
    expect(res.status).toBe(206);
    expect(headers(calls[0]).range).toBe('bytes=5-');
    expect(new URL(calls[0].url).searchParams.get('alt')).toBe('media');
  });

  it('aboutEmail', async () => {
    const { f } = scripted([() => json(200, { user: { emailAddress: 'a@x.com' } })]);
    expect(await new DriveClient('acc', tokens, f, noSleep).aboutEmail()).toBe('a@x.com');
  });
});
