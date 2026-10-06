import { describe, expect, it } from 'vitest';
import { connectFakeAccount, makeTestApp } from '../test/harness';

async function world() {
  const w = makeTestApp();
  const dest = connectFakeAccount(w.deps, w.fake, 'dest', 'dest@x.com');
  const src = w.fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'ana@x.com', readers: ['dest'] });
  const m1 = w.fake.addFolder({ name: 'M1', parentId: src.id, owner: 'ana@x.com' });
  w.fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'ana@x.com', content: '12345' });
  w.fake.addFile({ name: 'b.mp4', parentId: src.id, owner: 'ana@x.com', content: '678' });
  w.fake.addFile({ name: 'c.pdf', parentId: src.id, owner: 'ana@x.com', content: '12', canCopy: false });
  const link = `https://drive.google.com/drive/folders/${src.id}`;
  const inspect = async () => (await w.app.inject({ method: 'POST', url: '/api/inspect', payload: { link } })).json();
  const createJob = async (extra: Record<string, unknown> = {}) => {
    const insp = await inspect();
    const r = await w.app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { inspectionId: insp.inspectionId, name: insp.name, destAccountId: dest.id, destParentId: 'root', destParentName: 'Meu Drive', ...extra },
    });
    return { insp, r, job: r.json().job };
  };
  return { ...w, dest, src, link, inspect, createJob };
}

describe('jobs', () => {
  it('cria a partir da inspeção, roda no motor e expõe o resultado', async () => {
    const w = await world();
    const { r, job } = await w.createJob();
    expect(r.statusCode).toBe(201);
    expect(job).toMatchObject({
      name: 'Curso', path: 'rift', mode: 'copy', status: 'queued', totals: { files: 2, bytes: 8 }, done: { files: 0, bytes: 0 }, skippedFiles: 1,
      dest: { accountEmail: 'dest@x.com', parentName: 'Meu Drive', folderId: null, finalName: 'Curso' }, source: { readerEmail: 'dest@x.com' }, stats: null,
    });

    await w.deps.engine.tick();
    const after = (await w.app.inject({ url: `/api/jobs/${job.id}` })).json();
    expect(after.job).toMatchObject({ status: 'done', done: { files: 2, bytes: 8 } });
    expect(after.job.dest.folderId).toBe(w.fake.byPath(w.fake.rootOf('dest'), 'Curso')!.id);
    expect(after.counts).toMatchObject({ done: 2, skipped_blocked: 1 });
    expect(after.job.message).toMatch(/2 arquivos copiados/);

    const list = (await w.app.inject({ url: '/api/jobs' })).json();
    expect(list.jobs.map((j: { id: string }) => j.id)).toEqual([job.id]);

    const files = (await w.app.inject({ url: `/api/jobs/${job.id}/files?status=skipped_blocked` })).json().files;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ relPath: 'c.pdf', status: 'skipped_blocked', srcUrl: expect.stringContaining('drive.google.com/file/d/') });

    const copies = (await w.app.inject({ url: '/api/copies' })).json().copies;
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ name: 'Curso', path: 'rift', destAccountEmail: 'dest@x.com', destUrl: expect.stringContaining('drive.google.com/drive/folders/') });
  });

  it('conflito de nome: renomear gera "(2)"; mesclar usa a pasta existente em modo merge', async () => {
    const w = await world();
    const existing = w.fake.addFolder({ name: 'Curso', parentId: w.fake.rootOf('dest'), owner: 'dest@x.com' });
    const { insp } = await w.createJob({ conflict: 'rename' });
    expect(insp.destConflict).toEqual({ existingFolderId: existing.id });
    const renamed = (await w.app.inject({ url: '/api/jobs' })).json().jobs[0];
    expect(renamed.dest.finalName).toBe('Curso (2)');

    const { job: merged } = await w.createJob({ conflict: 'merge' });
    expect(merged).toMatchObject({ mode: 'merge', dest: { folderId: existing.id, finalName: 'Curso' } });

    const r = await w.app.inject({ method: 'POST', url: '/api/jobs', payload: { inspectionId: 'x', name: 'n', destAccountId: w.dest.id, destParentId: 'root', destParentName: 'Meu Drive' } });
    expect(r.statusCode).toBe(410);
  });

  it('pausar, retomar, cancelar, remover', async () => {
    const w = await world();
    const { job } = await w.createJob();
    expect((await w.app.inject({ method: 'POST', url: `/api/jobs/${job.id}/pause` })).statusCode).toBe(200);
    expect((await w.app.inject({ url: `/api/jobs/${job.id}` })).json().job.status).toBe('paused');
    await w.app.inject({ method: 'POST', url: `/api/jobs/${job.id}/resume` });
    expect((await w.app.inject({ url: `/api/jobs/${job.id}` })).json().job.status).toBe('queued');
    await w.app.inject({ method: 'POST', url: `/api/jobs/${job.id}/cancel` });
    expect((await w.app.inject({ url: `/api/jobs/${job.id}` })).json().job.status).toBe('canceled');
    expect((await w.app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` })).statusCode).toBe(200);
    expect((await w.app.inject({ url: `/api/jobs/${job.id}` })).statusCode).toBe(404);
  });

  it('re-sync: check e sync criam um job merge', async () => {
    const w = await world();
    const { job } = await w.createJob();
    await w.deps.engine.tick();
    const copy = (await w.app.inject({ url: '/api/copies' })).json().copies[0];
    w.fake.addFile({ name: 'novo.mp4', parentId: w.src.id, owner: 'ana@x.com', content: 'zz' });
    const check = (await w.app.inject({ method: 'POST', url: `/api/copies/${copy.id}/check` })).json();
    expect(check.groups).toEqual([{ folder: '(raiz)', newFiles: 1, updatedFiles: 0, bytes: 2 }]);
    const sync = await w.app.inject({ method: 'POST', url: `/api/copies/${copy.id}/sync`, payload: { folders: ['(raiz)'] } });
    expect(sync.statusCode).toBe(201);
    expect(sync.json().job).toMatchObject({ mode: 'merge', status: 'queued', totals: { files: 1 } });
    await w.deps.engine.tick();
    expect(w.fake.byPath(w.fake.rootOf('dest'), 'Curso/novo.mp4')).not.toBeNull();
    expect((await w.app.inject({ url: `/api/jobs/${job.id}` })).json().job.status).toBe('done');
    expect((await w.app.inject({ method: 'DELETE', url: `/api/copies/${copy.id}` })).statusCode).toBe(200);
    expect((await w.app.inject({ url: '/api/copies' })).json().copies).toHaveLength(0);
  });
});
