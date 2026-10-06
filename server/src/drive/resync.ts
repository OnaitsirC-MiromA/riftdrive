import type { JobPath, JobRow } from '../types';
import type { JobsRepo } from '../jobs/repo';
import type { DriveClient } from './client';
import { listTree, type Tree, type TreeEntry } from './tree';
import { t } from '../i18n/strings';

export interface DiffFile {
  relPath: string;
  kind: 'new' | 'updated';
  entry: TreeEntry;
}

export interface DiffGroup {
  folder: string;
  newFiles: number;
  updatedFiles: number;
  bytes: number;
  files: DiffFile[];
}

export const ROOT_GROUP = '(raiz)';

const groupOf = (relPath: string): string => (relPath.includes('/') ? relPath.slice(0, relPath.indexOf('/')) : ROOT_GROUP);

/**
 * O que a origem tem que o destino não tem: arquivos novos (caminho ausente) e
 * atualizados (md5 diferente; sem md5, tamanho diferente). Nativos do Google
 * não têm bytes para comparar — só contam como novos. Agrupado pela primeira
 * pasta, que é a granularidade em que o usuário escolhe o que baixar.
 */
export function diffTrees(src: Tree, dst: Tree, path?: JobPath): DiffGroup[] {
  const dstMap = new Map(dst.files.map((f) => [f.relPath, f]));
  const groups = new Map<string, DiffGroup>();
  for (const f of src.files) {
    // O que nunca vai poder ser copiado por este caminho não é "novidade":
    // apareceria para sempre e seria pulado para sempre.
    if (path === 'rift' && !f.canCopy) continue;
    if (path === 'machine' && (f.isNative || !f.canDownload)) continue;
    const d = dstMap.get(f.relPath);
    let kind: DiffFile['kind'] | null = null;
    if (!d) kind = 'new';
    else if (f.isNative || d.isNative) kind = null;
    else if (f.md5 && d.md5) kind = f.md5 !== d.md5 ? 'updated' : null;
    else kind = f.size !== d.size ? 'updated' : null;
    if (!kind) continue;
    const key = groupOf(f.relPath);
    const g = groups.get(key) ?? { folder: key, newFiles: 0, updatedFiles: 0, bytes: 0, files: [] };
    if (kind === 'new') g.newFiles++;
    else g.updatedFiles++;
    g.bytes += f.size;
    g.files.push({ relPath: f.relPath, kind, entry: f });
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.folder === ROOT_GROUP ? -1 : b.folder === ROOT_GROUP ? 1 : a.folder.localeCompare(b.folder)));
}

/**
 * "Verificar novidades": compara origem e destino de uma cópia registrada e
 * deixa baixar só as pastas escolhidas, como um job em modo merge — que nunca
 * apaga nada no destino.
 */
export class ResyncService {
  private lastDiff = new Map<string, DiffGroup[]>();

  constructor(private deps: { repo: JobsRepo; clientFor: (accountId: string) => DriveClient }) {}

  async check(copyId: string): Promise<{ groups: Omit<DiffGroup, 'files'>[] }> {
    const copy = this.deps.repo.copy(copyId);
    if (!copy) throw new Error(t.resync.notFound);
    const src = await listTree(this.deps.clientFor(copy.src_reader_account_id), copy.src_folder_id);
    const dst = await listTree(this.deps.clientFor(copy.dest_account_id), copy.dest_folder_id);
    const groups = diffTrees(src, dst, copy.path);
    this.lastDiff.set(copyId, groups);
    this.deps.repo.touchCopy(copyId, { checked: true });
    return { groups: groups.map(({ files: _files, ...g }) => g) };
  }

  async sync(copyId: string, folders: string[]): Promise<JobRow> {
    const copy = this.deps.repo.copy(copyId);
    if (!copy) throw new Error(t.resync.notFound);
    const groups = this.lastDiff.get(copyId);
    if (!groups) throw new Error(t.resync.checkFirst);
    const files = groups.filter((g) => folders.includes(g.folder)).flatMap((g) => g.files);
    if (!files.length) throw new Error(t.resync.nothingSelected);

    const job = this.deps.repo.create({
      name: copy.name,
      srcFolderId: copy.src_folder_id,
      srcReaderAccountId: copy.src_reader_account_id,
      destAccountId: copy.dest_account_id,
      destParentId: copy.dest_folder_id,
      destParentName: copy.name,
      destFinalName: copy.name,
      path: copy.path,
      mode: 'merge',
      destFolderId: copy.dest_folder_id,
      fileFilter: folders,
    });
    this.deps.repo.insertFiles(
      job.id,
      files.map(({ entry: f }) => ({
        relPath: f.relPath,
        srcId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        md5: f.md5,
        status: copy.path === 'rift' ? (f.canCopy ? 'pending' : 'skipped_blocked') : f.isNative ? 'skipped_native' : f.canDownload ? 'pending' : 'skipped_blocked',
      })),
    );
    this.lastDiff.delete(copyId);
    return this.deps.repo.get(job.id)!;
  }
}
