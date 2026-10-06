import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { JobsRepo } from '../jobs/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { runMachine, transferOneFile } from './transfer';

const MIB = 1024 * 1024;

function world(content = 'x'.repeat(2_500_000)) {
  const fake = new FakeDrive();
  fake.account('old', 'old@x.com');
  fake.account('new', 'new@x.com');
  const db = openDb(':memory:');
  const repo = new JobsRepo(db);
  const quota = new QuotaService(db, new SettingsRepo(db));
  const client = (id: string) => new DriveClient(id, { getAccessToken: async () => `tok-${id}`, invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });

  const src = fake.addFolder({ name: 'Backup', parentId: 'ext', owner: 'old@x.com', readers: ['old'] });
  const big = fake.addFile({ name: 'big.bin', parentId: src.id, owner: 'old@x.com', content });
  const empty = fake.addFile({ name: 'empty.txt', parentId: src.id, owner: 'old@x.com', content: Buffer.alloc(0), mimeType: 'text/plain' });
  const doc = fake.addNative({ name: 'Doc', parentId: src.id, owner: 'old@x.com', mimeType: 'application/vnd.google-apps.document' });
  const dest = fake.addFolder({ name: 'Backup (copiando…)', parentId: fake.rootOf('new'), owner: 'new@x.com', readers: ['new'] });

  const job = repo.create({
    name: 'Backup', srcFolderId: src.id, srcReaderAccountId: 'old', destAccountId: 'new', destParentId: fake.rootOf('new'), destParentName: 'Meu Drive',
    destFinalName: 'Backup', path: 'machine', mode: 'copy', destFolderId: dest.id,
  });
  repo.insertFiles(job.id, [
    { relPath: 'big.bin', srcId: big.id, name: 'big.bin', mimeType: 'application/octet-stream', size: content.length, md5: null },
    { relPath: 'empty.txt', srcId: empty.id, name: 'empty.txt', mimeType: 'text/plain', size: 0, md5: null },
    { relPath: 'Doc', srcId: doc.id, name: 'Doc', mimeType: 'application/vnd.google-apps.document', size: 0, md5: null },
  ]);
  const fileRow = (relPath: string) => repo.files(job.id).find((f) => f.rel_path === relPath)!;
  return { fake, repo, quota, job: repo.get(job.id)!, dest, reader: client('old'), writer: client('new'), content, fileRow };
}

describe('transferOneFile', () => {
  it('sobe em blocos de 1 MiB, persistindo o progresso, e conclui', async () => {
    const w = world();
    const seen: number[] = [];
    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job, chunkSize: MIB, onBytes: (n) => seen.push(n) }, w.fileRow('big.bin'), w.dest.id);
    expect(out.status).toBe('done');
    expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe(w.content);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(w.content.length);
    expect(w.fake.calls.filter((c) => c.method === 'PUT')).toHaveLength(3);
    expect(w.fileRow('big.bin').bytes_uploaded).toBe(w.content.length);
  });

  it('retoma do meio: sessão guardada + Range no download, sem abrir outra sessão', async () => {
    const w = world();
    const uri = await w.writer.createUploadSession({ name: 'big.bin', parentId: w.dest.id, mimeType: 'application/octet-stream', size: w.content.length });
    await w.writer.uploadChunk(uri, Buffer.from(w.content.slice(0, MIB)), 0, w.content.length);
    w.repo.setFile(w.job.id, 'big.bin', { upload_uri: uri, bytes_uploaded: MIB });
    w.fake.calls.length = 0;

    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job, chunkSize: MIB }, w.fileRow('big.bin'), w.dest.id);
    expect(out.status).toBe('done');
    expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe(w.content);
    const download = w.fake.calls.find((c) => c.url.includes('alt=media'));
    expect(download).toBeTruthy();
    expect(w.fake.calls.filter((c) => c.method === 'POST' && c.url.includes('uploadType=resumable'))).toHaveLength(0);
    expect(w.fake.calls.filter((c) => c.method === 'PUT' && c.url.includes(uri.split('upload_id=')[1]))).toHaveLength(3); // status + 2 blocos
  });

  it('sessão expirada recomeça o arquivo do zero', async () => {
    const w = world('abc');
    const uri = await w.writer.createUploadSession({ name: 'big.bin', parentId: w.dest.id, mimeType: 'application/octet-stream', size: 3 });
    w.repo.setFile(w.job.id, 'big.bin', { upload_uri: uri, bytes_uploaded: 2 });
    w.fake.expireSession(uri);
    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.fileRow('big.bin'), w.dest.id);
    expect(out.status).toBe('done');
    expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe('abc');
    expect(w.fileRow('big.bin').upload_uri).not.toBe(uri);
  });

  it('vazio vira arquivo vazio; nativo fica de fora com motivo', async () => {
    const w = world('a');
    expect((await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.fileRow('empty.txt'), w.dest.id)).status).toBe('done');
    expect(w.fake.byPath(w.dest.id, 'empty.txt')).not.toBeNull();
    const doc = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.fileRow('Doc'), w.dest.id);
    expect(doc.status).toBe('skipped_native');
  });

  it('download bloqueado pelo dono sobe como erro para o laço classificar', async () => {
    const w = world('abc');
    w.fake.nodes.get(w.fileRow('big.bin').src_id)!.canDownload = false;
    await expect(transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.fileRow('big.bin'), w.dest.id)).rejects.toMatchObject({ reason: 'cannotDownloadFile' });
  });
});

describe('runMachine', () => {
  it('conclui o job inteiro e registra cota pelo que subiu', async () => {
    const w = world('abc');
    const r = await runMachine({ job: w.job, repo: w.repo, quota: w.quota, signal: new AbortController().signal, now: Date.now, concurrency: 2, reader: w.reader, writer: w.writer, chunkSize: MIB });
    expect(r).toEqual({ kind: 'completed' });
    expect(w.repo.fileCounts(w.job.id)).toMatchObject({ done: 2, skipped_native: 1 });
    expect(w.quota.used('new')).toBe(3);
  });

  it('destino sem espaço pausa por storage', async () => {
    const w = world('abc');
    w.fake.setStorageFull('new', true);
    const r = await runMachine({ job: w.job, repo: w.repo, quota: w.quota, signal: new AbortController().signal, now: Date.now, concurrency: 1, reader: w.reader, writer: w.writer, chunkSize: MIB });
    expect(r.kind).toBe('paused');
    if (r.kind === 'paused') expect(r.reason.kind).toBe('storage');
  });
});
