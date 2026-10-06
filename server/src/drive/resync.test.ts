import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { JobsRepo } from '../jobs/repo';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { ResyncService, diffTrees } from './resync';
import type { Tree, TreeEntry } from './tree';

const entry = (relPath: string, md5: string | null, size = 1): TreeEntry => ({
  relPath, id: `id-${relPath}`, name: relPath.split('/').pop()!, mimeType: 'application/octet-stream', size, md5, canCopy: true, canDownload: true, isNative: false,
});
const tree = (files: TreeEntry[]): Tree => ({ files, folders: [], totalBytes: files.reduce((n, f) => n + f.size, 0) });

describe('diffTrees', () => {
  it('novos e atualizados, agrupados pela primeira pasta', () => {
    const src = tree([entry('M1/a', 'A'), entry('M1/b', 'B2', 7), entry('M2/c', 'C'), entry('d', 'D'), entry('M1/n', null, 5)]);
    const dst = tree([entry('M1/a', 'A'), entry('M1/b', 'B1', 3), entry('M1/n', null, 5)]);
    const groups = diffTrees(src, dst);
    expect(groups.map((g) => [g.folder, g.newFiles, g.updatedFiles, g.bytes])).toEqual([
      ['(raiz)', 1, 0, 1],
      ['M1', 0, 1, 7],
      ['M2', 1, 0, 1],
    ]);
    expect(groups[1].files).toEqual([{ relPath: 'M1/b', kind: 'updated', entry: src.files[1] }]);
  });

  it('sem md5 compara tamanho; nativos sem md5 nunca contam como atualizados', () => {
    const native = { ...entry('Doc', null, 0), isNative: true, mimeType: 'application/vnd.google-apps.document' };
    const src = tree([entry('x', null, 9), native]);
    const dst = tree([entry('x', null, 3), native]);
    const groups = diffTrees(src, dst);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ folder: '(raiz)', updatedFiles: 1, newFiles: 0 });
  });

  it('tudo igual → nenhum grupo', () => {
    const t = tree([entry('a', 'A')]);
    expect(diffTrees(t, t)).toEqual([]);
  });
});

describe('ResyncService', () => {
  function world() {
    const fake = new FakeDrive();
    fake.account('me', 'me@x.com');
    const db = openDb(':memory:');
    const repo = new JobsRepo(db);
    const clientFor = () => new DriveClient('me', { getAccessToken: async () => 'tok-me', invalidate: () => {} }, fake.fetch, { sleep: async () => {} });
    const src = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    const m1 = fake.addFolder({ name: 'M1', parentId: src.id, owner: 'd@x.com' });
    fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: 'AAA' });
    fake.addFile({ name: 'b.mp4', parentId: m1.id, owner: 'd@x.com', content: 'NEW' });
    const m2 = fake.addFolder({ name: 'M2', parentId: src.id, owner: 'd@x.com' });
    fake.addFile({ name: 'c.mp4', parentId: m2.id, owner: 'd@x.com', content: 'CC' });
    const dest = fake.addFolder({ name: 'Curso', parentId: fake.rootOf('me'), owner: 'me@x.com', readers: ['me'] });
    const dm1 = fake.addFolder({ name: 'M1', parentId: dest.id, owner: 'me@x.com' });
    fake.addFile({ name: 'a.mp4', parentId: dm1.id, owner: 'me@x.com', content: 'AAA' });
    fake.addFile({ name: 'b.mp4', parentId: dm1.id, owner: 'me@x.com', content: 'OLD' });
    const copy = repo.upsertCopy({ srcFolderId: src.id, srcReaderAccountId: 'me', destFolderId: dest.id, destAccountId: 'me', name: 'Curso', path: 'rift' });
    return { fake, repo, service: new ResyncService({ repo, clientFor }), copy, dest };
  }

  it('check agrupa e marca a verificação; sync cria job merge só com o escolhido', async () => {
    const w = world();
    const { groups } = await w.service.check(w.copy.id);
    expect(groups.map((g) => [g.folder, g.newFiles, g.updatedFiles])).toEqual([
      ['M1', 0, 1],
      ['M2', 1, 0],
    ]);
    expect(w.repo.copy(w.copy.id)!.last_checked_at).toBeTruthy();

    const job = await w.service.sync(w.copy.id, ['M1']);
    expect(job).toMatchObject({ mode: 'merge', path: 'rift', dest_folder_id: w.dest.id, status: 'queued', total_files: 1 });
    expect(w.repo.files(job.id).map((f) => f.rel_path)).toEqual(['M1/b.mp4']);
    expect(JSON.parse(job.file_filter_json!)).toEqual(['M1']);
  });

  it('sync sem check antes é erro; cópia desconhecida é erro', async () => {
    const w = world();
    await expect(w.service.sync(w.copy.id, ['M1'])).rejects.toThrow(/verifica/i);
    await expect(w.service.check('nope')).rejects.toThrow(/não encontrada/i);
  });
});
