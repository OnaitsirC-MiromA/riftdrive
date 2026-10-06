import { describe, expect, it } from 'vitest';
import { DriveError, NetworkError, isAuthExpired, isBlocked, isDailyLimit, isDownloadQuota, isForbidden, isNotFound, isStorageFull, isTransient } from './errors';
import { OAuthError } from '../auth/oauth';

const e = (status: number, reason: string, message = '') => new DriveError(status, reason, message);

describe('classificação de erros do Drive', () => {
  it('transitórios', () => {
    expect(isTransient(e(429, 'rateLimitExceeded'))).toBe(true);
    expect(isTransient(e(403, 'userRateLimitExceeded'))).toBe(true);
    expect(isTransient(e(503, 'backendError'))).toBe(true);
    expect(isTransient(new NetworkError('x'))).toBe(true);
    expect(isTransient(e(403, 'cannotCopyFile'))).toBe(false);
  });

  it('limite diário (nunca userRateLimitExceeded, que é transitório)', () => {
    expect(isDailyLimit(e(403, 'dailyLimitExceeded'))).toBe(true);
    expect(isDailyLimit(e(403, 'activeItemCreationLimitExceeded'))).toBe(true);
    expect(isDailyLimit(e(403, 'x', 'The user has exceeded their upload limit'))).toBe(true);
    expect(isDailyLimit(e(403, 'userRateLimitExceeded'))).toBe(false);
  });

  it('cota de download do arquivo compartilhado', () => {
    expect(isDownloadQuota(e(403, 'downloadQuotaExceeded'))).toBe(true);
    expect(isDownloadQuota(e(403, 'x', 'The download quota for this file has been exceeded'))).toBe(true);
    expect(isDownloadQuota(e(403, 'cannotCopyFile'))).toBe(false);
  });

  it('bloqueado pelo dono', () => {
    expect(isBlocked(e(403, 'cannotCopyFile'))).toBe(true);
    expect(isBlocked(e(403, 'cannotDownloadFile'))).toBe(true);
    expect(isBlocked(e(403, 'fileNotDownloadable'))).toBe(true);
    expect(isBlocked(e(403, 'x', 'This file cannot be copied by the user.'))).toBe(true);
  });

  it('autenticação', () => {
    expect(isAuthExpired(e(401, 'authError'))).toBe(true);
    expect(isAuthExpired(new OAuthError('invalid_grant', ''))).toBe(true);
    expect(isAuthExpired(e(403, 'forbidden'))).toBe(false);
  });

  it('armazenamento cheio, não encontrado, proibido', () => {
    expect(isStorageFull(e(403, 'storageQuotaExceeded'))).toBe(true);
    expect(isNotFound(e(404, 'notFound'))).toBe(true);
    expect(isForbidden(e(403, 'insufficientFilePermissions'))).toBe(true);
    expect(isForbidden(e(403, 'cannotCopyFile'))).toBe(false);
  });
});
