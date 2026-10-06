import { createRequire } from 'node:module';
import type { DatabaseSync as DbType } from 'node:sqlite';
import { SCHEMA_V1 } from './schema';

// node:sqlite entra por require(), e não por import estático, para o aviso de
// "feature experimental" poder ser silenciado (ver quiet.ts).
//
// O motivo é sutil: em ESM, os módulos embutidos são instanciados na fase de
// LIGAÇÃO, antes de qualquer corpo de módulo rodar — inclusive o do quiet.ts.
// Um require() é chamada de execução, então acontece depois do filtro estar de
// pé. O `import type` acima não conta: tipos somem na compilação.
//
// O ternário cobre os dois formatos em que este código roda: empacotado em
// CommonJS (onde require é nativo) e direto do fonte em ESM pelo tsx (onde não
// é, e o createRequire resolve).
declare const require: NodeJS.Require | undefined;
const load: NodeJS.Require = typeof require === 'function' ? require : createRequire(import.meta.url);

const { DatabaseSync } = load('node:sqlite') as {
  DatabaseSync: new (path: string) => DbType;
};

/**
 * O banco do RiftDrive usa o SQLite que já vem dentro do Node (`node:sqlite`),
 * e não um módulo nativo.
 *
 * O motivo é a embalagem: um `.node` compilado não entra num executável único,
 * então enquanto o SQLite fosse um módulo nativo o app jamais viraria "baixe um
 * arquivo e rode". Sem ele, o servidor inteiro é JavaScript puro.
 *
 * Em troca, faltam dois açúcares que o better-sqlite3 dava de graça — `pragma()`
 * e `transaction()`. Estão aqui embaixo.
 */
export type Db = DbType;

/**
 * Lê ou escreve um PRAGMA.
 *
 * `pragma(db, 'user_version')` lê; `pragma(db, 'user_version = 2')` escreve.
 */
export function pragma(db: Db, expr: string): unknown {
  if (expr.includes('=')) {
    db.exec(`PRAGMA ${expr}`);
    return undefined;
  }
  const row = db.prepare(`PRAGMA ${expr}`).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
}

// Profundidade POR BANCO, não global: a suíte mantém vários bancos abertos ao
// mesmo tempo, e um contador único faria um confundir o estado do outro.
const depth = new WeakMap<Db, number>();

/**
 * Roda `fn` dentro de uma transação, desfazendo tudo se algo falhar.
 *
 * Aninhamento usa SAVEPOINT porque o SQLite recusa BEGIN dentro de BEGIN.
 */
export function transaction(db: Db, fn: () => void): void {
  const level = depth.get(db) ?? 0;
  const point = `riftdrive_sp_${level}`;

  db.exec(level === 0 ? 'BEGIN' : `SAVEPOINT ${point}`);
  depth.set(db, level + 1);

  try {
    fn();
    db.exec(level === 0 ? 'COMMIT' : `RELEASE ${point}`);
  } catch (err) {
    // ROLLBACK TO não encerra o savepoint — sem o RELEASE em seguida, ele
    // continuaria aberto e o próximo nível reusaria o mesmo nome.
    if (level === 0) db.exec('ROLLBACK');
    else {
      db.exec(`ROLLBACK TO ${point}`);
      db.exec(`RELEASE ${point}`);
    }
    throw err;
  } finally {
    depth.set(db, level);
  }
}

// Runner de migrações guardado por PRAGMA user_version. Para evoluir o schema,
// acrescente um bloco `if (version < N)` novo.
export function migrate(db: Db): void {
  const version = pragma(db, 'user_version') as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    pragma(db, 'user_version = 1');
  }
}

export function openDb(dbPath: string): Db {
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') pragma(db, 'journal_mode = WAL');
  pragma(db, 'foreign_keys = ON');
  migrate(db);
  return db;
}
