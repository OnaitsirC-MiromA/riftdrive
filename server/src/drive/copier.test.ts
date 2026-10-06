import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { JobsRepo } from '../jobs/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { listTree } from './tree';
import { runRift } from './copier';

async function world(opts: { quotaLimit?: number } = {}) {
  const fake = new FakeDrive();
  fake.account('me', 'me@x.com');
  const db = openDb(':memory:');
  const settings = new SettingsRepo(db);
  if (opts.quotaLimit) settings.setQuota({ mode: 'limit', limitBytes: opts.quotaLimit, resetHour: 4 });
  let now = new Date(2026, 0, 10, 5).getTime();
  const nowFn = () => now;
  const quota = new QuotaService(db, settings, nowFn);
  const repo = new JobsRepo(db, nowFn);
  const client = new DriveClient('me', { getAccessToken: async () => 'tok-me', invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });

  const src = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
  const m1 = fake.addFolder({ name: 'M1', parentId: src.id, owner: 'd@x.com' });
  fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '12345' });
  fake.addFile({ name: 'b.mp4', parentId: m1.id, owner: 'd@x.com', content: '678' });
  fake.addFile({ name: 'c.pdf', parentId: src.id, owner: 'd@x.com', content: 'pp', canCopy: false });
  const dest = fake.addFolder({ name: 'Curso (copiando…)', parentId: fake.rootOf('me'), owner: 'me@x.com', readers: ['me'] });

  const job = repo.create({
    name: 'Curso', srcFolderId: src.id, srcReaderAccountId: 'me', destAccountId: 'me', destParentId: fake.rootOf('me'), destParentName: 'Meu Drive',
    destFinalName: 'Curso', path: 'rift', mode: 'copy', destFolderId: dest.id,
  });
  const tree = await listTree(client, src.id);
  repo.insertFiles(
    job.id,
    tree.files.map((f) => ({ relPath: f.relPath, srcId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5, status: f.canCopy ? 'pending' : 'skipped_blocked' })),
  );

  const run = (signal = new AbortController().signal) => runRift({ job: repo.get(job.id)!, repo, quota, signal, now: nowFn, concurrency: 2, client });
  return { fake, repo, quota, job, dest, run, client, src, setNow: (ms: number) => { now = ms; } };
}

