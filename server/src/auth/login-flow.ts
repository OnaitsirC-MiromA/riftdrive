import type { AccountsRepo } from './accounts';
import type { OauthClientRepo } from './client-config';
import { createPkce, randomState } from './pkce';
import { buildAuthUrl, exchangeCode, startLoopback as defaultStartLoopback, type Loopback } from './oauth';
import { t } from '../i18n/strings';

export type LoginStatus =
  | { state: 'idle' }
  | { state: 'pending'; authUrl: string }
  | { state: 'done'; email: string }
  | { state: 'error'; message: string };

interface Deps {
  repo: AccountsRepo;
  oauthClient: OauthClientRepo;
  fetchFn: typeof fetch;
  openBrowser: (url: string) => void;
  startLoopback?: typeof defaultStartLoopback;
  /** E-mail da conta a partir do access token (about.get do Drive). */
  aboutEmail: (accessToken: string) => Promise<string>;
  now?: () => number;
}

/**
 * Orquestra um login: sobe o loopback, abre o navegador no consentimento e,
 * quando o retorno chega, troca o código, descobre o e-mail e grava a conta.
 *
 * Um login por vez: começar outro cancela o anterior (fecha o loopback antigo).
 * A SPA acompanha por polling em `status()`.
 */
export class LoginFlow {
  private current: LoginStatus = { state: 'idle' };
  private loopback: Loopback | null = null;

  constructor(private deps: Deps) {}

  status(): LoginStatus {
    return this.current;
  }

  async start(loginHint?: string): Promise<{ authUrl: string }> {
    const client = this.deps.oauthClient.get();
    if (!client) throw new Error(t.accounts.noClient);
    this.loopback?.close();
    const lb = await (this.deps.startLoopback ?? defaultStartLoopback)();
    this.loopback = lb;
    const { verifier, challenge } = createPkce();
    const state = randomState();
    const authUrl = buildAuthUrl({ clientId: client.clientId, redirectUri: lb.redirectUri, challenge, state, loginHint });
    this.current = { state: 'pending', authUrl };
    void this.finish(lb, state, verifier, client);
    this.deps.openBrowser(authUrl);
    return { authUrl };
  }

  private async finish(lb: Loopback, state: string, verifier: string, client: { clientId: string; clientSecret: string }): Promise<void> {
    try {
      const code = await lb.waitForCode(state);
      const tokens = await exchangeCode({ code, verifier, redirectUri: lb.redirectUri, client }, this.deps.fetchFn);
      const email = (await this.deps.aboutEmail(tokens.accessToken)).toLowerCase();
      const expiresAt = (this.deps.now ?? Date.now)() + tokens.expiresInSec * 1000;
      const existing = this.deps.repo.byEmail(email);
      if (existing) {
        // Reconexão: a mesma conta, um refresh token novo — nada de duplicar.
        this.deps.repo.setRefreshToken(existing.id, tokens.refreshToken);
        this.deps.repo.updateTokens(existing.id, tokens.accessToken, expiresAt);
      } else {
        this.deps.repo.insert({ email, refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt });
      }
      this.current = { state: 'done', email };
    } catch (err) {
      this.current = { state: 'error', message: err instanceof Error ? err.message : String(err) };
    } finally {
      lb.close();
      if (this.loopback === lb) this.loopback = null;
    }
  }
}
