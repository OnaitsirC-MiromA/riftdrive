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

  it('parentId=shared lista pastas e atalhos para pasta que outros compartilharam com a conta', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    w.fake.addFolder({ name: 'Minha própria', parentId: root, owner: 'dest@x.com' });
    const curso = w.fake.addFolder({ name: 'Curso da Ana', parentId: 'ext', owner: 'ana@x.com' });
    const alvo = w.fake.addFolder({ name: 'Alvo', parentId: 'ext', owner: 'bia@x.com' });
    const atalho = w.fake.addShortcut({ name: 'Atalho da Bia', parentId: 'ext', targetId: alvo.id, owner: 'bia@x.com' });
    const arq = w.fake.addFile({ name: 'solto.pdf', parentId: 'ext', owner: 'ana@x.com' });
    w.fake.addFolder({ name: 'Privada', parentId: 'ext', owner: 'ana@x.com' });
    w.fake.share(curso.id, 'dest');
    w.fake.share(atalho.id, 'dest');
    w.fake.share(arq.id, 'dest');
    const r = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=shared` });
    expect(r.statusCode).toBe(200);
    expect(r.json().folders).toEqual([
      { id: alvo.id, name: 'Atalho da Bia', shortcut: true },
      { id: curso.id, name: 'Curso da Ana' },
    ]);
  });

  it('q= busca pastas pelo nome em toda a conta, sem diferenciar maiúsculas, ignorando o pai', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    const sub = w.fake.addFolder({ name: 'Projetos', parentId: root, owner: 'dest@x.com' });
    w.fake.addFolder({ name: 'Curso de Lean', parentId: sub.id, owner: 'dest@x.com' });
    w.fake.addFolder({ name: 'Fotos', parentId: root, owner: 'dest@x.com' });
    w.fake.addFile({ name: 'curso.pdf', parentId: root, owner: 'dest@x.com' });
    const ext = w.fake.addFolder({ name: 'CURSO Zen', parentId: 'ext', owner: 'ana@x.com' });
    w.fake.share(ext.id, 'dest');
    w.fake.addFolder({ name: 'Curso privado', parentId: 'ext', owner: 'ana@x.com' });
    const r = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=root&q=curso` });
    expect(r.statusCode).toBe(200);
    expect(r.json().folders.map((f: { name: string }) => f.name)).toEqual(['Curso de Lean', 'CURSO Zen']);
  });

  it('atalhos para pasta entram na listagem com o id da pasta alvo; atalhos para arquivo ficam de fora', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    const alvo = w.fake.addFolder({ name: 'Alvo', parentId: 'ext', owner: 'ana@x.com' });
    const arq = w.fake.addFile({ name: 'a.pdf', parentId: 'ext', owner: 'ana@x.com' });
    w.fake.share(alvo.id, 'dest');
    w.fake.share(arq.id, 'dest');
    w.fake.addShortcut({ name: 'Para o Alvo', parentId: root, targetId: alvo.id, owner: 'dest@x.com' });
    w.fake.addShortcut({ name: 'Para o arquivo', parentId: root, targetId: arq.id, owner: 'dest@x.com' });
    w.fake.addFolder({ name: 'Normal', parentId: root, owner: 'dest@x.com' });
    const r = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=root` });
    expect(r.json().folders).toEqual([
      { id: expect.any(String), name: 'Normal' },
      { id: alvo.id, name: 'Para o Alvo', shortcut: true },
    ]);
  });
});

describe('POST /api/drive/folders', () => {
  it('cria a pasta dentro da pasta mãe e ela aparece na listagem seguinte', async () => {
    const w = world();
    const root = w.fake.rootOf('dest');
    const mae = w.fake.addFolder({ name: 'Projetos', parentId: root, owner: 'dest@x.com' });
    const r = await w.app.inject({ method: 'POST', url: '/api/drive/folders', payload: { accountId: w.dest.id, parentId: mae.id, name: '  Cursos 2026  ' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().folder).toEqual({ id: expect.any(String), name: 'Cursos 2026' });
    const lista = await w.app.inject({ url: `/api/drive/folders?accountId=${w.dest.id}&parentId=${mae.id}` });
    expect(lista.json().folders).toEqual([{ id: r.json().folder.id, name: 'Cursos 2026' }]);
  });

  it('`root` vale como pasta mãe; nome vazio e conta desconhecida são recusados', async () => {
    const w = world();
    const ok = await w.app.inject({ method: 'POST', url: '/api/drive/folders', payload: { accountId: w.dest.id, parentId: 'root', name: 'Na raiz' } });
    expect(ok.statusCode).toBe(200);
    expect(w.fake.children(w.fake.rootOf('dest')).map((n) => n.name)).toContain('Na raiz');
    const vazio = await w.app.inject({ method: 'POST', url: '/api/drive/folders', payload: { accountId: w.dest.id, parentId: 'root', name: '   ' } });
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json()).toMatchObject({ code: 'invalid_name' });
    const semConta = await w.app.inject({ method: 'POST', url: '/api/drive/folders', payload: { accountId: 'nope', parentId: 'root', name: 'X' } });
    expect(semConta.statusCode).toBe(404);
  });
});

describe('POST /api/inspect reaproveitando uma inspeção', () => {
  it('mesma conta de destino: troca só o destino, mantém o id e não relê a árvore', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const first = (await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: w.link } })).json();
    expect(first.totals.files).toBe(2);
    // A origem cresce depois da primeira leitura: reaproveitar é não enxergar o novo.
    w.fake.addFile({ name: 'c.mp4', parentId: w.src.id, owner: 'ana@x.com', content: '1' });
    const root = w.fake.rootOf('dest');
    const projetos = w.fake.addFolder({ name: 'Projetos', parentId: root, owner: 'dest@x.com' });
    const existente = w.fake.addFolder({ name: 'Curso', parentId: projetos.id, owner: 'dest@x.com' });
    const r = await w.app.inject({
      method: 'POST',
      url: '/api/inspect',
      payload: { link: w.link, inspectionId: first.inspectionId, destAccountId: w.dest.id, destParentId: projetos.id, destParentName: 'Projetos' },
    });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.inspectionId).toBe(first.inspectionId);
    expect(b).toMatchObject({ destParentId: projetos.id, destParentName: 'Projetos', totals: { files: 2 }, destConflict: { existingFolderId: existente.id } });
    expect(w.deps.inspections.get(first.inspectionId)?.result.destConflict).toEqual({ existingFolderId: existente.id });
  });

  it('outra conta de destino: relê a árvore e devolve um id novo', async () => {
    const w = world();
    const b = connectFakeAccount(w.deps, w.fake, 'b', 'b@x.com');
    w.fake.share(w.src.id, 'dest');
    w.fake.share(w.src.id, 'b');
    const first = (await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: w.link } })).json();
    w.fake.addFile({ name: 'c.mp4', parentId: w.src.id, owner: 'ana@x.com', content: '1' });
    const r = (
      await w.app.inject({
        method: 'POST',
        url: '/api/inspect',
        payload: { link: w.link, inspectionId: first.inspectionId, destAccountId: b.id, destParentId: 'root', destParentName: 'Meu Drive' },
      })
    ).json();
    expect(r.inspectionId).not.toBe(first.inspectionId);
    expect(r).toMatchObject({ destEmail: 'b@x.com', totals: { files: 3 } });
  });

  it('inspeção desconhecida ou expirada cai na análise completa', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const r = await w.app.inject({
      method: 'POST',
      url: '/api/inspect',
      payload: { link: w.link, inspectionId: 'sumiu', destAccountId: w.dest.id, destParentId: 'root', destParentName: 'Meu Drive' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ totals: { files: 2 } });
    expect(typeof r.json().inspectionId).toBe('string');
  });
});

describe('GET /api/inspect/progress', () => {
  it('token desconhecido é 404; ao terminar a análise o token some', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    expect((await w.app.inject({ url: '/api/inspect/progress?token=nada' })).statusCode).toBe(404);
    const r = await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link: w.link, progressToken: 'abc' } });
    expect(r.statusCode).toBe(200);
    expect((await w.app.inject({ url: '/api/inspect/progress?token=abc' })).statusCode).toBe(404);
  });

  it('enquanto a leitura corre, o token diz quantos arquivos já viu', async () => {
    const w = world();
    w.deps.inspectProgress.set('t1', 37);
    const r = await w.app.inject({ url: '/api/inspect/progress?token=t1' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ filesSeen: 37 });
  });
});

