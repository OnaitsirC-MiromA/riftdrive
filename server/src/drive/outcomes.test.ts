import { describe, expect, it } from 'vitest';
import { DriveError, NetworkError } from './errors';
import { OAuthError } from '../auth/oauth';
import { classifyFailure } from './outcomes';

const e = (s: number, r: string, m = '') => new DriveError(s, r, m);

describe('classifyFailure', () => {
  it.each([
    [e(401, 'authError'), 'pause_auth'],
    [new OAuthError('invalid_grant', ''), 'pause_auth'],
    [e(403, 'storageQuotaExceeded'), 'pause_storage'],
    [e(403, 'downloadQuotaExceeded'), 'deferred'],
    [e(403, 'cannotCopyFile'), 'blocked'],
    [e(404, 'notFound'), 'missing'],
    [e(403, 'dailyLimitExceeded'), 'pause_quota'],
    [e(429, 'rateLimitExceeded'), 'transient'],
    [e(403, 'userRateLimitExceeded'), 'transient'],
    [new NetworkError('ECONNRESET'), 'pause_offline'],
    [e(400, 'badRequest'), 'fatal'],
    [new Error('x'), 'fatal'],
  ])('%o → %s', (err, kind) => expect(classifyFailure(err)).toBe(kind));
});
