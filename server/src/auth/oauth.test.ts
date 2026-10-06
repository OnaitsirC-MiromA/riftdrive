import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { OAuthError, buildAuthUrl, exchangeCode, refreshAccessToken, startLoopback } from './oauth';

const client = { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' };
const fakeFetch = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('buildAuthUrl', () => {
  it('monta a URL de consentimento com PKCE e refresh token garantido', () => {
    const u = new URL(
      buildAuthUrl({ clientId: client.clientId, redirectUri: 'http://127.0.0.1:5000/', challenge: 'CH', state: 'ST', loginHint: 'a@b.c' }),
    );
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe(client.clientId);
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive');
    expect(u.searchParams.get('code_challenge')).toBe('CH');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('ST');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('login_hint')).toBe('a@b.c');
  });
});

describe('exchangeCode', () => {
  it('devolve o conjunto de tokens e manda o verifier e o segredo', async () => {
    let sent = '';
    const f = (async (_u: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3599 }));
    }) as unknown as typeof fetch;
    const t = await exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'http://127.0.0.1:1/', client }, f);
    expect(t).toEqual({ accessToken: 'A', refreshToken: 'R', expiresInSec: 3599 });
    const p = new URLSearchParams(sent);
    expect(p.get('grant_type')).toBe('authorization_code');
    expect(p.get('code_verifier')).toBe('V');
    expect(p.get('client_secret')).toBe('GOCSPX-x');
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:1/');
  });

  it('sem refresh_token é erro explícito', async () => {
    await expect(
      exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'x', client }, fakeFetch(200, { access_token: 'A', expires_in: 1 })),
    ).rejects.toMatchObject({ code: 'no_refresh_token' });
  });

  it('invalid_grant vira OAuthError', async () => {
    await expect(
      exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'x', client }, fakeFetch(400, { error: 'invalid_grant' })),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('invalid_client aponta para a configuração', async () => {
    await expect(
      exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'x', client }, fakeFetch(401, { error: 'invalid_client' })),
    ).rejects.toMatchObject({ code: 'invalid_client' });
  });
});

describe('refreshAccessToken', () => {
  it('renova', async () => {
    expect(await refreshAccessToken({ refreshToken: 'R', client }, fakeFetch(200, { access_token: 'A2', expires_in: 100 }))).toEqual({
      accessToken: 'A2',
      expiresInSec: 100,
    });
  });

  it('invalid_grant → OAuthError', async () => {
    await expect(refreshAccessToken({ refreshToken: 'R', client }, fakeFetch(400, { error: 'invalid_grant' }))).rejects.toBeInstanceOf(OAuthError);
  });

  it('rede fora → OAuthError http', async () => {
    const f = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(refreshAccessToken({ refreshToken: 'R', client }, f)).rejects.toMatchObject({ code: 'http' });
  });
});

describe('startLoopback', () => {
  const hit = (url: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(url, (res) => {
          let b = '';
          res.on('data', (d) => (b += d));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
        })
        .on('error', reject);
    });

  it('recebe o código com o state certo e responde uma página', async () => {
    const lb = await startLoopback();
    expect(lb.redirectUri).toBe(`http://127.0.0.1:${lb.port}/`);
    const codeP = lb.waitForCode('ST');
    const res = await hit(`${lb.redirectUri}?code=ABC&state=ST`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('RiftDrive');
    expect(await codeP).toBe('ABC');
    lb.close();
  });

  it('state errado é recusado e ignorado até o certo chegar', async () => {
    const lb = await startLoopback();
    const codeP = lb.waitForCode('ST');
    expect((await hit(`${lb.redirectUri}?code=X&state=WRONG`)).status).toBe(400);
    await hit(`${lb.redirectUri}?code=OK&state=ST`);
    expect(await codeP).toBe('OK');
    lb.close();
  });

  it('access_denied vira erro', async () => {
    const lb = await startLoopback();
    // A asserção é ligada ANTES do retorno chegar: a rejeição acontece durante o
    // `hit`, e uma promise rejeitada sem handler viraria "unhandled rejection".
    const assertion = expect(lb.waitForCode('ST')).rejects.toMatchObject({ code: 'access_denied' });
    await hit(`${lb.redirectUri}?error=access_denied&state=ST`);
    await assertion;
    lb.close();
  });

  it('expira', async () => {
    const lb = await startLoopback({ timeoutMs: 30 });
    await expect(lb.waitForCode('ST')).rejects.toMatchObject({ code: 'timeout' });
    lb.close();
  });
});
