// Primeiro import de todos, de propósito — ver quiet.ts.
import './quiet';
import fs from 'node:fs';
import { loadConfig } from './config';
import { APP_VERSION, WEB_ASSETS } from './bundled';
import { openDb } from './db';
import { buildDeps } from './deps';
import { buildApp } from './app';
import { listenWithFallback } from './listen';
import { bootMessage } from './banner';
import { openBrowser } from './open-browser';

const config = loadConfig();

// 0700: aqui dentro moram os tokens do Google do usuário.
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

const db = openDb(config.dbPath);
const deps = buildDeps(config, db);
const app = buildApp(config, db, deps);
// Sem interface embutida (desenvolvimento), quem abre o navegador é o Vite.
const hasUi = Boolean(WEB_ASSETS['/index.html']);

const shutdown = () => {
  deps.engine.stop();
  app.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Numa função, e não com await no topo do módulo: o empacotamento gera
// CommonJS — exigência do executável único — e CommonJS não tem top-level await.
async function main(): Promise<void> {
  try {
    const { port, changed } = await listenWithFallback(app, config.port, config.bind);
    const url = `http://localhost:${port}`;
    const opening = config.openBrowser && hasUi;
    const configured =
      (db.prepare('SELECT COUNT(*) AS n FROM oauth_client').get() as { n: number }).n > 0 &&
      (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n > 0;

    console.log(
      bootMessage({
        version: APP_VERSION,
        dataDir: config.dataDir,
        url,
        changedPort: changed,
        requestedPort: config.port,
        openingBrowser: opening,
        configured,
      }).join('\n'),
    );

    if (opening) openBrowser(url);

    // O motor só sobe depois do servidor: um job que estava no meio quando o
    // processo morreu volta à fila e recomeça do inventário.
    deps.engine.recoverOnBoot();
    deps.engine.start(1000);
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

void main();
