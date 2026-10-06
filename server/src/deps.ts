import type { AppConfig } from './config';
import type { Db } from './db';
import { SettingsRepo } from './settings/repo';
import { OauthClientRepo } from './auth/client-config';
import { AccountsRepo, AccountsService } from './auth/accounts';
import { LoginFlow } from './auth/login-flow';
import { openBrowser as defaultOpenBrowser } from './open-browser';

// Tudo o que as rotas e o motor precisam, num lugar só. Os testes trocam o que
// quiserem por `overrides` (fetch falso, navegador que não abre…).
export interface AppDeps {
  db: Db;
  settings: SettingsRepo;
  oauthClient: OauthClientRepo;
  accountsRepo: AccountsRepo;
  accounts: AccountsService;
  login: LoginFlow;
  fetchFn: typeof fetch;
  openBrowser: (url: string) => void;
  /** E-mail da conta dona de um access token. */
  aboutEmail: (accessToken: string) => Promise<string>;
}

// E-mail pelo próprio Drive (about.get) — evita pedir o escopo userinfo.
export async function aboutEmailViaDrive(accessToken: string, fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`about.get → HTTP ${res.status}`);
  const json = (await res.json()) as { user?: { emailAddress?: string } };
  if (!json.user?.emailAddress) throw new Error('about.get sem e-mail');
  return json.user.emailAddress;
}

export function buildDeps(config: AppConfig, db: Db, overrides: Partial<AppDeps> = {}): AppDeps {
  void config;
  const fetchFn = overrides.fetchFn ?? fetch;
  const openBrowser = overrides.openBrowser ?? defaultOpenBrowser;
  const settings = overrides.settings ?? new SettingsRepo(db);
  const oauthClient = overrides.oauthClient ?? new OauthClientRepo(db);
  const accountsRepo = overrides.accountsRepo ?? new AccountsRepo(db);
  const accounts = overrides.accounts ?? new AccountsService(accountsRepo, oauthClient, fetchFn);
  const aboutEmail = overrides.aboutEmail ?? ((token: string) => aboutEmailViaDrive(token, fetchFn));
  const login = overrides.login ?? new LoginFlow({ repo: accountsRepo, oauthClient, fetchFn, openBrowser, aboutEmail });
  return { db, settings, oauthClient, accountsRepo, accounts, login, fetchFn, openBrowser, aboutEmail };
}
