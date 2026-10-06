import { OAuthError } from '../auth/oauth';

// Erro estruturado da API do Drive: status HTTP + `reason` (o campo que o
// Google usa para dizer O QUE aconteceu, ex.: cannotCopyFile) + mensagem.
export class DriveError extends Error {
  /** Conta cuja chamada falhou — para o motor saber QUEM desconectou. */
  accountId?: string;

  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message || reason);
  }
}

// Rede fora, DNS, conexão recusada: o fetch nem chegou a responder.
export class NetworkError extends Error {}

const has = (e: unknown, reasons: string[], re?: RegExp): boolean =>
  e instanceof DriveError && (reasons.includes(e.reason) || (re ? re.test(e.message) : false));

// Vale tentar de novo daqui a pouco.
export const isTransient = (e: unknown): boolean =>
  e instanceof NetworkError ||
  (e instanceof DriveError &&
    (e.status === 429 || e.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError'].includes(e.reason)));

// O Google cortou o volume do dia da conta. userRateLimitExceeded NÃO entra:
// é transitório por natureza, e só vira "limite" quando persiste (regra do laço).
export const isDailyLimit = (e: unknown): boolean =>
  has(e, ['dailyLimitExceeded', 'quotaExceeded', 'activeItemCreationLimitExceeded'], /upload limit|daily limit/i);

// Cota de download DO ARQUIVO compartilhado (distribuição em massa): renova em ~24 h.
export const isDownloadQuota = (e: unknown): boolean => has(e, ['downloadQuotaExceeded'], /download quota/i);

// O dono desativou cópia/download: permanente, tentar de novo nunca resolve.
export const isBlocked = (e: unknown): boolean =>
  has(e, ['cannotCopyFile', 'cannotDownloadFile', 'fileNotDownloadable', 'cannotCopyAbusiveFile'], /cannot be copied|cannot be downloaded|not downloadable/i);

// Token morto ou revogado: só reconectar resolve.
export const isAuthExpired = (e: unknown): boolean =>
  (e instanceof DriveError && (e.status === 401 || e.reason === 'authError')) ||
  (e instanceof OAuthError && (e.code === 'invalid_grant' || e.code === 'invalid_client'));

export const isStorageFull = (e: unknown): boolean => has(e, ['storageQuotaExceeded'], /storage quota/i);

export const isNotFound = (e: unknown): boolean => e instanceof DriveError && (e.status === 404 || e.reason === 'notFound');

// 403 "genérico" de permissão: a conta não enxerga o item.
export const isForbidden = (e: unknown): boolean =>
  e instanceof DriveError &&
  e.status === 403 &&
  ['forbidden', 'insufficientFilePermissions', 'insufficientPermissions', 'appNotAuthorizedToFile'].includes(e.reason);
