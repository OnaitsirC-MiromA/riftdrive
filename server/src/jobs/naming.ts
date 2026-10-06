import type { JobRow } from '../types';
import type { DriveClient } from '../drive/client';
import type { JobsRepo } from './repo';

// Enquanto copia, a pasta no Drive se chama "Nome (copiando…)": quem abrir o
// Drive no meio entende o que está vendo. Ao concluir, vira só "Nome".
export const WORKING_SUFFIX = ' (copiando…)';

export const workingName = (finalName: string): string => `${finalName}${WORKING_SUFFIX}`;

/** Garante a pasta de destino do job (cria com o nome de trabalho se ainda não existe). */
export async function ensureDestFolder(job: JobRow, client: DriveClient, repo: JobsRepo): Promise<string> {
  if (job.dest_folder_id) return job.dest_folder_id;
  const created = await client.createFolder(workingName(job.dest_final_name), job.dest_parent_id);
  repo.update(job.id, { dest_folder_id: created.id });
  return created.id;
}

/** Tira o sufixo de trabalho ao concluir — só em cópias novas; merge usa a pasta que já existia. */
export async function finalizeName(job: JobRow, client: DriveClient): Promise<void> {
  if (!job.dest_folder_id || job.mode !== 'copy') return;
  const current = await client.getFile(job.dest_folder_id);
  if (current.name.endsWith(WORKING_SUFFIX)) await client.rename(job.dest_folder_id, job.dest_final_name);
}
