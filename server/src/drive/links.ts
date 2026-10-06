// Ids do Drive têm 25–44 caracteres de [A-Za-z0-9_-]; 10 é um piso folgado.
const ID = /^[\w-]{10,}$/;

/**
 * Extrai o id de pasta/arquivo de qualquer forma que o usuário cole:
 * `/drive/folders/{id}`, `/drive/u/0/folders/{id}`, `/file/d/{id}/view`,
 * `/document/d/{id}`, `open?id={id}`, ou o id puro.
 */
export function parseDriveId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
  const q = u.searchParams.get('id');
  if (q && ID.test(q)) return q;
  const m = u.pathname.match(/\/(?:folders|d)\/([\w-]{10,})/);
  return m ? m[1] : null;
}
