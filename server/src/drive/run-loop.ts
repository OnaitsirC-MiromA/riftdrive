import type { JobFileRow, JobRow } from '../types';
import type { JobsRepo } from '../jobs/repo';
import { nextResetAt, type QuotaService } from './quota';
import { DAY, HOUR, JobPaused, classifyFailure, type FileOutcome, type PauseReason } from './outcomes';
import { t } from '../i18n/strings';

export interface RunContext {
  job: JobRow;
  repo: JobsRepo;
  quota: QuotaService;
  signal: AbortSignal;
  now: () => number;
  concurrency: number;
  /** Bytes que avançaram — quem chama é o caminho (rift: ao concluir cada arquivo; máquina: a cada bloco). */
  onProgress?: (deltaBytes: number) => void;
}

export type RunResult = { kind: 'completed' } | { kind: 'paused'; reason: PauseReason } | { kind: 'aborted' };

// Quantas tentativas transitórias seguidas até concluir que o Google está
// mesmo limitando a conta (userRateLimitExceeded persistente) e pausar 1 h.
const PERSISTENT_TRANSIENT = 3;
const OFFLINE_RETRY_MS = 60_000;

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Executa `fn` sobre `items` com até `n` em paralelo. `shouldStop` é consultado
 * antes de pegar o próximo item — quando o job pausa, os workers terminam o que
 * têm na mão e não começam mais nada.
 */
export async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>, shouldStop: () => boolean = () => false): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length && !shouldStop()) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * O laço comum aos dois caminhos (rift e máquina).
 *
 * Pega lotes de arquivos pendentes, reserva cota, chama `processFile` e aplica
 * o desfecho no inventário. Erros são classificados aqui, num lugar só: o que é
 * do arquivo (bloqueado, sumiu, cota do arquivo, fatal) marca o arquivo e segue;
 * o que é do mundo (conta, espaço, rede, limite do dia) pausa o job inteiro.
 */
export async function runLoop(ctx: RunContext, processFile: (file: JobFileRow) => Promise<FileOutcome>): Promise<RunResult> {
  const { job, repo, quota } = ctx;
  let pause: PauseReason | null = null;
  let consecutiveTransient = 0;

  const requestPause = (reason: PauseReason) => {
    if (!pause) pause = reason;
  };

  const handle = async (file: JobFileRow): Promise<void> => {
    if (ctx.signal.aborted || pause) return;

    // Reserva otimista: registra antes de copiar para dois workers não passarem
    // juntos pela mesma folga; devolve se o arquivo não for copiado.
    if (!quota.canSpend(job.dest_account_id, file.size)) {
      const until = nextResetAt(ctx.now(), quota.settings().resetHour);
      requestPause({ kind: 'quota', until, message: t.jobs.quotaDay(hhmm(until)) });
      return;
    }
    quota.record(job.dest_account_id, file.size);
    let reserved = file.size;

    try {
      const outcome = await processFile(file);
      if (outcome.status === 'done') {
        if (outcome.bytes !== reserved) quota.record(job.dest_account_id, outcome.bytes - reserved);
        reserved = 0;
        repo.setFile(job.id, file.rel_path, { status: 'done', dest_id: outcome.destId, last_error: null, upload_uri: null });
        consecutiveTransient = 0;
      } else if (outcome.status === 'deferred') {
        repo.setFile(job.id, file.rel_path, { status: 'deferred', deferred_until: outcome.until, last_error: outcome.error ?? null });
      } else {
        repo.setFile(job.id, file.rel_path, { status: outcome.status, last_error: outcome.error ?? null });
      }
    } catch (err) {
      if (err instanceof JobPaused) {
        requestPause(err.reason);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      switch (classifyFailure(err)) {
        case 'transient': {
          repo.setFile(job.id, file.rel_path, { attempts: file.attempts + 1, last_error: message });
          consecutiveTransient++;
          if (consecutiveTransient >= PERSISTENT_TRANSIENT) requestPause({ kind: 'quota', until: ctx.now() + HOUR, message: t.jobs.rateLimited });
          break;
        }
        case 'pause_quota':
          repo.setFile(job.id, file.rel_path, { attempts: file.attempts + 1, last_error: message });
          requestPause({ kind: 'quota', until: ctx.now() + HOUR, message: t.jobs.dailyLimit });
          break;
        case 'pause_auth':
          requestPause({ kind: 'auth', until: null, message: t.jobs.auth });
          break;
        case 'pause_storage':
          requestPause({ kind: 'storage', until: null, message: t.jobs.storage });
          break;
        case 'pause_offline':
          repo.setFile(job.id, file.rel_path, { attempts: file.attempts + 1, last_error: message });
          requestPause({ kind: 'offline', until: ctx.now() + OFFLINE_RETRY_MS, message: t.jobs.offline });
          break;
        case 'blocked':
          repo.setFile(job.id, file.rel_path, { status: 'skipped_blocked', last_error: message });
          break;
        case 'missing':
          repo.setFile(job.id, file.rel_path, { status: 'missing', last_error: message });
          break;
        case 'deferred':
          repo.setFile(job.id, file.rel_path, { status: 'deferred', deferred_until: ctx.now() + DAY, last_error: message });
          break;
        case 'fatal':
          // O cliente já retentou o que era transitório; o que sobra é definitivo.
          repo.setFile(job.id, file.rel_path, { status: 'failed', attempts: file.attempts + 1, last_error: message });
          break;
      }
    } finally {
      if (reserved) quota.record(job.dest_account_id, -reserved);
    }
  };

  for (;;) {
    if (ctx.signal.aborted) return { kind: 'aborted' };
    if (pause) return { kind: 'paused', reason: pause };

    const batch = repo.nextPending(job.id, Math.max(1, ctx.concurrency * 2));
    if (!batch.length) {
      const c = repo.countPending(job.id);
      if (c.pending === 0 && c.deferredFuture === 0) return { kind: 'completed' };
      return { kind: 'paused', reason: { kind: 'quota', until: c.minDeferredUntil ?? ctx.now() + DAY, message: t.jobs.waitingDownloadQuota } };
    }

    await runPool(batch, ctx.concurrency, handle, () => ctx.signal.aborted || pause !== null);
    repo.recount(job.id);
  }
}