describe('runRift', () => {
  it('espelha a árvore, copia o que pode, pula bloqueado, registra cota', async () => {
    const w = await world();
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.fake.byPath(w.dest.id, 'M1/a.mp4')?.content.toString()).toBe('12345');
    expect(w.fake.byPath(w.dest.id, 'M1/b.mp4')).not.toBeNull();
    expect(w.fake.byPath(w.dest.id, 'c.pdf')).toBeNull();
    expect(w.repo.get(w.job.id)).toMatchObject({ done_files: 2, done_bytes: 8, skipped_files: 1 });
    expect(w.quota.used('me')).toBe(8);
    expect(w.repo.folder(w.job.id, 'M1')).toBe(w.fake.byPath(w.dest.id, 'M1')!.id);
    expect(w.repo.files(w.job.id, 'done').map((f) => f.dest_id)).toEqual([w.fake.byPath(w.dest.id, 'M1/a.mp4')!.id, w.fake.byPath(w.dest.id, 'M1/b.mp4')!.id]);
  });

  it('retomada: o que já está done não é copiado de novo nem a pasta recriada', async () => {
    const w = await world();
    w.repo.setFile(w.job.id, 'M1/a.mp4', { status: 'done', dest_id: 'x' });
    const m1 = w.fake.addFolder({ name: 'M1', parentId: w.dest.id, owner: 'me@x.com' });
    w.repo.setFolder(w.job.id, 'M1', m1.id);
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.fake.children(w.dest.id).map((n) => n.name)).toEqual(['M1']);
    expect(w.fake.children(m1.id).map((n) => n.name)).toEqual(['b.mp4']);
  });

  it('cota do dia estourada pausa até a renovação', async () => {
    const w = await world({ quotaLimit: 6 });
    const r = await w.run();
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') {
      expect(r.reason.kind).toBe('quota');
      expect(r.reason.until).toBe(new Date(2026, 0, 11, 4).getTime());
    }
    expect(w.repo.get(w.job.id)!.done_files).toBe(1);
  });

  it('downloadQuotaExceeded adia o arquivo por 24h e segue com os outros', async () => {
    const w = await world();
    w.fake.failNext({ reason: 'downloadQuotaExceeded', urlIncludes: '/copy' });
    const r = await w.run();
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') {
      expect(r.reason.kind).toBe('quota');
      expect(r.reason.until).toBe(new Date(2026, 0, 11, 5).getTime());
    }
    const files = w.repo.files(w.job.id);
    expect(files.filter((f) => f.status === 'done')).toHaveLength(1);
    expect(files.filter((f) => f.status === 'deferred')).toHaveLength(1);
    expect(w.repo.get(w.job.id)!.deferred_files).toBe(1);
  });

  it('deferido vencido é retomado', async () => {
    const w = await world();
    w.repo.setFile(w.job.id, 'M1/a.mp4', { status: 'deferred', deferred_until: new Date(2026, 0, 10, 4).getTime() });
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.repo.get(w.job.id)!.done_files).toBe(2);
  });

  it('conta desconectada pausa por auth', async () => {
    const w = await world();
    w.fake.failNext({ reason: 'authError', status: 401, times: 10 });
    const r = await w.run();
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') expect(r.reason.kind).toBe('auth');
  });

  it('destino cheio pausa por storage', async () => {
    const w = await world();
    w.fake.setStorageFull('me', true);
    const r = await w.run();
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') expect(r.reason.kind).toBe('storage');
  });

  it('limite diário do Google pausa por 1h; rate limit persistente também', async () => {
    const w = await world();
    w.fake.failNext({ reason: 'dailyLimitExceeded', urlIncludes: '/copy', times: 10 });
    const r = await w.run();
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') {
      expect(r.reason.kind).toBe('quota');
      expect(r.reason.until).toBe(new Date(2026, 0, 10, 6).getTime());
    }
    const w2 = await world();
    w2.fake.failNext({ reason: 'userRateLimitExceeded', urlIncludes: '/copy', times: 50 });
    const r2 = await w2.run();
    expect(r2.kind).toBe('paused');
    if (r2.kind === 'paused') expect(r2.reason.kind).toBe('quota');
    expect(w2.repo.files(w2.job.id, 'pending').length).toBe(2);
  });

  it('arquivo que sumiu da origem fica como missing e o job segue', async () => {
    const w = await world();
    const a = w.fake.byPath(w.src.id, 'M1/a.mp4')!;
    w.fake.nodes.get(a.id)!.trashed = true;
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.repo.fileCounts(w.job.id)).toMatchObject({ done: 1, missing: 1, skipped_blocked: 1 });
  });

  it('erro fatal marca o arquivo como failed e o job segue', async () => {
    const w = await world();
    w.fake.failNext({ reason: 'badRequest', status: 400, urlIncludes: '/copy' });
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.repo.fileCounts(w.job.id)).toMatchObject({ done: 1, failed: 1 });
    expect(w.repo.files(w.job.id, 'failed')[0].last_error).toBeTruthy();
  });

  it('abort devolve aborted sem tocar no inventário', async () => {
    const w = await world();
    const ac = new AbortController();
    ac.abort();
    expect(await w.run(ac.signal)).toEqual({ kind: 'aborted' });
    expect(w.repo.get(w.job.id)!.done_files).toBe(0);
  });

  it('merge: igual é pulado sem copiar; diferente renomeia o antigo para "(versão anterior)"', async () => {
    const w = await world();
    const m1 = w.fake.addFolder({ name: 'M1', parentId: w.dest.id, owner: 'me@x.com' });
    w.fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'me@x.com', content: '12345' });
    const old = w.fake.addFile({ name: 'b.mp4', parentId: m1.id, owner: 'me@x.com', content: 'OLD' });
    w.repo.update(w.job.id, { mode: 'merge' });
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.fake.children(m1.id).map((n) => n.name).sort()).toEqual(['a.mp4', 'b.mp4', 'b.mp4 (versão anterior)']);
    expect(w.fake.nodes.get(old.id)!.name).toBe('b.mp4 (versão anterior)');
    expect(w.fake.children(m1.id).find((n) => n.name === 'b.mp4')!.content.toString()).toBe('678');
    expect(w.repo.fileCounts(w.job.id)).toMatchObject({ done: 2 });
    expect(w.quota.used('me')).toBe(3);
  });
});
