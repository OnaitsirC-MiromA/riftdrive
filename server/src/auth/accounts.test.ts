import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo } from './client-config';
import { AccountsRepo, AccountsService } from './accounts';

const setup = () => {
  const db = openDb(':memory:');
  const oc = new OauthClientRepo(db);
  oc.set('1-a.apps.googleusercontent.com', 's');
  return { db, repo: new AccountsRepo(db), oc };
};

describe('AccountsRepo', () => {
  it('a primeira conta vira destino padrão; setDefault troca', () => {
    const { repo } = setup();
    const a = repo.insert({ email: 'A@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: 1 });
    const b = repo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: 1 });
    expect(a.email).toBe('a@x.com');
    expect(repo.defaultDest()?.id).toBe(a.id);
    repo.setDefault(b.id);
    expect(repo.defaultDest()?.id).toBe(b.id);
    expect(repo.get(a.id)?.is_default_dest).toBe(0);
  });

  it('remover a padrão passa o padrão para a próxima', () => {
    const { repo } = setup();
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: 1 });
    const b = repo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: 1 });
    repo.remove(a.id);
    expect(repo.defaultDest()?.id).toBe(b.id);
    expect(repo.byEmail('a@x.com')).toBeNull();
  });

  it('setRefreshToken volta a conta para ok e zera o access token', () => {
    const { repo } = setup();
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'OLD', accessToken: 'A', expiresAt: 1 });
    repo.setStatus(a.id, 'disconnected', '2026-01-01T00:00:00Z');
    repo.setRefreshToken(a.id, 'NEW');
    expect(repo.get(a.id)).toMatchObject({ refresh_token: 'NEW', access_token: null, status: 'ok', failed_since: null });
  });
});

describe('AccountsService', () => {
  it('usa o access token em cache enquanto válido e renova quando expira', async () => {
    const { repo, oc } = setup();
    let now = 1_000_000;
    let refreshes = 0;
    const f = (async () => {
      refreshes++;
      return new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600 }));
    }) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'OLD', expiresAt: now + 120_000 });
    const svc = new AccountsService(repo, oc, f, () => now);
    expect(await svc.getAccessToken(a.id)).toBe('OLD');
    now += 100_000; // faltam 20 s: dentro da margem de 60 s → renova
    expect(await svc.getAccessToken(a.id)).toBe('NEW');
    expect(refreshes).toBe(1);
    expect(repo.get(a.id)?.access_token).toBe('NEW');
  });

  it('renovações simultâneas viram uma só chamada', async () => {
    const { repo, oc } = setup();
    let refreshes = 0;
    const f = (async () => {
      refreshes++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600 }));
    }) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: null, expiresAt: null });
    const svc = new AccountsService(repo, oc, f, () => 0);
    const tokens = await Promise.all([svc.getAccessToken(a.id), svc.getAccessToken(a.id), svc.getAccessToken(a.id)]);
    expect(tokens).toEqual(['NEW', 'NEW', 'NEW']);
    expect(refreshes).toBe(1);
  });

  it('invalid_grant marca a conta como desconectada', async () => {
    const { repo, oc } = setup();
    const f = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: null, expiresAt: null });
    const svc = new AccountsService(repo, oc, f, () => 0);
    await expect(svc.getAccessToken(a.id)).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(repo.get(a.id)?.status).toBe('disconnected');
    expect(repo.get(a.id)?.failed_since).toBeTruthy();
  });

  it('renovar com sucesso uma conta desconectada volta a ok', async () => {
    const { repo, oc } = setup();
    const f = (async () => new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600 }))) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: null, expiresAt: null });
    repo.setStatus(a.id, 'disconnected', '2026-01-01T00:00:00Z');
    await new AccountsService(repo, oc, f, () => 0).getAccessToken(a.id);
    expect(repo.get(a.id)).toMatchObject({ status: 'ok', failed_since: null });
  });

  it('testConnection devolve o e-mail ou o erro', async () => {
    const { repo, oc } = setup();
    const f = (async () => new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600 }))) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: 10 ** 15 });
    const svc = new AccountsService(repo, oc, f, () => 0);
    expect(await svc.testConnection(a.id, async () => 'a@x.com')).toEqual({ ok: true, email: 'a@x.com' });
    expect(
      await svc.testConnection(a.id, async () => {
        throw new Error('sem acesso');
      }),
    ).toEqual({ ok: false, error: 'sem acesso' });
  });
});
