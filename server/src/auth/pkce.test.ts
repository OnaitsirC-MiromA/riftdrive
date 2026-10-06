import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPkce, randomState } from './pkce';

describe('pkce', () => {
  it('challenge é o SHA-256 em base64url do verifier', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('state é aleatório e seguro para URL', () => {
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(randomState()).not.toBe(randomState());
  });
});
