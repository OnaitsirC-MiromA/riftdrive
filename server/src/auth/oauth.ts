import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { t } from '../i18n/strings';

export const SCOPE = 'https://www.googleapis.com/auth/drive';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export type OAuthErrorCode = 'invalid_grant' | 'access_denied' | 'state_mismatch' | 'no_refresh_token' | 'timeout' | 'http' | 'invalid_client';

export class OAuthError extends Error {
  constructor(
    public code: OAuthErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; loginHint?: string }): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', p.state);
  // offline + consent: só assim o Google devolve refresh_token toda vez (sem o
  // consent, a segunda autorização da mesma conta vem sem ele).
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  if (p.loginHint) u.searchParams.set('login_hint', p.loginHint);
  return u.toString();
}

async function tokenRequest(form: Record<string, string>, fetchFn: typeof fetch): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw new OAuthError('http', t.oauth.network(err instanceof Error ? err.message : String(err)));
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? '');
    if (code === 'invalid_grant') throw new OAuthError('invalid_grant', t.oauth.invalidGrant);
    if (code === 'invalid_client' || code === 'unauthorized_client') throw new OAuthError('invalid_client', t.oauth.invalidClient);
    throw new OAuthError('http', t.oauth.tokenHttp(res.status, String(json.error_description ?? code)));
  }
  return json;
}

export async function exchangeCode(
  p: { code: string; verifier: string; redirectUri: string; client: OAuthClient },
  fetchFn: typeof fetch = fetch,
): Promise<TokenSet> {
  const json = await tokenRequest(
    {
      code: p.code,
      client_id: p.client.clientId,
      client_secret: p.client.clientSecret,
      redirect_uri: p.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: p.verifier,
    },
    fetchFn,
  );
  if (typeof json.refresh_token !== 'string') throw new OAuthError('no_refresh_token', t.oauth.noRefreshToken);
  return { accessToken: String(json.access_token), refreshToken: json.refresh_token, expiresInSec: Number(json.expires_in ?? 3600) };
}

export async function refreshAccessToken(
  p: { refreshToken: string; client: OAuthClient },
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresInSec: number }> {
  const json = await tokenRequest(
    { refresh_token: p.refreshToken, client_id: p.client.clientId, client_secret: p.client.clientSecret, grant_type: 'refresh_token' },
    fetchFn,
  );
  return { accessToken: String(json.access_token), expiresInSec: Number(json.expires_in ?? 3600) };
}

// Best-effort: ao remover uma conta, pedimos ao Google que esqueça o token.
// Falhar aqui não impede nada — o token some do nosso banco de qualquer jeito.
export async function revokeToken(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await fetchFn(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    /* best-effort */
  }
}

export interface Loopback {
  port: number;
  redirectUri: string;
  waitForCode(expectedState: string): Promise<string>;
  close(): void;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title} — RiftDrive</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1020;color:#F5F3FF;font:16px/1.5 system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem"><div style="font-size:1.4rem;font-weight:600;margin-bottom:.5rem">${title}</div><div style="opacity:.7">${body}</div></div>
</body></html>`;

/**
 * Servidor efêmero em 127.0.0.1 que recebe o retorno do Google.
 *
 * É o "redirect_uri" de um app para computador: o Google manda o navegador para
 * cá com `?code&state`. Validamos o state, respondemos uma página mínima e
 * entregamos o código a quem estava esperando. Uma resposta por pedido; o resto
 * é recusado.
 */
export function startLoopback(opts: { timeoutMs?: number } = {}): Promise<Loopback> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  return new Promise((resolve, reject) => {
    let pending: { state: string; resolve: (c: string) => void; reject: (e: Error) => void } | null = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (!pending || state !== pending.state) {
        res.statusCode = 400;
        res.end(page(t.oauth.pageBadStateTitle, t.oauth.pageBadStateBody));
        return;
      }
      if (error) {
        res.statusCode = 200;
        res.end(page(t.oauth.pageDeniedTitle, t.oauth.pageDeniedBody));
        const p = pending;
        pending = null;
        p.reject(new OAuthError('access_denied', t.oauth.accessDenied));
        return;
      }
      if (!code) {
        res.statusCode = 400;
        res.end(page(t.oauth.pageBadStateTitle, t.oauth.pageBadStateBody));
        return;
      }
      res.statusCode = 200;
      res.end(page(t.oauth.pageOkTitle, t.oauth.pageOkBody));
      const p = pending;
      pending = null;
      p.resolve(code);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const timer = setTimeout(() => {
        if (pending) {
          const p = pending;
          pending = null;
          p.reject(new OAuthError('timeout', t.oauth.timeout));
        }
      }, timeoutMs);
      timer.unref();
      resolve({
        port,
        redirectUri: `http://127.0.0.1:${port}/`,
        waitForCode: (expectedState) =>
          new Promise<string>((res, rej) => {
            pending = { state: expectedState, resolve: res, reject: rej };
          }),
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });
}
