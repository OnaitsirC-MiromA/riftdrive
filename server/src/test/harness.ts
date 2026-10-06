import { buildApp } from '../app';
import { buildDeps, type AppDeps } from '../deps';
import { openDb } from '../db';
import { loadConfig } from '../config';
import { FakeDrive } from './fake-drive';
import type { AccountRow } from '../types';

// App completo em memória para testes de rota, falando com um FakeDrive em vez
// do Google. Sem rede em lugar nenhum.
export function makeTestApp(overrides: Partial<AppDeps> = {}) {
  const db = openDb(':memory:');
  const fake = new FakeDrive();
  const config = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/riftdrive-test', OPEN_BROWSER: '0' });
  const deps = buildDeps(config, db, {
    fetchFn: fake.fetch,
    openBrowser: () => {},
    aboutEmail: async () => 'teste@x.com',
    ...overrides,
  });
  const app = buildApp(config, db, deps);
  return { app, db, deps, fake };
}

/** Cria a conta no FakeDrive e no banco, já com um access token válido. */
export function connectFakeAccount(deps: AppDeps, fake: FakeDrive, id: string, email: string): AccountRow {
  const a = fake.account(id, email);
  return deps.accountsRepo.insert({ email, refreshToken: a.refreshToken, accessToken: a.accessToken, expiresAt: Date.now() + 3_600_000 });
}
