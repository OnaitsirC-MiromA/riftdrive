import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { DEFAULT_QUOTA, SettingsRepo } from './repo';

describe('SettingsRepo', () => {
  it('cota padrão: limite de 600 GiB renovando às 04:00', () => {
    const s = new SettingsRepo(openDb(':memory:'));
    expect(s.quota()).toEqual({ mode: 'limit', limitBytes: 600 * 1024 ** 3, resetHour: 4 });
    expect(s.quota()).toEqual(DEFAULT_QUOTA);
  });

  it('setQuota aceita parcial e limita a hora a 0–23', () => {
    const s = new SettingsRepo(openDb(':memory:'));
    s.setQuota({ mode: 'unlimited', resetHour: 30 });
    expect(s.quota()).toMatchObject({ mode: 'unlimited', resetHour: 23, limitBytes: DEFAULT_QUOTA.limitBytes });
    s.setQuota({ limitBytes: 10 * 1024 ** 3, resetHour: -2 });
    expect(s.quota()).toMatchObject({ limitBytes: 10 * 1024 ** 3, resetHour: 0 });
  });

  it('destino padrão vai e volta', () => {
    const s = new SettingsRepo(openDb(':memory:'));
    expect(s.defaultDest()).toBeNull();
    s.setDefaultDest({ accountId: 'a', folderId: 'root', folderName: 'Meu Drive' });
    expect(s.defaultDest()).toEqual({ accountId: 'a', folderId: 'root', folderName: 'Meu Drive' });
    s.setDefaultDest(null);
    expect(s.defaultDest()).toBeNull();
  });
});
