import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import type { CopyRow } from '../types';
import { isAuthExpired } from '../drive/errors';
import { driveFolderUrl, toJobDto } from './jobs';
import { t } from '../i18n/strings';

export async function copiesRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { deps } = opts;
  const { jobsRepo, accountsRepo, resync } = deps;

  const toDto = (c: CopyRow) => ({
    id: c.id,
    name: c.name,
    path: c.path,
    destFolderId: c.dest_folder_id,
    destAccountEmail: accountsRepo.get(c.dest_account_id)?.email ?? '',
    createdAt: c.created_at,
    lastCheckedAt: c.last_checked_at,
    lastSyncedAt: c.last_synced_at,
    destUrl: driveFolderUrl(c.dest_folder_id),
  });

  app.get('/api/copies', async () => ({ copies: jobsRepo.copies().map(toDto) }));

  app.post<{ Params: { id: string } }>('/api/copies/:id/check', async (req, reply) => {
    if (!jobsRepo.copy(req.params.id)) return reply.code(404).send({ error: t.resync.notFound });
    try {
      return await resync.check(req.params.id);
    } catch (err) {
      if (isAuthExpired(err)) return reply.code(503).send({ error: t.jobs.auth, code: 'auth' });
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post<{ Params: { id: string }; Body: { folders?: string[] } }>('/api/copies/:id/sync', async (req, reply) => {
    if (!jobsRepo.copy(req.params.id)) return reply.code(404).send({ error: t.resync.notFound });
    const folders = Array.isArray(req.body?.folders) ? req.body.folders.filter((f): f is string => typeof f === 'string') : [];
    try {
      const job = await resync.sync(req.params.id, folders);
      return reply.code(201).send({ job: toJobDto(job, deps) });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/copies/:id', async (req, reply) => {
    if (!jobsRepo.copy(req.params.id)) return reply.code(404).send({ error: t.resync.notFound });
    jobsRepo.removeCopy(req.params.id);
    return { ok: true };
  });
}
