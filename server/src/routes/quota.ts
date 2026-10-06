import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { t } from '../i18n/strings';

// A linha "Cota de hoje: 288 GB restantes · renova às 04:00" da tela inicial.
export async function quotaRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { accountsRepo, quota } = opts.deps;
  app.get<{ Querystring: { accountId?: string } }>('/api/quota', async (req, reply) => {
    const acc = (req.query.accountId ? accountsRepo.get(req.query.accountId) : null) ?? (req.query.accountId ? null : accountsRepo.defaultDest());
    if (!acc) return reply.code(404).send({ error: t.accounts.notFound });
    const { fits: _fits, ...e } = quota.evaluate(acc.id, 0);
    return { ...e, accountEmail: acc.email };
  });
}
