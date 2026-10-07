import type { AccountRow, JobPath } from '../types';
import { FOLDER_MIME, SHORTCUT_MIME, type DriveClient, type DriveFile } from './client';
import { isForbidden, isNotFound } from './errors';
import { parseDriveId } from './links';
import { listTree, type Tree } from './tree';
import type { QuotaEvaluation, QuotaService } from './quota';
import { t } from '../i18n/strings';

export type InspectErrorCode = 'invalid_link' | 'not_a_folder' | 'no_access' | 'dest_unreachable';

export class InspectError extends Error {
  constructor(
    public code: InspectErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface InspectDeps {
  clientFor(accountId: string): DriveClient;
  accounts: AccountRow[];
  quota: QuotaService;
  onProgress?: (filesSeen: number) => void;
  signal?: AbortSignal;
}

export interface InspectInput {
  link: string;
  destAccountId: string;
  destParentId: string;
  destParentName: string;
}

export interface InspectResult {
  folderId: string;
  name: string;
  owner: string | null;
  path: JobPath;
  readerAccountId: string;
  readerEmail: string;
  destAccountId: string;
  destEmail: string;
  totals: { files: number; bytes: number };
  blocked: { count: number; bytes: number; sample: { name: string; relPath: string }[] };
  native: { count: number };
  copyableBytes: number;
  destConflict: { existingFolderId: string } | null;
  quota: QuotaEvaluation;
  shareRequestText: string | null;
}

const notAccessible = (err: unknown) => isNotFound(err) || isForbidden(err);

// Quem consegue ler a origem? Primeiro a conta de destino (→ rift: a cópia
// acontece dentro do Google). Senão, as outras contas conectadas (→ máquina:
// lê como uma, escreve como outra). Ninguém → sem saída, e dizemos qual.
async function resolveReader(deps: InspectDeps, id: string, destAccountId: string): Promise<{ reader: AccountRow; file: DriveFile; path: JobPath }> {
  const dest = deps.accounts.find((a) => a.id === destAccountId);
  if (!dest) throw new InspectError('dest_unreachable', t.inspect.destUnreachable);
  const ordered = [dest, ...deps.accounts.filter((a) => a.id !== destAccountId && a.status === 'ok')];
  for (const acc of ordered) {
    try {
      const file = await deps.clientFor(acc.id).getFile(id);
      return { reader: acc, file, path: acc.id === destAccountId ? 'rift' : 'machine' };
    } catch (err) {
      if (!notAccessible(err)) throw err;
    }
  }
  throw new InspectError('no_access', t.inspect.noAccess(dest.email));
}

export async function inspect(deps: InspectDeps, input: InspectInput): Promise<{ result: InspectResult; tree: Tree }> {
  const id = parseDriveId(input.link);
  if (!id) throw new InspectError('invalid_link', t.inspect.invalidLink);

  const resolved = await resolveReader(deps, id, input.destAccountId);
  const { reader, path } = resolved;
  let file = resolved.file;
  const client = deps.clientFor(reader.id);
  if (file.mimeType === SHORTCUT_MIME && file.shortcutDetails) {
    const target = await client.getFile(file.shortcutDetails.targetId);
    file = { ...target, name: target.name };
  }
  if (file.mimeType !== FOLDER_MIME) throw new InspectError('not_a_folder', t.inspect.notAFolder);

  const tree = await listTree(client, file.id, { onProgress: deps.onProgress, signal: deps.signal });

  // Pelo rift o que importa é poder copiar; pela máquina, poder baixar — e
  // nativos do Google não têm bytes para baixar.
  const blockedFiles = tree.files.filter((f) => !f.isNative && (path === 'rift' ? !f.canCopy : !f.canDownload));
  const nativeOut = path === 'machine' ? tree.files.filter((f) => f.isNative) : [];
  const blockedBytes = blockedFiles.reduce((n, f) => n + f.size, 0);
  const copyableBytes = tree.totalBytes - blockedBytes;

  const dest = deps.accounts.find((a) => a.id === input.destAccountId)!;
  const conflict = await findConflict(deps.clientFor(dest.id), input.destParentId, file.name);

  const result: InspectResult = {
    folderId: file.id,
    name: file.name,
    owner: file.owners?.[0]?.emailAddress ?? null,
    path,
    readerAccountId: reader.id,
    readerEmail: reader.email,
    destAccountId: dest.id,
    destEmail: dest.email,
    totals: { files: tree.files.length, bytes: tree.totalBytes },
    blocked: { count: blockedFiles.length, bytes: blockedBytes, sample: blockedFiles.slice(0, 20).map((f) => ({ name: f.name, relPath: f.relPath })) },
    native: { count: nativeOut.length },
    copyableBytes,
    destConflict: conflict,
    quota: deps.quota.evaluate(dest.id, copyableBytes),
    shareRequestText: path === 'machine' ? t.inspect.shareRequest(file.name, dest.email) : null,
  };
  return { result, tree };
}

// Já existe no destino uma pasta com o nome da origem? É o que decide entre
// criar "(2)" e mesclar.
async function findConflict(client: DriveClient, parentId: string, name: string): Promise<InspectResult['destConflict']> {
  const siblings = await client.listChildren(parentId);
  const hit = siblings.find((s) => s.mimeType === FOLDER_MIME && s.name === name);
  return hit ? { existingFolderId: hit.id } : null;
}

/**
 * Só a pasta de destino mudou, dentro da mesma conta: a árvore, o caminho, os
 * bloqueados e a cota são os mesmos da análise guardada. Confere apenas o
 * conflito no novo pai — uma chamada, em vez de reler a origem inteira.
 */
export async function reinspectDest(deps: Pick<InspectDeps, 'clientFor'>, cached: InspectResult, destParentId: string): Promise<InspectResult> {
  const destConflict = await findConflict(deps.clientFor(cached.destAccountId), destParentId, cached.name);
  return { ...cached, destConflict };
}
