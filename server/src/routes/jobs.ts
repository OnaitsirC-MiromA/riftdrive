import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import type { FileStatus, JobFileRow, JobMode, JobRow } from '../types';
import { FOLDER_MIME } from '../drive/client';
import { uniqueName } from '../drive/tree';
import { toNewJobFiles } from '../jobs/inventory';
import { t } from '../i18n/strings';

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export function toJobDto(job: JobRow, deps: AppDeps) {
  const dest = deps.accountsRepo.get(job.dest_account_id);
  const reader = deps.accountsRepo.get(job.src_reader_account_id);
  return {
    id: job.id,
    name: job.name,
    path: job.path,
    mode: job.mode,
    status: job.status,
    totals: { files: job.total_files, bytes: job.total_bytes },
    done: { files: job.done_files, bytes: job.done_bytes },
    skippedFiles: job.skipped_files,
    deferredFiles: job.deferred_files,
    message: job.message,
    pausedUntil: job.paused_until ? new Date(job.paused_until).toISOString() : null,
    resumeReason: job.resume_reason,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    dest: { accountEmail: dest?.email ?? '', parentName: job.dest_parent_name, folderId: job.dest_folder_id, finalName: job.dest_final_name },
    source: { folderId: job.src_folder_id, readerEmail: reader?.email ?? '' },
    stats: deps.engine.stats(job.id),
  };
}

const toFileDto = (f: JobFileRow) => ({
  relPath: f.rel_path,
  name: f.name,
  size: f.size,
  status: f.status,
  error: f.last_error,
  bytesUploaded: f.bytes_uploaded,
  srcUrl: driveFileUrl(f.src_id),
  destUrl: f.dest_id ? driveFileUrl(f.dest_id) : null,
});

interface CreateBody {
  inspectionId?: string;
  name?: string;
  destAccountId?: string;
  destParentId?: string;
  destParentName?: string;
  conflict?: 'rename' | 'merge';
}

export async function jobsRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { deps } = opts;
  const { jobsRepo, accountsRepo, inspections, clientFor, engine } = deps;

  app.get('/api/jobs', async () => ({ jobs: jobsRepo.list().map((j) => toJobDto(j, deps)) }));

  // Cria o job a partir de uma análise recente: o inventário sai da árvore já
  // lida. Conflito de nome no destino: mesclar na pasta existente (modo merge)
  // ou, por padrão, usar o próximo nome livre — "Nome (2)".
  app.post<{ Body: CreateBody }>('/api/jobs', async (req, reply) => {
    const b = req.body ?? {};
    const insp = b.inspectionId ? inspections.get(b.inspectionId) : null;
    if (!insp) return reply.code(410).send({ error: t.jobs.inspectionExpired });
    const dest = accountsRepo.get(b.destAccountId ?? insp.result.destAccountId);
    if (!dest) return reply.code(400).send({ error: t.accounts.notFound });

    const destParentId = b.destParentId || 'root';
    const destParentName = b.destParentName || t.drive.myDrive;
    let finalName = (b.name ?? insp.result.name).trim() || insp.result.name;
    let mode: JobMode = 'copy';
    let destFolderId: string | null = null;

    const siblings = await clientFor(dest.id).listChildren(destParentId);
    const existingFolder = siblings.find((s) => s.mimeType === FOLDER_MIME && s.name === finalName);
    if (existingFolder) {
      if (b.conflict === 'merge') {
        mode = 'merge';
        destFolderId = existingFolder.id;
      } else {
        finalName = uniqueName(new Set(siblings.filter((s) => s.mimeType === FOLDER_MIME).map((s) => s.name)), finalName);
      }
    }

    const job = jobsRepo.create({
      name: insp.result.name,
      srcFolderId: insp.result.folderId,
      srcReaderAccountId: insp.result.readerAccountId,
      destAccountId: dest.id,
      destParentId,
      destParentName,
      destFinalName: finalName,
      path: insp.result.path,
      mode,
      destFolderId,
    });
    jobsRepo.insertFiles(job.id, toNewJobFiles(insp.tree.files, insp.result.path));
    return reply.code(201).send({ job: toJobDto(jobsRepo.get(job.id)!, deps) });
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = jobsRepo.get(req.params.id);
    if (!job) return reply.code(404).send({ error: t.jobs.notFound });
    return { job: toJobDto(job, deps), counts: jobsRepo.fileCounts(job.id) };
  });

  app.get<{ Params: { id: string }; Querystring: { status?: FileStatus; limit?: string; offset?: string } }>('/api/jobs/:id/files', async (req, reply) => {
    if (!jobsRepo.get(req.params.id)) return reply.code(404).send({ error: t.jobs.notFound });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    return { files: jobsRepo.files(req.params.id, req.query.status, limit, offset).map(toFileDto) };
  });

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    app.post<{ Params: { id: string } }>(`/api/jobs/:id/${action}`, async (req, reply) => {
      if (!jobsRepo.get(req.params.id)) return reply.code(404).send({ error: t.jobs.notFound });
      engine[action](req.params.id);
      return { ok: true, job: toJobDto(jobsRepo.get(req.params.id)!, deps) };
    });
  }

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    if (!jobsRepo.get(req.params.id)) return reply.code(404).send({ error: t.jobs.notFound });
    if (!engine.remove(req.params.id)) return reply.code(409).send({ error: t.jobs.running });
    return { ok: true };
  });
}
