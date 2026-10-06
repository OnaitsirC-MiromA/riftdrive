import { describe, expect, it } from 'vitest';
import { FakeDrive } from './fake-drive';
import { DriveClient } from '../drive/client';
import { refreshAccessToken } from '../auth/oauth';

const mk = () => {
  const fake = new FakeDrive();
  const me = fake.account('me', 'me@x.com');
  const tokens = { getAccessToken: async () => me.accessToken, invalidate: () => {} };
  return { fake, me, client: new DriveClient('me', tokens, fake.fetch, { sleep: async () => {} }) };
};

describe('FakeDrive', () => {
  it('lista, copia, baixa e sobe', async () => {
    const { fake, me, client } = mk();
    const src = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'dono@x.com' });
    fake.share(src.id, 'me');
    fake.addFile({ name: 'a.mp4', parentId: src.id, owner: 'dono@x.com', content: 'AAAA' });

    const kids = await client.listChildren(src.id);
    expect(kids.map((k) => k.name)).toEqual(['a.mp4']);
    expect(kids[0].size).toBe(4);
    expect(kids[0].md5Checksum).toHaveLength(32);

    const copy = await client.copyFile(kids[0].id, 'a.mp4', fake.rootOf(me.id));
    expect(fake.children(fake.rootOf(me.id)).map((n) => n.name)).toEqual(['a.mp4']);
    expect(copy.size).toBe(4);

    const res = await client.download(kids[0].id, 2);
    expect(res.status).toBe(206);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('AA');

    const uri = await client.createUploadSession({ name: 'b.bin', parentId: fake.rootOf(me.id), mimeType: 'application/octet-stream', size: 6 });
    expect(await client.uploadChunk(uri, Buffer.from('abc'), 0, 6)).toEqual({ done: false, received: 3 });
    expect(await client.uploadStatus(uri, 6)).toEqual({ done: false, received: 3 });
    const fin = await client.uploadChunk(uri, Buffer.from('def'), 3, 6);
    expect(fin.done).toBe(true);
    expect(fake.byPath(fake.rootOf(me.id), 'b.bin')?.content.toString()).toBe('abcdef');
  });

  it('pagina conforme pageSize', async () => {
    const { fake, client } = mk();
    const src = fake.addFolder({ name: 'Grande', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    for (let i = 0; i < 2300; i++) fake.addFile({ name: `f${String(i).padStart(4, '0')}`, parentId: src.id, owner: 'd@x.com' });
    const all = await client.listChildren(src.id);
    expect(all).toHaveLength(2300);
    expect(fake.calls.filter((c) => c.url.includes('/drive/v3/files?'))).toHaveLength(3);
  });

  it('visibilidade: sem compartilhar é 404; bloqueado é cannotCopyFile; falha injetada uma vez', async () => {
    const { fake, me, client } = mk();
    const src = fake.addFolder({ name: 'Priv', parentId: 'ext', owner: 'dono@x.com' });
    await expect(client.getFile(src.id)).rejects.toMatchObject({ status: 404 });
    fake.share(src.id, 'me');
    expect((await client.getFile(src.id)).name).toBe('Priv');

    const f = fake.addFile({ name: 'x.pdf', parentId: src.id, owner: 'dono@x.com', canCopy: false });
    await expect(client.copyFile(f.id, 'x', fake.rootOf(me.id))).rejects.toMatchObject({ reason: 'cannotCopyFile' });

    fake.failNext({ reason: 'downloadQuotaExceeded', urlIncludes: '/copy' });
    const ok = fake.addFile({ name: 'y.pdf', parentId: src.id, owner: 'dono@x.com' });
    await expect(client.copyFile(ok.id, 'y', fake.rootOf(me.id))).rejects.toMatchObject({ reason: 'downloadQuotaExceeded' });
    expect((await client.copyFile(ok.id, 'y', fake.rootOf(me.id))).name).toBe('y');
  });

  it('atalho aponta para o alvo; nativo não baixa; destino cheio', async () => {
    const { fake, me, client } = mk();
    const src = fake.addFolder({ name: 'Src', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    const sc = fake.addShortcut({ name: 'Atalho', parentId: fake.rootOf(me.id), targetId: src.id, owner: 'me@x.com' });
    const got = await client.getFile(sc.id);
    expect(got.shortcutDetails).toEqual({ targetId: src.id, targetMimeType: 'application/vnd.google-apps.folder' });

    const doc = fake.addNative({ name: 'Doc', parentId: src.id, owner: 'd@x.com', mimeType: 'application/vnd.google-apps.document' });
    await expect(client.download(doc.id)).rejects.toMatchObject({ reason: 'fileNotDownloadable' });

    fake.setStorageFull('me', true);
    const f = fake.addFile({ name: 'z', parentId: src.id, owner: 'd@x.com' });
    await expect(client.copyFile(f.id, 'z', fake.rootOf(me.id))).rejects.toMatchObject({ reason: 'storageQuotaExceeded' });
  });

  it('sessão expirada responde 404; offset errado responde 400', async () => {
    const { fake, me, client } = mk();
    const uri = await client.createUploadSession({ name: 'b', parentId: fake.rootOf(me.id), mimeType: 'application/octet-stream', size: 4 });
    await expect(client.uploadChunk(uri, Buffer.from('ab'), 1, 4)).rejects.toMatchObject({ status: 400 });
    fake.expireSession(uri);
    await expect(client.uploadStatus(uri, 4)).rejects.toMatchObject({ status: 404 });
  });

  it('token endpoint: refresh ok, revogado → invalid_grant, código → tokens', async () => {
    const { fake, me } = mk();
    const client = { clientId: '1-a.apps.googleusercontent.com', clientSecret: 's' };
    expect(await refreshAccessToken({ refreshToken: me.refreshToken, client }, fake.fetch)).toMatchObject({ accessToken: me.accessToken });
    fake.revokeRefresh('me');
    await expect(refreshAccessToken({ refreshToken: me.refreshToken, client }, fake.fetch)).rejects.toMatchObject({ code: 'invalid_grant' });
    fake.grantCode('CODE', 'me');
    const res = await fake.fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: 'grant_type=authorization_code&code=CODE' });
    expect(await res.json()).toMatchObject({ access_token: me.accessToken, refresh_token: me.refreshToken });
  });

  it('token desconhecido é 401 authError', async () => {
    const { fake } = mk();
    const bad = new DriveClient('x', { getAccessToken: async () => 'nope', invalidate: () => {} }, fake.fetch, { sleep: async () => {} });
    await expect(bad.aboutEmail()).rejects.toMatchObject({ status: 401, reason: 'authError' });
  });
});
