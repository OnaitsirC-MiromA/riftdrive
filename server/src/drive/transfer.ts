import type { JobFileRow, JobRow } from '../types';
import type { JobsRepo } from '../jobs/repo';
import { isNativeGoogleMime, type DriveClient } from './client';
import { DriveError, isNotFound } from './errors';
import { FolderMirror, dirname } from './copier';
import { runLoop, type RunContext, type RunResult } from './run-loop';
import type { FileOutcome } from './outcomes';
import { t } from '../i18n/strings';

// Múltiplo de 256 KiB, exigência do upload retomável do Google (exceto o último bloco).
export const CHUNK_SIZE = 16 * 1024 * 1024;

export interface TransferDeps {
  reader: DriveClient;
  writer: DriveClient;
  repo: JobsRepo;
  job: JobRow;
  chunkSize?: number;
  onBytes?: (n: number) => void;
}

/**
 * Consome o stream do download e entrega blocos de tamanho EXATO `chunkSize`
 * (só o último pode ser menor), pulando `skip` bytes iniciais quando o servidor
 * ignorou o Range.
 */
export async function pump(res: Response, skip: number, chunkSize: number, send: (chunk: Uint8Array) => Promise<void>): Promise<void> {
  if (!res.body) return;
  const parts: Uint8Array[] = [];
  let len = 0;
  let toSkip = skip;

  const drain = async (final: boolean) => {
    while (len >= chunkSize || (final && len > 0)) {
      const take = Math.min(chunkSize, len);
      const out = new Uint8Array(take);
      let off = 0;
      while (off < take) {
        const head = parts[0];
        const n = Math.min(head.byteLength, take - off);
        out.set(head.subarray(0, n), off);
        off += n;
        if (n === head.byteLength) parts.shift();
        else parts[0] = head.subarray(n);
      }
      len -= take;
      await send(out);
    }
  };

  for await (const raw of res.body as AsyncIterable<Uint8Array>) {
    let chunk = raw;
    if (toSkip > 0) {
      const n = Math.min(toSkip, chunk.byteLength);
      chunk = chunk.subarray(n);
      toSkip -= n;
      if (!chunk.byteLength) continue;
    }
    parts.push(chunk);
    len += chunk.byteLength;
    await drain(false);
  }
  await drain(true);
}

const sessionGone = (err: unknown) => isNotFound(err) || (err instanceof DriveError && err.status === 410);

/**
 * Um arquivo pelo caminho da máquina: baixa da conta leitora e sobe na conta de
 * destino numa sessão de upload retomável, bloco a bloco. O progresso fica em
 * `job_files` (`upload_uri`, `bytes_uploaded`): fechar o app no meio de um
 * arquivo de 4 GB custa, no máximo, o bloco em andamento.
 *
 * Erros do Drive sobem crus — o laço classifica (bloqueado, sem espaço, conta…).
 */
export async function transferOneFile(d: TransferDeps, file: JobFileRow, parentId: string): Promise<FileOutcome> {
  if (isNativeGoogleMime(file.mime_type)) return { status: 'skipped_native', error: t.transfer.nativeSkipped };
  const mimeType = file.mime_type || 'application/octet-stream';

  if (file.size === 0) {
    const created = await d.writer.createEmptyFile(file.name, parentId, mimeType);
    return { status: 'done', destId: created.id, bytes: 0 };
  }

  const chunkSize = d.chunkSize ?? CHUNK_SIZE;
  let uri = file.upload_uri;
  let received = 0;

  if (uri) {
    try {
      const st = await d.writer.uploadStatus(uri, file.size);
      if (st.done) return { status: 'done', destId: st.file.id, bytes: file.size };
      received = st.received;
    } catch (err) {
      if (!sessionGone(err)) throw err;
      uri = null; // sessão morreu (~1 semana): recomeça o arquivo
    }
  }
  if (!uri) {
    uri = await d.writer.createUploadSession({ name: file.name, parentId, mimeType, size: file.size });
    received = 0;
    d.repo.setFile(d.job.id, file.rel_path, { upload_uri: uri, bytes_uploaded: 0 });
  }

  const res = await d.reader.download(file.src_id, received);
  // 200 em vez de 206 = o servidor mandou do começo apesar do Range: descartamos o que já subiu.
  const skip = received > 0 && res.status !== 206 ? received : 0;
  const sessionUri = uri;
  let offset = received;
  let destId: string | null = null;

  await pump(res, skip, chunkSize, async (chunk) => {
    const r = await d.writer.uploadChunk(sessionUri, chunk, offset, file.size);
    offset += chunk.byteLength;
    d.repo.setFile(d.job.id, file.rel_path, { bytes_uploaded: offset });
    d.onBytes?.(chunk.byteLength);
    if (r.done) destId = r.file.id;
  });

  if (!destId) {
    const st = await d.writer.uploadStatus(sessionUri, file.size);
    if (!st.done) throw new DriveError(0, 'uploadIncomplete', t.transfer.incomplete(st.received, file.size));
    destId = st.file.id;
  }
  return { status: 'done', destId, bytes: file.size };
}

export async function runMachine(ctx: RunContext & { reader: DriveClient; writer: DriveClient; chunkSize?: number }): Promise<RunResult> {
  const mirror = new FolderMirror(ctx.writer, ctx.repo, ctx.job);
  return runLoop(ctx, async (file) => {
    const parentId = await mirror.ensure(dirname(file.rel_path));
    return transferOneFile({ reader: ctx.reader, writer: ctx.writer, repo: ctx.repo, job: ctx.job, chunkSize: ctx.chunkSize, onBytes: ctx.onProgress }, file, parentId);
  });
}
