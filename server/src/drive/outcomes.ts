import { NetworkError, isAuthExpired, isBlocked, isDailyLimit, isDownloadQuota, isNotFound, isStorageFull, isTransient } from './errors';

export type PauseKind = 'quota' | 'auth' | 'storage' | 'offline';

export interface PauseReason {
  kind: PauseKind;
  /** Quando retomar sozinho (epoch ms); null = só por ação externa (reconectar, liberar espaço). */
  until: number | null;
  message: string;
  /** Em pausa por auth: qual conta desconectou. */
  accountId?: string;
}

// Lançado de dentro do laço quando o job inteiro precisa parar — não é um erro
// de arquivo, é uma condição do mundo (cota, conta, espaço, rede).
export class JobPaused extends Error {
  constructor(public reason: PauseReason) {
    super(reason.message);
  }
}

export type FileOutcome =
  | { status: 'done'; destId: string; bytes: number }
  | { status: 'skipped_blocked' | 'skipped_native' | 'missing' | 'failed'; error?: string }
  | { status: 'deferred'; until: number; error?: string };

export type Failure = 'transient' | 'pause_quota' | 'pause_auth' | 'pause_storage' | 'pause_offline' | 'blocked' | 'missing' | 'deferred' | 'fatal';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

// A ordem importa: um 401 é auth antes de ser qualquer outra coisa; um 403 pode
// ser "sem espaço", "cota do arquivo", "bloqueado pelo dono" ou "limite do dia".
export function classifyFailure(err: unknown): Failure {
  if (isAuthExpired(err)) return 'pause_auth';
  if (isStorageFull(err)) return 'pause_storage';
  if (isDownloadQuota(err)) return 'deferred';
  if (isBlocked(err)) return 'blocked';
  if (isNotFound(err)) return 'missing';
  if (isDailyLimit(err)) return 'pause_quota';
  if (err instanceof NetworkError) return 'pause_offline';
  if (isTransient(err)) return 'transient';
  return 'fatal';
}
