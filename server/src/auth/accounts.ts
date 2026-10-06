import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { AccountRow, AccountStatus } from '../types';
import type { OauthClientRepo } from './client-config';
import { OAuthError, refreshAccessToken } from './oauth';
import { t } from '../i18n/strings';

// Quem entrega access tokens ao DriveClient. Separado em interface para os
// testes do cliente não precisarem de banco nem de OAuth.
export interface TokenProvider {
  getAccessToken(accountId: string): Promise<string>;
  invalidate(accountId: string): void;
}

export class AccountsRepo {
  constructor(private db: Db) {}

  list(): AccountRow[] {
    return this.db.prepare('SELECT * FROM accounts ORDER BY created_at, rowid').all() as unknown as AccountRow[];
  }

  get(id: string): AccountRow | null {
    return (this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined) ?? null;
  }

  byEmail(email: string): AccountRow | null {
    return (this.db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.toLowerCase()) as AccountRow | undefined) ?? null;
  }

  insert(a: { email: string; refreshToken: string; accessToken: string | null; expiresAt: number | null }): AccountRow {
    const id = randomUUID();
    // A primeira conta conectada é, naturalmente, o destino padrão.
    const isFirst = this.list().length === 0 ? 1 : 0;
    this.db
      .prepare(
        `INSERT INTO accounts(id, email, refresh_token, access_token, access_expires_at, status, is_default_dest, created_at)
         VALUES(?, ?, ?, ?, ?, 'ok', ?, ?)`,
      )
      .run(id, a.email.toLowerCase(), a.refreshToken, a.accessToken, a.expiresAt, isFirst, new Date().toISOString());
    return this.get(id)!;
  }

  updateTokens(id: string, accessToken: string, expiresAt: number): void {
    this.db
      .prepare('UPDATE accounts SET access_token = ?, access_expires_at = ?, last_checked_at = ? WHERE id = ?')
      .run(accessToken, expiresAt, new Date().toISOString(), id);
  }

  setRefreshToken(id: string, refreshToken: string): void {
    this.db
      .prepare("UPDATE accounts SET refresh_token = ?, access_token = NULL, access_expires_at = NULL, status = 'ok', failed_since = NULL WHERE id = ?")
      .run(refreshToken, id);
  }

  setStatus(id: string, status: AccountStatus, failedSince: string | null = null): void {
    this.db.prepare('UPDATE accounts SET status = ?, failed_since = ? WHERE id = ?').run(status, failedSince, id);
  }

  setDefault(id: string): void {
    this.db.prepare('UPDATE accounts SET is_default_dest = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id);
  }

  remove(id: string): void {
    const wasDefault = this.get(id)?.is_default_dest === 1;
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    if (wasDefault) {
      const next = this.list()[0];
      if (next) this.setDefault(next.id);
    }
  }

  defaultDest(): AccountRow | null {
    return (this.db.prepare('SELECT * FROM accounts WHERE is_default_dest = 1').get() as AccountRow | undefined) ?? this.list()[0] ?? null;
  }
}

// Renova com um minuto de folga: um token que expira no meio de um upload de
// 16 MB daria 401 à toa.
const REFRESH_MARGIN_MS = 60_000;

export class AccountsService implements TokenProvider {
  private inflight = new Map<string, Promise<string>>();

  constructor(
    private repo: AccountsRepo,
    private oauthClient: OauthClientRepo,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  async getAccessToken(accountId: string): Promise<string> {
    const a = this.repo.get(accountId);
    if (!a) throw new Error(t.accounts.notFound);
    if (a.access_token && a.access_expires_at && a.access_expires_at - this.now() > REFRESH_MARGIN_MS) return a.access_token;
    // Várias chamadas paralelas (o motor copia 4 arquivos por vez) viram uma
    // renovação só.
    const running = this.inflight.get(accountId);
    if (running) return running;
    const p = this.refresh(a).finally(() => this.inflight.delete(accountId));
    this.inflight.set(accountId, p);
    return p;
  }

  private async refresh(a: { id: string; refresh_token: string }): Promise<string> {
    const client = this.oauthClient.get();
    if (!client) throw new Error(t.accounts.noClient);
    try {
      const r = await refreshAccessToken({ refreshToken: a.refresh_token, client }, this.fetchFn);
      const expiresAt = this.now() + r.expiresInSec * 1000;
      this.repo.updateTokens(a.id, r.accessToken, expiresAt);
      if (this.repo.get(a.id)?.status !== 'ok') this.repo.setStatus(a.id, 'ok', null);
      return r.accessToken;
    } catch (err) {
      if (err instanceof OAuthError && (err.code === 'invalid_grant' || err.code === 'invalid_client')) this.markDisconnected(a.id);
      throw err;
    }
  }

  invalidate(accountId: string): void {
    this.repo.updateTokens(accountId, '', 0);
  }

  markDisconnected(accountId: string): void {
    const a = this.repo.get(accountId);
    if (a && a.status !== 'disconnected') this.repo.setStatus(accountId, 'disconnected', new Date(this.now()).toISOString());
  }

  // Força uma renovação e uma chamada real: é o "Testar conexão" das Configurações.
  async testConnection(accountId: string, aboutEmail: (token: string) => Promise<string>): Promise<{ ok: boolean; email?: string; error?: string }> {
    try {
      this.invalidate(accountId);
      const token = await this.getAccessToken(accountId);
      const email = await aboutEmail(token);
      return { ok: true, email };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
