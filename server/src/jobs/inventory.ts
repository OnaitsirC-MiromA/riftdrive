import type { FileStatus, JobPath } from '../types';
import type { TreeEntry } from '../drive/tree';
import type { NewJobFile } from './repo';

// Com que estado cada arquivo da árvore entra no inventário. Pelo rift o que
// importa é poder copiar; pela máquina, poder baixar — e nativos do Google não
// têm bytes para baixar, então ficam de fora com motivo.
export function initialStatus(entry: TreeEntry, path: JobPath): FileStatus {
  if (path === 'rift') return entry.canCopy ? 'pending' : 'skipped_blocked';
  if (entry.isNative) return 'skipped_native';
  return entry.canDownload ? 'pending' : 'skipped_blocked';
}

export function toNewJobFiles(entries: TreeEntry[], path: JobPath): NewJobFile[] {
  return entries.map((f) => ({ relPath: f.relPath, srcId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5, status: initialStatus(f, path) }));
}
