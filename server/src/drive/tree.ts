import { FOLDER_MIME, SHORTCUT_MIME, isNativeGoogleMime, type DriveClient, type DriveFile } from './client';
import { isNotFound } from './errors';
import { t } from '../i18n/strings';

export interface TreeEntry {
  relPath: string;
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5: string | null;
  canCopy: boolean;
  canDownload: boolean;
  isNative: boolean;
}

export interface TreeFolder {
  relPath: string;
  id: string;
  name: string;
}

export interface Tree {
  files: TreeEntry[];
  folders: TreeFolder[];
  totalBytes: number;
}

// Nomes repetidos na mesma pasta existem no Drive; no destino viram "a (2).mp4".
export function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
}

/**
 * Lê a árvore inteira de uma pasta: todos os arquivos com caminho relativo,
 * todas as subpastas. Atalhos são seguidos (pasta → entra; arquivo → entra com
 * o nome do atalho); alvo de atalho que sumiu é ignorado; lixeira não entra.
 */
export async function listTree(client: DriveClient, rootId: string, opts: { onProgress?: (filesSeen: number) => void; signal?: AbortSignal } = {}): Promise<Tree> {
  const files: TreeEntry[] = [];
  const folders: TreeFolder[] = [];
  let totalBytes = 0;
  const queue: { id: string; relPath: string }[] = [{ id: rootId, relPath: '' }];

  while (queue.length) {
    if (opts.signal?.aborted) throw new Error(t.inspect.canceled);
    const cur = queue.shift()!;
    const used = new Set<string>();
    for (const child of await client.listChildren(cur.id)) {
      let node: DriveFile = child;
      if (child.mimeType === SHORTCUT_MIME && child.shortcutDetails) {
        try {
          node = { ...(await client.getFile(child.shortcutDetails.targetId)), name: child.name };
        } catch (err) {
          if (isNotFound(err)) continue;
          throw err;
        }
      }
      const name = uniqueName(used, node.name);
      const relPath = cur.relPath ? `${cur.relPath}/${name}` : name;
      if (node.mimeType === FOLDER_MIME) {
        folders.push({ relPath, id: node.id, name });
        queue.push({ id: node.id, relPath });
        continue;
      }
      const isNative = isNativeGoogleMime(node.mimeType);
      const size = isNative ? 0 : node.size;
      files.push({
        relPath,
        id: node.id,
        name,
        mimeType: node.mimeType,
        size,
        md5: node.md5Checksum,
        canCopy: node.capabilities?.canCopy !== false,
        canDownload: node.capabilities?.canDownload !== false,
        isNative,
      });
      totalBytes += size;
    }
    opts.onProgress?.(files.length);
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { files, folders, totalBytes };
}
