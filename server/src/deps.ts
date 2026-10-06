import type { AppConfig } from './config';
import type { Db } from './db';
import { SettingsRepo } from './settings/repo';
import { openBrowser as defaultOpenBrowser } from './open-browser';

// Tudo o que as rotas e o motor precisam, num lugar só. Os testes trocam o que
// quiserem por `overrides` (fetch falso, navegador que não abre…).
export interface AppDeps {
  db: Db;
  settings: SettingsRepo;
  fetchFn: typeof fetch;
  openBrowser: (url: string) => void;
}

export function buildDeps(config: AppConfig, db: Db, overrides: Partial<AppDeps> = {}): AppDeps {
  void config;
  const fetchFn = overrides.fetchFn ?? fetch;
  const openBrowser = overrides.openBrowser ?? defaultOpenBrowser;
  const settings = overrides.settings ?? new SettingsRepo(db);
  return { db, settings, fetchFn, openBrowser };
}
