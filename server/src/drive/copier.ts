import type { JobFileRow, JobRow } from '../types';
import type { JobsRepo } from '../jobs/repo';
import { FOLDER_MIME, type DriveClient, type DriveFile } from './client';
import { runLoop, type RunContext, type RunResult } from './run-loop';
import type { FileOutcome } from './outcomes';

export const PREVIOUS_VERSION_SUFFIX = ' (versão anterior)';

export const dirname = (relPath: string) => {
  const i = relPath.lastIndexOf('/');
  return i >= 0 ? relPath.slice(0, i) : '';
};

/**
 * Espelha a árvore de pastas da origem no destino, criando cada pasta uma vez
 * só — mesmo com vários arquivos chegando em paralelo, mesmo depois de um
 * reinício (o mapa fica em `job_folders`). Em modo merge, reaproveita pastas
 * homônimas que já existem no destino em vez de criar outra.
 */
export class FolderMirror {
  private cache = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();
  private listings = new Map<string, Map<string, DriveFile[]>>();

  constructor(
    private client: DriveClient,
    private repo: JobsRepo,
    private job: JobRow,
  ) {}

  ensure(relDir: string): Promise<string> {
    if (!relDir) return Promise.resolve(this.job.dest_folder_id!);
    const cached = this.cache.get(relDir) ?? this.repo.folder(this.job.id, relDir);
    if (cached) {
      this.cache.set(relDir, cached);
      return Promise.resolve(cached);
    }
    const running = this.inflight.get(relDir);
    if (running) return running;
    const p = this.create(relDir).finally(() => this.inflight.delete(relDir));
    this.inflight.set(relDir, p);
    return p;
  }

  private async create(relDir: string): Promise<string> {
    const parentId = await this.ensure(dirname(relDir));
    const name = relDir.slice(relDir.lastIndexOf('/') + 1);
    let id: string | undefined;
    if (this.job.mode === 'merge') {
      id = (await this.siblings(parentId)).get(name)?.find((f) => f.mimeType === FOLDER_MIME)?.id;
    }
    if (!id) {
      const created = await this.client.createFolder(name, parentId);
      id = created.id;
      this.listings.get(parentId)?.set(name, [...(this.listings.get(parentId)?.get(name) ?? []), created]);
    }
    this.repo.setFolder(this.job.id, relDir, id);
    this.cache.set(relDir, id);
    return id;
  }

  /** Filhos de uma pasta do destino, por nome (lidos uma vez). Só o merge precisa. */
  async siblings(destFolderId: string): Promise<Map<string, DriveFile[]>> {
    let map = this.listings.get(destFolderId);
    if (!map) {
      map = new Map();
      for (const f of await this.client.listChildren(destFolderId)) map.set(f.name, [...(map.get(f.name) ?? []), f]);
      this.listings.set(destFolderId, map);
    }
    return map;
  }
}

const sameContent = (file: JobFileRow, existing: DriveFile): boolean =>
  file.md5 && existing.md5Checksum ? existing.md5Checksum === file.md5 : existing.size === file.size;

/**
 * O caminho pelo rift: `files.copy` servidor-a-servidor, arquivo a arquivo,
 * dentro da conta de destino. Nada passa pela máquina.
 *
 * Em modo merge (mesclar / re-sync): arquivo igual já existente no destino é
 * dado como feito sem copiar; arquivo diferente tem a versão antiga renomeada
 * para "(versão anterior)" antes de a nova entrar — nunca se apaga nada.
 */
export async function runRift(ctx: RunContext & { client: DriveClient }): Promise<RunResult> {
  const mirror = new FolderMirror(ctx.client, ctx.repo, ctx.job);

  return runLoop(ctx, async (file): Promise<FileOutcome> => {
    const parentId = await mirror.ensure(dirname(file.rel_path));

    if (ctx.job.mode === 'merge') {
      const siblings = await mirror.siblings(parentId);
      const existing = (siblings.get(file.name) ?? []).filter((s) => s.mimeType !== FOLDER_MIME);
      const match = existing.find((s) => sameContent(file, s));
      if (match) return { status: 'done', destId: match.id, bytes: 0 };
      for (const old of existing) await ctx.client.rename(old.id, `${file.name}${PREVIOUS_VERSION_SUFFIX}`);
      siblings.delete(file.name);
    }

    const copied = await ctx.client.copyFile(file.src_id, file.name, parentId);
    ctx.onProgress?.(file.size);
    return { status: 'done', destId: copied.id, bytes: file.size };
  });
}
