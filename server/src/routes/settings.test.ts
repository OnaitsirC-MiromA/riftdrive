import { describe, expect, it } from 'vitest';
import { connectFakeAccount, makeTestApp } from '../test/harness';

describe('settings e quota', () => {
  it('padrões e PATCH parcial', async () => {
    const { app } = makeTestApp();
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ quotaMode: 'limit', quotaGb: 600, quotaResetHour: 4, defaultDest: null });
    const r = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { quotaMode: 'unlimited', quotaResetHour: 2 } });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/settings' })).json()).toMatchObject({ quotaMode: 'unlimited', quotaGb: 600, quotaResetHour: 2 });
    await app.inject({ method: 'PATCH', url: '/api/settings', payload: { quotaGb: 10.5, defaultDest: { accountId: 'a', folderId: 'f', folderName: 'Pasta' } } });
    expect((await app.inject({ url: '/api/settings' })).json()).toMatchObject({ quotaGb: 10.5, defaultDest: { accountId: 'a', folderId: 'f', folderName: 'Pasta' } });
    expect((await app.inject({ method: 'PATCH', url: '/api/settings', payload: { quotaMode: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/settings', payload: { quotaGb: 0 } })).statusCode).toBe(400);
  });

  it('quota: 404 sem contas; reflete modo e uso da conta padrão', async () => {
    const w = makeTestApp();
    expect((await w.app.inject({ url: '/api/quota' })).statusCode).toBe(404);
    const a = connectFakeAccount(w.deps, w.fake, 'a', 'a@x.com');
    w.deps.quota.record(a.id, 5 * 1024 ** 3);
    const q = (await w.app.inject({ url: '/api/quota' })).json();
    expect(q).toMatchObject({ mode: 'limit', limitBytes: 600 * 1024 ** 3, usedBytes: 5 * 1024 ** 3, remainingBytes: 595 * 1024 ** 3, accountEmail: 'a@x.com' });
    expect(typeof q.resetAt).toBe('string');
    await w.app.inject({ method: 'PATCH', url: '/api/settings', payload: { quotaMode: 'unlimited' } });
    expect((await w.app.inject({ url: `/api/quota?accountId=${a.id}` })).json()).toMatchObject({ mode: 'unlimited', limitBytes: null, remainingBytes: null });
  });
});
