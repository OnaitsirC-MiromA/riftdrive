import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo } from './client-config';
import { AccountsRepo } from './accounts';
import { LoginFlow } from './login-flow';

const hit = (url: string) => new Promise<void>((resolve) => http.get(url, (res) => res.resume().on('end', resolve)));
const settle = () => new Promise((r) => setTimeout(r, 20));

const tokensFetch = (refreshToken: string) =>
  (async () => new Response(JSON.stringify({ access_token: 'A', refresh_token: refreshToken, expires_in: 3600 }))) as unknown as typeof fetch;

describe('LoginFlow', () => {
  it('start → abre navegador → retorno no loopback → conta gravada como destino padrão', async () => {
    const db = openDb(':memory:');
    const oc = new OauthClientRepo(db);
    oc.set('1-a.apps.googleusercontent.com', 's');
    const repo = new AccountsRepo(db);
    let opened = '';
    const flow = new LoginFlow({
      repo,
      oauthClient: oc,
      fetchFn: tokensFetch('R'),
      openBrowser: (u) => {
        opened = u;
      },
      aboutEmail: async () => 'Novo@x.com',
    });
    const { authUrl } = await flow.start();
    expect(opened).toBe(authUrl);
    const u = new URL(authUrl);
    const redirect = u.searchParams.get('redirect_uri')!;
    const state = u.searchParams.get('state')!;
    expect(flow.status()).toMatchObject({ state: 'pending', authUrl });

    await hit(`${redirect}?code=C&state=${state}`);
    await settle();
    expect(flow.status()).toEqual({ state: 'done', email: 'novo@x.com' });
    expect(repo.byEmail('novo@x.com')?.refresh_token).toBe('R');
    expect(repo.defaultDest()?.email).toBe('novo@x.com');
  });

  it('sem client configurado, start falha', async () => {
    const db = openDb(':memory:');
    const flow = new LoginFlow({
      repo: new AccountsRepo(db),
      oauthClient: new OauthClientRepo(db),
      fetchFn: fetch,
      openBrowser: () => {},
      aboutEmail: async () => '',
    });
    await expect(flow.start()).rejects.toThrow(/client/i);
    expect(flow.status()).toEqual({ state: 'idle' });
  });

  it('reconectar a mesma conta atualiza o refresh token e volta a ok, sem duplicar', async () => {
    const db = openDb(':memory:');
    const oc = new OauthClientRepo(db);
    oc.set('1-a.apps.googleusercontent.com', 's');
    const repo = new AccountsRepo(db);
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'OLD', accessToken: null, expiresAt: null });
    repo.setStatus(a.id, 'disconnected', new Date().toISOString());
    const flow = new LoginFlow({ repo, oauthClient: oc, fetchFn: tokensFetch('NEW'), openBrowser: () => {}, aboutEmail: async () => 'a@x.com' });
    const { authUrl } = await flow.start('a@x.com');
    const u = new URL(authUrl);
    expect(u.searchParams.get('login_hint')).toBe('a@x.com');
    await hit(`${u.searchParams.get('redirect_uri')}?code=C&state=${u.searchParams.get('state')}`);
    await settle();
    expect(repo.get(a.id)).toMatchObject({ refresh_token: 'NEW', status: 'ok', failed_since: null });
    expect(repo.list()).toHaveLength(1);
  });

  it('erro na troca vira status error', async () => {
    const db = openDb(':memory:');
    const oc = new OauthClientRepo(db);
    oc.set('1-a.apps.googleusercontent.com', 's');
    const f = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
    const flow = new LoginFlow({ repo: new AccountsRepo(db), oauthClient: oc, fetchFn: f, openBrowser: () => {}, aboutEmail: async () => 'x@x.com' });
    const { authUrl } = await flow.start();
    const u = new URL(authUrl);
    await hit(`${u.searchParams.get('redirect_uri')}?code=C&state=${u.searchParams.get('state')}`);
    await settle();
    expect(flow.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/invalid_grant|expirou/) });
  });
});
