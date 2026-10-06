import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { listTree, uniqueName } from './tree';

const mk = () => {
  const fake = new FakeDrive();
  const me = fake.account('me', 'me@x.com');
  const client = new DriveClient('me', { getAccessToken: async () => me.accessToken, invalidate: () => {} }, fake.fetch, { sleep: async () => {} });
  return { fake, client };
};

describe('uniqueName', () => {
  it('numera repetidos preservando a extensão', () => {
    const used = new Set<string>();
    expect(uniqueName(used, 'a.mp4')).toBe('a.mp4');
    expect(uniqueName(used, 'a.mp4')).toBe('a (2).mp4');
    expect(uniqueName(used, 'a.mp4')).toBe('a (3).mp4');
    expect(uniqueName(used, 'sem-extensao')).toBe('sem-extensao');
    expect(uniqueName(used, 'sem-extensao')).toBe('sem-extensao (2)');
  });
});

describe('listTree', () => {
  it('percorre pastas, resolve atalhos e desambigua nomes repetidos', async () => {
    const { fake, client } = mk();
    const root = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    const m1 = fake.addFolder({ name: 'Módulo 1', parentId: root.id, owner: 'd@x.com' });
    fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '1234' });
    fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '56' });
    const other = fake.addFolder({ name: 'Extras', parentId: 'ext2', owner: 'd@x.com', readers: ['me'] });
    fake.addFile({ name: 'bonus.pdf', parentId: other.id, owner: 'd@x.com', content: 'pdf', canCopy: false });
    fake.addShortcut({ name: 'Bônus', parentId: root.id, targetId: other.id, owner: 'd@x.com' });
    fake.addNative({ name: 'Plano', parentId: root.id, owner: 'd@x.com', mimeType: 'application/vnd.google-apps.document' });

    const seen: number[] = [];
    const tree = await listTree(client, root.id, { onProgress: (n) => seen.push(n) });

    expect(tree.folders.map((f) => f.relPath).sort()).toEqual(['Bônus', 'Módulo 1']);
    expect(tree.files.map((f) => [f.relPath, f.size, f.canCopy, f.isNative])).toEqual([
      ['Bônus/bonus.pdf', 3, false, false],
      ['Módulo 1/a (2).mp4', 2, true, false],
      ['Módulo 1/a.mp4', 4, true, false],
      ['Plano', 0, true, true],
    ]);
    expect(tree.files.find((f) => f.relPath === 'Módulo 1/a.mp4')?.md5).toHaveLength(32);
    expect(tree.totalBytes).toBe(9);
    expect(seen.at(-1)).toBe(4);
  });

  it('atalho para arquivo entra como arquivo com o nome do atalho', async () => {
    const { fake, client } = mk();
    const root = fake.addFolder({ name: 'C', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    const elsewhere = fake.addFolder({ name: 'E', parentId: 'ext2', owner: 'd@x.com', readers: ['me'] });
    const target = fake.addFile({ name: 'real.mp4', parentId: elsewhere.id, owner: 'd@x.com', content: '123' });
    fake.addShortcut({ name: 'aula.mp4', parentId: root.id, targetId: target.id, owner: 'd@x.com' });
    const tree = await listTree(client, root.id);
    expect(tree.files.map((f) => [f.relPath, f.id, f.size])).toEqual([['aula.mp4', target.id, 3]]);
  });

  it('pagina listagens grandes', async () => {
    const { fake, client } = mk();
    const root = fake.addFolder({ name: 'Grande', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    for (let i = 0; i < 2500; i++) fake.addFile({ name: `f${String(i).padStart(4, '0')}.bin`, parentId: root.id, owner: 'd@x.com', content: 'x' });
    expect((await listTree(client, root.id)).files).toHaveLength(2500);
  });

  it('respeita cancelamento', async () => {
    const { fake, client } = mk();
    const ac = new AbortController();
    ac.abort();
    const root = fake.addFolder({ name: 'C', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    await expect(listTree(client, root.id, { signal: ac.signal })).rejects.toThrow(/cancelad/i);
  });
});
