import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { maskClientId, validateClientId } from '../auth/client-config';
import { t } from '../i18n/strings';

export async function authRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { oauthClient, login } = opts.deps;

  app.get('/api/auth/client', async () => {
    const c = oauthClient.get();
    return { configured: Boolean(c), clientIdMasked: c ? maskClientId(c.clientId) : null };
  });

  app.post<{ Body: { clientId?: string; clientSecret?: string } }>('/api/auth/client', async (req, reply) => {
    const clientId = (req.body?.clientId ?? '').trim();
    const clientSecret = (req.body?.clientSecret ?? '').trim();
    if (!validateClientId(clientId)) return reply.code(400).send({ error: t.auth.badClientId });
    if (clientSecret.length < 8) return reply.code(400).send({ error: t.auth.badClientSecret });
    oauthClient.set(clientId, clientSecret);
    return { ok: true };
  });

  app.post<{ Body: { loginHint?: string } }>('/api/auth/login/start', async (req, reply) => {
    if (!oauthClient.get()) return reply.code(400).send({ error: t.accounts.noClient });
    try {
      return await login.start(req.body?.loginHint);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/auth/login/status', async () => login.status());
}
