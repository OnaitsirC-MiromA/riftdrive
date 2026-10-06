import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { AccountsRepo } from '../auth/accounts';
import { QuotaService } from '../drive/quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from '../drive/client';
import { listTree } from '../drive/tree';
import { JobsRepo } from './repo';
import { JobEngine } from './engine';
import { WORKING_SUFFIX, workingName } from './naming';

async function world(quotaLimit?: number) {
  const fake = new FakeDrive();
  fake.account('me', 'me@x.com');
  fake.account('old', 'old@x.com');
  const db = openDb(':memory:');
  const settings = new SettingsRepo(db);
  if (quotaLimit) settings.setQuota({ mode: 'limit', limitBytes: quotaLimit, resetHour: 4 });
  let now = new Date(2026, 0, 10, 5).getTime();
  const nowFn = () => now;
  const repo = new JobsRepo(db, nowFn);
  const accountsRepo = new AccountsRepo(db);
  const me = accountsRepo.insert({ email: 'me@x.com', refreshToken: 'rt-me', accessToken: 'tok-me', expiresAt: now + 1e9 });
  const old = accountsRepo.insert({ email: 'old@x.com', refreshToken: 'rt-old', accessToken: 'tok-old', expiresAt: now + 1e9 });
  const byId = new Map([
    [me.id, 'me'],
    [old.id, 'old'],
  ]);
  const clientFor = (accountId: string) => {
    const fakeId = byId.get(accountId)!;
    return new DriveClient(accountId, { getAccessToken: async () => `tok-${fakeId}`, invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });
  };
  const quota = new QuotaService(db, settings, nowFn);
  const engine = new JobEngine({ repo, accountsRepo, clientFor, quota, now: nowFn, chunkSize: 1024 * 1024 });

  const makeJob = async (name: string, files: string[], opts: { reader?: 'me' | 'old'; path?: 'rift' | 'machine' } = {}) => {
    const readerFake = opts.reader ?? 'me';
    const src = fake.addFolder({ name, parentId: 'ext', owner: 'd@x.com', readers: [readerFake] });
    for (const f of files) fake.addFile({ name: f, parentId: src.id, owner: 'd@x.com', content: '12345' });
    const readerId = readerFake === 'me' ? me.id : old.id;
    const job = repo.create({
      name, srcFolderId: src.id, srcReaderAccountId: readerId, destAccountId: me.id, destParentId: fake.rootOf('me'), destParentName: 'Meu Drive',
      destFinalName: name, path: opts.path ?? 'rift', mode: 'copy',
    });
    const tree = await listTree(clientFor(readerId), src.id);
    repo.insertFiles(job.id, tree.files.map((f) => ({ relPath: f.relPath, srcId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5 })));
    return job;
  };
  return { fake, repo, accountsRepo, engine, makeJob, me, setNow: (ms: number) => { now = ms; } };
}

describe('naming', () => {
  it('nome de trabalho e sufixo', () => {
    expect(workingName('Curso')).toBe(`Curso${WORKING_SUFFIX}`);
    expect(WORKING_SUFFIX).toBe(' (copiando…)');
  });
});

describe('JobEngine', () => {
  it('roda a fila em ordem, cria a pasta "(copiando…)" e renomeia ao concluir; registra a cópia e o resumo', async () => {
    const w = await world();
    const a = await w.makeJob('A', ['1.mp4']);
    const b = await w.makeJob('B', ['1.mp4', '2.mp4']);
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('done');
    expect(w.repo.get(b.id)!.status).toBe('queued');
    await w.engine.tick();
    expect(w.repo.get(b.id)!.status).toBe('done');
    expect(w.fake.children(w.fake.rootOf('me')).map((n) => n.name).sort()).toEqual(['A', 'B']);
    expect(w.fake.byPath(w.fake.rootOf('me'), 'B/2.mp4')).not.toBeNull();
    expect(w.repo.copies().map((c) => c.name).sort()).toEqual(['A', 'B']);
    const done = w.repo.get(b.id)!;
    expect(done.message).toMatch(/2 arquivos copiados/);
    expect(done.finished_at).toBeTruthy();
    expect(done.dest_folder_id).toBe(w.fake.byPath(w.fake.rootOf('me'), 'B')!.id);
    await w.engine.tick(); // sem nada na fila, não explode
  });

  it('caminho pela máquina usa a conta leitora para baixar e a de destino para subir', async () => {
    const w = await world();
    const j = await w.makeJob('M', ['x.bin'], { reader: 'old', path: 'machine' });
    await w.engine.tick();
    expect(w.repo.get(j.id)!.status).toBe('done');
    expect(w.fake.byPath(w.fake.rootOf('me'), 'M/x.bin')?.content.toString()).toBe('12345');
  });

  it('cota estourada pausa com horário e o tick após a renovação retoma', async () => {
    const w = await world(6);
    const a = await w.makeJob('A', ['1.mp4', '2.mp4']);
    await w.engine.tick();
    const paused = w.repo.get(a.id)!;
    expect(paused.status).toBe('paused_quota');
    expect(paused.paused_until).toBe(new Date(2026, 0, 11, 4).getTime());
    expect(paused.resume_reason).toMatch(/04:00/);
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('paused_quota');
    w.setNow(new Date(2026, 0, 11, 5).getTime());
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('done');
    expect(w.fake.byPath(w.fake.rootOf('me'), 'A')).not.toBeNull();
  });

  it('pause do usuário e resume; cancel e remove', async () => {
    const w = await world();
    const a = await w.makeJob('A', ['1.mp4']);
    w.engine.pause(a.id);
    expect(w.repo.get(a.id)!.status).toBe('paused');
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('paused');
    w.engine.resume(a.id);
    expect(w.repo.get(a.id)!.status).toBe('queued');
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('done');

    const b = await w.makeJob('B', ['1.mp4']);
    w.engine.cancel(b.id);
    expect(w.repo.get(b.id)!.status).toBe('canceled');
    expect(w.engine.remove(b.id)).toBe(true);
    expect(w.repo.get(b.id)).toBeNull();
  });

  it('resume também serve para pausas automáticas', async () => {
    const w = await world(6);
    const a = await w.makeJob('A', ['1.mp4', '2.mp4']);
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('paused_quota');
    w.engine.resume(a.id);
    expect(w.repo.get(a.id)!).toMatchObject({ status: 'queued', paused_until: null });
  });

  it('recoverOnBoot devolve running à fila', async () => {
    const w = await world();
    const a = await w.makeJob('A', ['1.mp4']);
    w.repo.update(a.id, { status: 'running' });
    w.engine.recoverOnBoot();
    expect(w.repo.get(a.id)!.status).toBe('queued');
  });

  it('conta desconectada → paused_auth e a conta de destino é marcada', async () => {
    const w = await world();
    const a = await w.makeJob('A', ['1.mp4']);
    w.fake.failNext({ reason: 'authError', status: 401, times: 10 });
    await w.engine.tick();
    expect(w.repo.get(a.id)!.status).toBe('paused_auth');
    expect(w.repo.get(a.id)!.paused_until).toBeNull();
    expect(w.accountsRepo.get(w.me.id)!.status).toBe('disconnected');
  });

  it('stats: velocidade e ETA enquanto roda; null depois', async () => {
    const w = await world();
    const a = await w.makeJob('A', ['1.mp4']);
    expect(w.engine.stats(a.id)).toBeNull();
    await w.engine.tick();
    expect(w.engine.isRunning(a.id)).toBe(false);
  });
});
