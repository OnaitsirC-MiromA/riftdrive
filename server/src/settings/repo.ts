import type { Db } from '../db';

export interface QuotaSettings {
  mode: 'limit' | 'unlimited';
  limitBytes: number;
  resetHour: number;
}

export interface DefaultDest {
  accountId: string;
  folderId: string;
  folderName: string;
}

// 600 GiB por dia, renovando às 04:00: folga abaixo dos ~750 GB/dia que o
// Google permite, e uma hora em que ninguém está olhando.
export const DEFAULT_QUOTA: QuotaSettings = { mode: 'limit', limitBytes: 600 * 1024 ** 3, resetHour: 4 };

export class SettingsRepo {
  constructor(private db: Db) {}

  get(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  quota(): QuotaSettings {
    const mode = (this.get('quota_mode') as QuotaSettings['mode'] | null) ?? DEFAULT_QUOTA.mode;
    const limitBytes = Number(this.get('quota_limit_bytes') ?? DEFAULT_QUOTA.limitBytes);
    const resetHour = Number(this.get('quota_reset_hour') ?? DEFAULT_QUOTA.resetHour);
    return { mode, limitBytes, resetHour };
  }

  setQuota(p: Partial<QuotaSettings>): void {
    if (p.mode) this.set('quota_mode', p.mode);
    if (p.limitBytes !== undefined) this.set('quota_limit_bytes', String(Math.max(1, Math.floor(p.limitBytes))));
    if (p.resetHour !== undefined) this.set('quota_reset_hour', String(Math.min(23, Math.max(0, Math.floor(p.resetHour)))));
  }

  defaultDest(): DefaultDest | null {
    const accountId = this.get('default_dest_account_id');
    const folderId = this.get('default_dest_folder_id');
    const folderName = this.get('default_dest_folder_name');
    return accountId && folderId && folderName ? { accountId, folderId, folderName } : null;
  }

  setDefaultDest(d: DefaultDest | null): void {
    if (!d) {
      this.db.prepare("DELETE FROM settings WHERE key IN ('default_dest_account_id','default_dest_folder_id','default_dest_folder_name')").run();
      return;
    }
    this.set('default_dest_account_id', d.accountId);
    this.set('default_dest_folder_id', d.folderId);
    this.set('default_dest_folder_name', d.folderName);
  }
}
