import { describe, expect, it } from 'vitest';
import { connectFakeAccount, makeTestApp } from '../test/harness';

function world() {
  const w = makeTestApp();
  const dest = connectFakeAccount(w.deps, w.fake, 'dest', 'dest@x.com');
  const src = w.fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'ana@x.com' });
  w.fake.addFile({ name: 'a.mp4', parentId: src.id, owner: 'ana@x.com', content: '12345' });
  w.fake.addFile({ name: 'b.pdf', parentId: src.id, owner: 'ana@x.com', content: '123', canCopy: false, canDownload: false });
  return { ...w, dest, src, link: `https://drive.google.com/drive/folders/${src.id}` };
}

describe('POST /api/inspect', () => {
  it('analisa com o destino padrão (conta padrão, raiz do Drive) e devolve um id de inspeção', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const r = await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: w.link } });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toMatchObject({ name: 'Curso', path: 'rift', destEmail: 'dest@x.com', totals: { files: 2, bytes: 8 }, blocked: { count: 1 }, copyableBytes: 5, destConflict: null });
    expect(typeof body.inspectionId).toBe('string');
    expect(body.quota).toMatchObject({ fits: true, mode: 'limit' });
    expect(w.deps.inspections.get(body.inspectionId)?.tree.files).toHaveLength(2);
  });

  it('erros de análise viram 400 com código', async () => {
    const w = world();
    expect((await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: 'nada' } })).json()).toMatchObject({ code: 'invalid_link' });
    const r = await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: w.link } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ code: 'no_access', error: expect.stringContaining('dest@x.com') });
  });

  it('sem contas conectadas é 400', async () => {
    const { app } = makeTestApp();
    const r = await app.inject({ method: 'POST', url: '/api/inspect', payload: { link: 'https://drive.google.com/drive/folders/1234567890abc' } });
    expect(r.statusCode).toBe(400);
  });

  it('link vazio é 400', async () => {
    const w = world();
    expect((await w.app.inject({ method: 'POST', url: '/api/inspect', payload: {} })).statusCode).toBe(400);
  });
});

describe('GET /api/drive/folders', () => {
  it('lista só pastas do pai pedido, em ordem', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    w.fake.addFolder({ name: 'Zeta', parentId: root, owner: 'dest@x.com' });
    w.fake.addFolder({ name: 'Alfa', parentId: root, owner: 'dest@x.com' });
    w.fake.addFile({ name: 'solto.txt', parentId: root, owner: 'dest@x.com' });
    const r = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=root` });
    expect(r.statusCode).toBe(200);
    expect(r.json().folders.map((f: { name: string }) => f.name)).toEqual(['Alfa', 'Zeta']);
    expect((await w.app.inject({ url: '/api/drive/folders?accountId=nope&parentId=root' })).statusCode).toBe(404);
  });

  it('parentId=starred lista só as pastas com estrela da conta, de qualquer lugar', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    const sub = w.fake.addFolder({ name: 'Projetos', parentId: root, owner: 'dest@x.com' });
    const deep = w.fake.addFolder({ name: 'Cursos 2026', parentId: sub.id, owner: 'dest@x.com' });
    w.fake.addFolder({ name: 'Sem estrela', parentId: root, owner: 'dest@x.com' });
    w.fake.addFile({ name: 'favorito.pdf', parentId: root, owner: 'dest@x.com' });
    w.fake.star(deep.id);
    w.fake.star(sub.id);
    w.fake.star(w.fake.children(root).find((n) => n.name === 'favorito.pdf')!.id);
    const r = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=starred` });
    expect(r.statusCode).toBe(200);
    expect(r.json().folders.map((f: { name: string }) => f.name)).toEqual(['Cursos 2026', 'Projetos']);
  });
});
