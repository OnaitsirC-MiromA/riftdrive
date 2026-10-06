import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { t } from '../i18n/strings';

const GIB = 1024 ** 3;

interface PatchBody {
  quotaMode?: 'limit' | 'unlimited';
  quotaGb?: number;
  quotaResetHour?: number;
  defaultDest?: { accountId: string; folderId: string; folderName: string } | null;
}

export async function settingsRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { settings } = opts.deps;

  const current = () => {
    const q = settings.quota();
    return { quotaMode: q.mode, quotaGb: Math.round((q.limitBytes / GIB) * 100) / 100, quotaResetHour: q.resetHour, defaultDest: settings.defaultDest() };
  };

  app.get('/api/settings', async () => current());

  app.patch<{ Body: PatchBody }>('/api/settings', async (req, reply) => {
    const b = req.body ?? {};
    if (b.quotaMode !== undefined && b.quotaMode !== 'limit' && b.quotaMode !== 'unlimited') return reply.code(400).send({ error: t.settings.invalid });
    if (b.quotaGb !== undefined && !(typeof b.quotaGb === 'number' && b.quotaGb > 0 && Number.isFinite(b.quotaGb))) return reply.code(400).send({ error: t.settings.invalid });
    if (b.quotaResetHour !== undefined && !(Number.isInteger(b.quotaResetHour) && b.quotaResetHour >= 0 && b.quotaResetHour <= 23)) return reply.code(400).send({ error: t.settings.invalid });
    if (b.defaultDest !== undefined && b.defaultDest !== null) {
      const d = b.defaultDest;
      if (!d || typeof d.accountId !== 'string' || typeof d.folderId !== 'string' || typeof d.folderName !== 'string') return reply.code(400).send({ error: t.settings.invalid });
    }
    settings.setQuota({ mode: b.quotaMode, limitBytes: b.quotaGb !== undefined ? Math.round(b.quotaGb * GIB) : undefined, resetHour: b.quotaResetHour });
    if (b.defaultDest !== undefined) settings.setDefaultDest(b.defaultDest);
    return current();
  });
}
