import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { JobsRepo } from './repo';

const base = {
  name: 'J',
  srcFolderId: 's',
  srcReaderAccountId: 'a',
  destAccountId: 'a',
  destParentId: 'p',
  destParentName: 'P',
  destFinalName: 'J',
  path: 'rift' as const,
  mode: 'copy' as const,
};
const file = (relPath: string, size = 1, extra: Record<string, unknown> = {}) => ({ relPath, srcId: `id-${relPath}`, name: relPath.split('/').pop()!, mimeType: 'x', size, md5: null, ...extra });

describe('JobsRepo', () => {
  it('cria queued, insere inventário e soma totais só do que é pendente', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const j = r.create(base);
    expect(j.status).toBe('queued');
    expect(j.dest_folder_id).toBeNull();
    r.insertFiles(j.id, [file('a', 10), file('b', 5, { status: 'skipped_blocked' })]);
    expect(r.get(j.id)).toMatchObject({ total_files: 1, total_bytes: 10, skipped_files: 1 });
    expect(r.list()).toHaveLength(1);
    expect(r.listByStatus(['queued'])).toHaveLength(1);
    expect(r.listByStatus(['done'])).toHaveLength(0);
  });

  it('create aceita destFolderId e filtro de pastas (merge)', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const j = r.create({ ...base, mode: 'merge', destFolderId: 'existing', fileFilter: ['M1', 'M2'] });
    expect(j).toMatchObject({ mode: 'merge', dest_folder_id: 'existing', file_filter_json: JSON.stringify(['M1', 'M2']) });
  });

  it('nextPending prioriza menos tentativas e inclui deferidos vencidos', () => {
    let now = 500;
    const r = new JobsRepo(openDb(':memory:'), () => now);
    const j = r.create(base);
    r.insertFiles(j.id, [file('a'), file('b'), file('c')]);
    r.setFile(j.id, 'a', { attempts: 2 });
    r.setFile(j.id, 'c', { status: 'deferred', deferred_until: 1000 });
    expect(r.nextPending(j.id, 10).map((f) => f.rel_path)).toEqual(['b', 'a']);
    expect(r.countPending(j.id)).toEqual({ pending: 2, deferredFuture: 1, minDeferredUntil: 1000 });
    now = 2000; // o deferido venceu: volta a contar como pronto para processar
    expect(r.nextPending(j.id, 10).map((f) => f.rel_path)).toEqual(['b', 'c', 'a']);
    expect(r.countPending(j.id)).toEqual({ pending: 3, deferredFuture: 0, minDeferredUntil: 1000 });
    expect(r.nextPending(j.id, 1)).toHaveLength(1);
  });

  it('update aceita só colunas conhecidas', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const j = r.create(base);
    r.update(j.id, { status: 'running', started_at: '2026-01-01T00:00:00Z', message: 'oi' });
    expect(r.get(j.id)).toMatchObject({ status: 'running', started_at: '2026-01-01T00:00:00Z', message: 'oi' });
    expect(() => r.update(j.id, { nope: 1 } as never)).toThrow(/coluna/);
  });

  it('recount, fileCounts, files por estado e cascata', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const j = r.create(base);
    r.insertFiles(j.id, [file('a', 10), file('b', 5), file('c', 2)]);
    r.setFile(j.id, 'a', { status: 'done', dest_id: 'd1' });
    r.setFile(j.id, 'c', { status: 'failed', last_error: 'x' });
    r.recount(j.id);
    expect(r.get(j.id)).toMatchObject({ done_files: 1, done_bytes: 10, skipped_files: 0, deferred_files: 0 });
    expect(r.fileCounts(j.id)).toEqual({ pending: 1, done: 1, skipped_blocked: 0, skipped_native: 0, deferred: 0, missing: 0, failed: 1 });
    expect(r.files(j.id, 'done').map((f) => f.rel_path)).toEqual(['a']);
    expect(r.files(j.id).map((f) => f.rel_path)).toEqual(['a', 'b', 'c']);
    expect(r.files(j.id, undefined, 1, 1).map((f) => f.rel_path)).toEqual(['b']);
    r.setFolder(j.id, 'M1', 'f1');
    expect(r.folder(j.id, 'M1')).toBe('f1');
    expect(r.folder(j.id, 'M2')).toBeNull();
    r.remove(j.id);
    expect(r.list()).toHaveLength(0);
    expect(r.folder(j.id, 'M1')).toBeNull();
  });

  it('copies: upsert por (origem, destino), touch e remoção', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const c1 = r.upsertCopy({ srcFolderId: 's', srcReaderAccountId: 'a', destFolderId: 'd', destAccountId: 'a', name: 'N', path: 'rift' });
    const c2 = r.upsertCopy({ srcFolderId: 's', srcReaderAccountId: 'a', destFolderId: 'd', destAccountId: 'a', name: 'N2', path: 'rift' });
    expect(c1.id).toBe(c2.id);
    expect(r.copies()[0].name).toBe('N2');
    expect(r.copy(c1.id)?.last_synced_at).toBeNull();
    r.touchCopy(c1.id, { synced: true });
    expect(r.copy(c1.id)?.last_synced_at).toBeTruthy();
    r.touchCopy(c1.id, { checked: true });
    expect(r.copy(c1.id)?.last_checked_at).toBeTruthy();
    r.removeCopy(c1.id);
    expect(r.copies()).toHaveLength(0);
  });
});
