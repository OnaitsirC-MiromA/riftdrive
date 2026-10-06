import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { inspect } from './inspect';
import type { AccountRow } from '../types';

function world() {
  const fake = new FakeDrive();
  const db = openDb(':memory:');
  const quota = new QuotaService(db, new SettingsRepo(db));
  const acc = (id: string, email: string): AccountRow => {
    fake.account(id, email);
    return {
      id,
      email,
      refresh_token: 'r',
      access_token: `tok-${id}`,
      access_expires_at: Date.now() + 1e6,
      status: 'ok',
      is_default_dest: id === 'dest' ? 1 : 0,
      created_at: '',
      last_checked_at: null,
      failed_since: null,
    };
  };
  const accounts = [acc('dest', 'dest@x.com'), acc('old', 'old@x.com')];
  const clientFor = (id: string) => new DriveClient(id, { getAccessToken: async () => `tok-${id}`, invalidate: () => {} }, fake.fetch, { sleep: async () => {} });
  const src = fake.addFolder({ name: 'Asimov 2026', parentId: 'ext', owner: 'ana@x.com' });
  fake.addFile({ name: 'a.mp4', parentId: src.id, owner: 'ana@x.com', content: '12345' });
  fake.addFile({ name: 'b.pdf', parentId: src.id, owner: 'ana@x.com', content: '123', canCopy: false, canDownload: false });
  fake.addNative({ name: 'Notas', parentId: src.id, owner: 'ana@x.com', mimeType: 'application/vnd.google-apps.document' });
  const input = { link: `https://drive.google.com/drive/folders/${src.id}`, destAccountId: 'dest', destParentId: fake.rootOf('dest'), destParentName: 'Meu Drive' };
  const deps = { clientFor, accounts, quota };
  return { fake, quota, accounts, clientFor, src, input, deps };
}

describe('inspect', () => {
  it('pelo rift quando a conta de destino enxerga a origem', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const { result, tree } = await inspect(w.deps, w.input);
    expect(result).toMatchObject({
      folderId: w.src.id,
      name: 'Asimov 2026',
      owner: 'ana@x.com',
      path: 'rift',
      readerAccountId: 'dest',
      readerEmail: 'dest@x.com',
      destEmail: 'dest@x.com',
      totals: { files: 3, bytes: 8 },
      blocked: { count: 1, bytes: 3, sample: [{ name: 'b.pdf', relPath: 'b.pdf' }] },
      native: { count: 0 },
      copyableBytes: 5,
      destConflict: null,
      shareRequestText: null,
    });
    expect(result.quota.fits).toBe(true);
    expect(tree.files).toHaveLength(3);
  });

  it('pela máquina quando só outra conta enxerga; nativos ficam de fora e o pedido de compartilhamento vem pronto', async () => {
    const w = world();
    w.fake.share(w.src.id, 'old');
    const { result } = await inspect(w.deps, w.input);
    expect(result.path).toBe('machine');
    expect(result.readerAccountId).toBe('old');
    expect(result.blocked.count).toBe(1);
    expect(result.native.count).toBe(1);
    expect(result.copyableBytes).toBe(5);
    expect(result.shareRequestText).toContain('Asimov 2026');
    expect(result.shareRequestText).toContain('dest@x.com');
  });

  it('a conta de destino tem prioridade mesmo quando outra também enxerga', async () => {
    const w = world();
    w.fake.share(w.src.id, 'old');
    w.fake.share(w.src.id, 'dest');
    expect((await inspect(w.deps, w.input)).result.path).toBe('rift');
  });

  it('ninguém enxerga → no_access citando o e-mail do destino', async () => {
    const w = world();
    await expect(inspect(w.deps, w.input)).rejects.toMatchObject({ code: 'no_access', message: expect.stringContaining('dest@x.com') });
  });

  it('conta desconectada não é usada como leitora', async () => {
    const w = world();
    w.fake.share(w.src.id, 'old');
    w.accounts[1].status = 'disconnected';
    await expect(inspect(w.deps, w.input)).rejects.toMatchObject({ code: 'no_access' });
  });

  it('link inválido e link de arquivo', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    await expect(inspect(w.deps, { ...w.input, link: 'nada' })).rejects.toMatchObject({ code: 'invalid_link' });
    const file = w.fake.children(w.src.id)[0];
    await expect(inspect(w.deps, { ...w.input, link: file.id })).rejects.toMatchObject({ code: 'not_a_folder' });
  });

  it('atalho para pasta é seguido; conflito de nome no destino é detectado', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const sc = w.fake.addShortcut({ name: 'Atalho', parentId: w.fake.rootOf('dest'), targetId: w.src.id, owner: 'dest@x.com', readers: ['dest'] });
    const existing = w.fake.addFolder({ name: 'Asimov 2026', parentId: w.fake.rootOf('dest'), owner: 'dest@x.com', readers: ['dest'] });
    const { result } = await inspect(w.deps, { ...w.input, link: sc.id });
    expect(result.folderId).toBe(w.src.id);
    expect(result.name).toBe('Asimov 2026');
    expect(result.destConflict).toEqual({ existingFolderId: existing.id });
  });

  it('cota: informa quando não cabe no dia', async () => {
    const w = world();
    w.fake.share(w.src.id, 'dest');
    const settings = new SettingsRepo((w.quota as unknown as { db: never }).db);
    settings.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 });
    w.quota.record('dest', 97);
    const { result } = await inspect(w.deps, w.input);
    expect(result.quota).toMatchObject({ fits: false, mode: 'limit', remainingBytes: 3 });
  });
});
