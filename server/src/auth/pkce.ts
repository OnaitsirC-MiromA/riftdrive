import { createHash, randomBytes } from 'node:crypto';

// PKCE (RFC 7636): o verifier fica só na memória do servidor; o challenge vai
// na URL. Sem isso, um código interceptado no loopback poderia ser trocado por
// qualquer processo que conhecesse o client_id.
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url'); // 64 caracteres, dentro de 43–128
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(24).toString('base64url');
}
