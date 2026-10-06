import type { Db } from '../db';

// O que o Google Cloud entrega para um client "App para computador".
export function validateClientId(id: string): boolean {
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim());
}

const SUFFIX = '.apps.googleusercontent.com';

// Suficiente para o usuário reconhecer qual client está configurado (os seis
// últimos caracteres do identificador), sem expor o id inteiro na tela.
export function maskClientId(id: string): string {
  const local = id.endsWith(SUFFIX) ? id.slice(0, -SUFFIX.length) : id;
  return `…${local.slice(-6)}${SUFFIX}`;
}

export class OauthClientRepo {
  constructor(private db: Db) {}

  get(): { clientId: string; clientSecret: string } | null {
    const r = this.db.prepare('SELECT client_id, client_secret FROM oauth_client WHERE id = 1').get() as
      | { client_id: string; client_secret: string }
      | undefined;
    return r ? { clientId: r.client_id, clientSecret: r.client_secret } : null;
  }

  set(clientId: string, clientSecret: string): void {
    this.db
      .prepare(
        `INSERT INTO oauth_client(id, client_id, client_secret, created_at) VALUES(1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_secret = excluded.client_secret, created_at = excluded.created_at`,
      )
      .run(clientId.trim(), clientSecret.trim(), new Date().toISOString());
  }
}
