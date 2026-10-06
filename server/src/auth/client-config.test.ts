import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo, maskClientId, validateClientId } from './client-config';

describe('client-config', () => {
  it('valida o formato do client id', () => {
    expect(validateClientId('1234567890-abc123def.apps.googleusercontent.com')).toBe(true);
    expect(validateClientId('  1234567890-abc123def.apps.googleusercontent.com  ')).toBe(true);
    expect(validateClientId('abc')).toBe(false);
    expect(validateClientId('')).toBe(false);
  });

  it('mascara deixando só o fim', () => {
    expect(maskClientId('1234567890-abc123def.apps.googleusercontent.com')).toBe('…123def.apps.googleusercontent.com');
  });

  it('grava e lê, uma linha só', () => {
    const repo = new OauthClientRepo(openDb(':memory:'));
    expect(repo.get()).toBeNull();
    repo.set('1-a.apps.googleusercontent.com', 'GOCSPX-x');
    repo.set('2-b.apps.googleusercontent.com', ' GOCSPX-y ');
    expect(repo.get()).toEqual({ clientId: '2-b.apps.googleusercontent.com', clientSecret: 'GOCSPX-y' });
  });
});
