import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import type { AccountRow } from '../types';
import { revokeToken } from '../auth/oauth';
import { t } from '../i18n/strings';

// Nunca sai token daqui: a SPA só precisa saber quem está conectado e como.
export const toAccountDto = (a: AccountRow) => ({
  id: a.id,
  email: a.email,
  status: a.status,
  isDefaultDest: a.is_default_dest === 1,
  failedSince: a.failed_since,
});

export async function accountsRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { accountsRepo, accounts, fetchFn, aboutEmail } = opts.deps;

  app.get('/api/accounts', async () => ({ accounts: accountsRepo.list().map(toAccountDto) }));

  app.post<{ Params: { id: string } }>('/api/accounts/:id/default', async (req, reply) => {
    if (!accountsRepo.get(req.params.id)) return reply.code(404).send({ error: t.accounts.notFound });
    accountsRepo.setDefault(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/accounts/:id/test', async (req, reply) => {
    if (!accountsRepo.get(req.params.id)) return reply.code(404).send({ error: t.accounts.notFound });
    return accounts.testConnection(req.params.id, aboutEmail);
  });

  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req, reply) => {
    const a = accountsRepo.get(req.params.id);
    if (!a) return reply.code(404).send({ error: t.accounts.notFound });
    await revokeToken(a.refresh_token, fetchFn);
    accountsRepo.remove(a.id);
    return { ok: true };
  });
}
