import { buildApp } from '../app';
import { buildDeps, type AppDeps } from '../deps';
import { openDb } from '../db';
import { loadConfig } from '../config';

// App completo em memória para testes de rota. Sem rede: o fetch padrão aqui
// falha alto, para um teste que esqueceu de injetar o FakeDrive não passar
// batendo no Google de verdade.
export function makeTestApp(overrides: Partial<AppDeps> = {}) {
  const db = openDb(':memory:');
  const config = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/riftdrive-test', OPEN_BROWSER: '0' });
  const failingFetch = (async () => {
    throw new Error('fetch não injetado no teste');
  }) as unknown as typeof fetch;
  const deps = buildDeps(config, db, {
    fetchFn: failingFetch,
    openBrowser: () => {},
    aboutEmail: async () => 'teste@x.com',
    ...overrides,
  });
  const app = buildApp(config, db, deps);
  return { app, db, deps };
}
