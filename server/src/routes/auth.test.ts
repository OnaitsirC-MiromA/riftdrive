import { describe, expect, it } from 'vitest';
import { makeTestApp } from '../test/harness';

describe('rotas de auth e contas', () => {
  it('client: vazio → configurado e mascarado; info reflete', async () => {
    const { app } = makeTestApp();
    expect((await app.inject({ url: '/api/auth/client' })).json()).toEqual({ configured: false, clientIdMasked: null });
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/client',
      payload: { clientId: '1234567890-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' },
    });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/client' })).json()).toEqual({
      configured: true,
      clientIdMasked: '…90-abc.apps.googleusercontent.com',
    });
    expect((await app.inject({ url: '/api/info' })).json()).toMatchObject({ configured: { client: true, accounts: 0 } });
  });

  it('client inválido é 400 com mensagem em português', async () => {
    const { app } = makeTestApp();
    const r = await app.inject({ method: 'POST', url: '/api/auth/client', payload: { clientId: 'x', clientSecret: '' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/ID do cliente/);
    const r2 = await app.inject({ method: 'POST', url: '/api/auth/client', payload: { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'abc' } });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().error).toMatch(/segredo/);
  });

  it('login/start sem client é 400; status começa idle', async () => {
    const { app } = makeTestApp();
    expect((await app.inject({ url: '/api/auth/login/status' })).json()).toEqual({ state: 'idle' });
    expect((await app.inject({ method: 'POST', url: '/api/auth/login/start' })).statusCode).toBe(400);
  });

  it('login/start com client devolve a URL e fica pending', async () => {
    const { app, deps } = makeTestApp();
    deps.oauthClient.set('1-a.apps.googleusercontent.com', 'GOCSPX-x');
    const r = await app.inject({ method: 'POST', url: '/api/auth/login/start', payload: { loginHint: 'a@x.com' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().authUrl).toContain('accounts.google.com');
    expect((await app.inject({ url: '/api/auth/login/status' })).json()).toMatchObject({ state: 'pending' });
  });

  it('contas: lista sem segredos, padrão, remover', async () => {
    const { app, deps } = makeTestApp();
    const a = deps.accountsRepo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: Date.now() + 1e6 });
    const b = deps.accountsRepo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: Date.now() + 1e6 });
    const list = (await app.inject({ url: '/api/accounts' })).json();
    expect(list.accounts).toHaveLength(2);
    expect(list.accounts[0]).toEqual({ id: a.id, email: 'a@x.com', status: 'ok', isDefaultDest: true, failedSince: null });
    expect(JSON.stringify(list)).not.toContain('refresh');
    await app.inject({ method: 'POST', url: `/api/accounts/${b.id}/default` });
    expect(deps.accountsRepo.defaultDest()?.id).toBe(b.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/accounts/${a.id}` })).statusCode).toBe(200);
    expect(deps.accountsRepo.list()).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: '/api/accounts/nao-existe' })).statusCode).toBe(404);
  });
});
