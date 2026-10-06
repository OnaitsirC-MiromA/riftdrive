import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { buildDeps } from './deps';
import { openDb } from './db';
import { loadConfig } from './config';

describe('app', () => {
  it('health e info respondem', async () => {
    const config = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/rd-test', OPEN_BROWSER: '0' });
    const db = openDb(':memory:');
    const app = buildApp(config, db, buildDeps(config, db, { openBrowser: () => {} }));
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
    const info = (await app.inject({ method: 'GET', url: '/api/info' })).json();
    expect(info).toMatchObject({ version: expect.any(String), platform: process.platform, configured: { client: false, accounts: 0 } });
    expect((await app.inject({ method: 'GET', url: '/api/nada' })).statusCode).toBe(404);
    await app.close();
  });
});
