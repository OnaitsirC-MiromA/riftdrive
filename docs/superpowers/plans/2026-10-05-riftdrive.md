# RiftDrive — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o RiftDrive — app local que copia pastas de um Google Drive para outro (pelo rift, servidor-a-servidor; ou pela máquina, entre contas), com OAuth do próprio usuário, cota diária, retomada e re-sync — distribuído como `npx riftdrive` e executável único.

**Architecture:** Um processo Node ≥ 22.5: Fastify serve a SPA embutida e a API JSON em `127.0.0.1:7799`; o motor de cópia (Drive API v3 via `fetch`, sem rclone) roda no mesmo processo; estado em SQLite via `node:sqlite` (zero módulos nativos). A SPA (React + Vite + Tailwind + TanStack Query) faz polling da API. Empacotamento no padrão Learnflix (esbuild → `.cjs` único → SEA).

**Tech Stack:** Node 22.5+, TypeScript 5, Fastify 5, `node:sqlite`, Vitest 4, React 18, Vite 6, Tailwind 3, TanStack Query 5, React Router 7, esbuild, postject, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-05-riftdrive-design.md`

## Global Constraints

- Node `>=22.5.0`; `npm` (não pnpm) — o `package-lock.json` é o que o CI usa.
- **Zero módulos nativos** no servidor: só `fastify` e `tsx` como dependências de runtime; banco via `node:sqlite` carregado por `require()`.
- Identificadores em **inglês**; comentários, mensagens, commits e UI em **português (pt-BR)**. Commits com prefixos `feat:`/`fix:`/`test:`/`docs:`/`chore:`/`refactor:`.
- Imports ESM **sem extensão** (`moduleResolution: "Bundler"`); o servidor nunca emite JS (`tsc --noEmit`), roda via `tsx`; o bundle é CommonJS (sem top-level await em `index.ts`).
- Textos da UI e mensagens de erro do servidor **centralizados** em `i18n/strings.ts` (um por lado).
- Vocabulário: **"cota"** (nunca "orçamento"); chips "pelo rift" / "pela sua máquina"; nunca apagar nada no Drive.
- Porta padrão `7799`, bind `127.0.0.1`; pasta de dados por SO (`RIFTDRIVE_DATA_DIR` sobrescreve).
- Paleta/tokens do DESIGN.md: tinta `#0B1020`, superfície `#141A33`, superfície-2 `#1B2240`, texto `#F5F3FF`, violeta `#A78BFA`/`#C4B5FD`, ciano `#67E8F9`, âmbar `#F2B134`, verde `#34D399`, vermelho `#F87171`. Avisos como superfície tingida, **sem borda lateral colorida**.
- Testes **sem rede**: toda chamada HTTP passa por `fetchFn` injetável; o `FakeDrive` é a base.
- Todo passo de teste: `npm test --workspace=server -- <arquivo>` ou `npx vitest run <arquivo>` dentro de `server/`.

---

## Estrutura de arquivos

```
riftdrive/
  package.json · tsconfig.base.json · .gitignore · LICENSE · README.md · CLAUDE.md · PRODUCT.md · DESIGN.md
  install.sh · install.ps1
  .github/workflows/release.yml
  scripts/gerar-bundled.mjs · empacotar.mjs · build-binario.mjs · definir-repo.mjs
  server/
    package.json · tsconfig.json · vitest.config.ts
    src/
      index.ts            bootstrap (quiet → config → db → deps → app → listen → banner → browser)
      app.ts              buildApp(config, db, deps): Fastify + rotas + SPA
      deps.ts             buildDeps(config, db, overrides): repos, serviços, engine, clients
      config.ts           env → AppConfig; defaultDataDir por SO
      listen.ts           listenWithFallback
      open-browser.ts     openCommand / openBrowser
      banner.ts           bootMessage
      quiet.ts            silencia aviso experimental do node:sqlite
      spa.ts              registerSpa(app, WEB_ASSETS)
      security.ts         guarda de origem local para /api
      types.ts            tipos das linhas do banco e enums
      i18n/strings.ts     mensagens do servidor
      db/index.ts         openDb, pragma, transaction, migrate
      db/schema.ts        SCHEMA_V1
      settings/repo.ts    SettingsRepo (cota, destino padrão)
      auth/pkce.ts        createPkce, randomState
      auth/client-config.ts  validateClientId, maskClientId, OauthClientRepo
      auth/oauth.ts       buildAuthUrl, exchangeCode, refreshAccessToken, revokeToken, startLoopback, OAuthError
      auth/accounts.ts    AccountsRepo, AccountsService (TokenProvider)
      auth/login-flow.ts  LoginFlow (start/status), orquestra loopback + troca + about
      drive/errors.ts     DriveError, NetworkError, classificadores
      drive/client.ts     DriveClient, DriveFile, FILE_FIELDS, mimes
      drive/links.ts      parseDriveId
      drive/tree.ts       listTree
      drive/inspect.ts    inspect (detecção de caminho, totais, bloqueados, conflito, cota)
      drive/inspections.ts InspectionCache (resultado + árvore, TTL 15 min)
      drive/quota.ts      dayKey, nextResetAt, QuotaService
      drive/outcomes.ts   FileOutcome, PauseReason, JobPaused, classifyFailure
      drive/copier.ts     runRift (ensureFolders + pool de files.copy; modo merge)
      drive/transfer.ts   runMachine / transferOneFile (download Range → upload retomável)
      drive/resync.ts     diffTrees, checkCopy, syncCopy
      jobs/repo.ts        JobsRepo (jobs, job_files, job_folders, copies)
      jobs/naming.ts      workingName, ensureDestFolder, finalizeName
      jobs/engine.ts      JobEngine (tick, lifecycle, pausas, boot)
      routes/health.ts · info.ts · auth.ts · accounts.ts · inspect.ts · jobs.ts · copies.ts · settings.ts · quota.ts
      test/fake-drive.ts  FakeDrive (API em memória + token endpoint)
      test/harness.ts     makeTestApp(): app + fake + deps para testes de rota
  web/
    package.json · tsconfig.json · vite.config.ts · tailwind.config.js · postcss.config.js · index.html
    public/favicon.svg · public/icon-192.png (opcional)
    src/
      main.tsx · App.tsx · index.css
      i18n/strings.ts
      api/client.ts · api/hooks.ts
      components/Brand.tsx · PathChip.tsx · QuotaLine.tsx · JobCard.tsx · FolderPicker.tsx · ShareRequest.tsx · Banner.tsx · Button.tsx · Field.tsx
      pages/Home.tsx · Setup.tsx · Job.tsx · Settings.tsx
      pages/home/AnalysisCard.tsx · pages/home/JobLists.tsx
  docs/superpowers/specs · docs/superpowers/plans · docs/brand
```

---

## Fase 0 — Esqueleto

### Task 1: Monorepo, ferramentas e teste de fumaça

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `LICENSE`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `scripts/gerar-bundled.mjs`, `server/src/smoke.test.ts`

**Interfaces:**
- Produces: workspace `server` com `npm test`; `scripts/gerar-bundled.mjs` gera `server/src/bundled.ts` (`APP_VERSION`, `WEB_ASSETS: Record<string, EmbeddedAsset>`, `EmbeddedAsset {type: string; base64: string}`).

- [ ] **Step 1: Raiz do monorepo**

`package.json`:
```json
{
  "name": "riftdrive",
  "version": "0.1.0",
  "type": "module",
  "description": "Copie pastas de um Google Drive para outro — pelo rift (dentro do Google) ou pela sua máquina.",
  "license": "MIT",
  "author": "OnaitsirC-MiromA",
  "repository": { "type": "git", "url": "git+https://github.com/OnaitsirC-MiromA/riftdrive.git" },
  "homepage": "https://github.com/OnaitsirC-MiromA/riftdrive#readme",
  "bugs": { "url": "https://github.com/OnaitsirC-MiromA/riftdrive/issues" },
  "keywords": ["google-drive", "copy", "backup", "drive-to-drive", "oauth", "local"],
  "engines": { "node": ">=22.5.0" },
  "bin": { "riftdrive": "dist/riftdrive.cjs" },
  "files": ["dist"],
  "workspaces": ["server", "web"],
  "scripts": {
    "predev": "node scripts/gerar-bundled.mjs",
    "dev": "concurrently -k -n server,web -c blue,green \"npm run dev --workspace=server\" \"npm run dev --workspace=web\"",
    "build": "npm run build --workspace=web && node scripts/gerar-bundled.mjs && npm run build --workspace=server && node scripts/empacotar.mjs",
    "start": "node dist/riftdrive.cjs",
    "build:binario": "node scripts/build-binario.mjs",
    "pretest": "node scripts/gerar-bundled.mjs",
    "test": "npm run test --workspace=server",
    "repo": "node scripts/definir-repo.mjs"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "esbuild": "^0.25.0",
    "postject": "^1.0.0-alpha.6",
    "typescript": "^5.6.3"
  }
}
```

`tsconfig.base.json`: copiar de `~/Documents/AI/learnflix-v2/tsconfig.base.json` sem alterações (ES2022, Bundler, strict, noUnusedLocals).

`.gitignore`:
```
node_modules/
dist/
build/
*.tsbuildinfo
*.db
*.db-journal
*.db-wal
*.db-shm
.env
.env.local
*.log
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
.claude/settings.local.json
.impeccable/
.playwright-mcp/
.superpowers/
# gerado por scripts/gerar-bundled.mjs
server/src/bundled.ts
```

`LICENSE`: MIT, `Copyright (c) 2026 OnaitsirC-MiromA`.

- [ ] **Step 2: Workspace server**

`server/package.json`:
```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "fastify": "^5.1.0", "tsx": "^4.19.2" },
  "devDependencies": { "@types/node": "^22.9.0", "typescript": "^5.6.3", "vitest": "^3.2.0" }
}
```
`server/tsconfig.json` e `server/vitest.config.ts`: copiar do Learnflix (`extends ../tsconfig.base.json`, `types: ["node"]`, `noEmit`; vitest `environment: 'node'`, `include: ['src/**/*.test.ts']`).

- [ ] **Step 3: gerar-bundled.mjs**

Copiar `~/Documents/AI/learnflix-v2/scripts/gerar-bundled.mjs` e trocar: nome da interface exportada `AssetEmbutido` → `EmbeddedAsset` com campos `type`/`base64`; manter `APP_VERSION` e `WEB_ASSETS`. A linha de cada entrada vira `{ type: ..., base64: ... }`.

- [ ] **Step 4: Teste de fumaça**

`server/src/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
describe('fumaça', () => {
  it('a suíte roda', () => expect(1 + 1).toBe(2));
});
```

- [ ] **Step 5: Instalar e rodar**

Run: `cd ~/Documents/AI/riftdrive && npm install && npm test`
Expected: `bundled.ts: sem web/dist …` e `1 passed`.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "chore: esqueleto do monorepo (server) com vitest e bundled.ts gerado"
```

---

### Task 2: Casca do servidor (config, escuta, navegador, banner, SPA, app, index)

**Files:**
- Create: `server/src/quiet.ts`, `server/src/config.ts`, `server/src/listen.ts`, `server/src/open-browser.ts`, `server/src/banner.ts`, `server/src/spa.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/src/routes/health.ts`, `server/src/routes/info.ts`
- Test: `server/src/config.test.ts`, `server/src/listen.test.ts`, `server/src/open-browser.test.ts`, `server/src/banner.test.ts`, `server/src/app.test.ts`

**Interfaces:**
- Produces: `AppConfig {port, bind, dataDir, dbPath, openBrowser, quiet}`; `loadConfig(env)`, `defaultDataDir(env, platform)`; `listenWithFallback(app, port, host, tries=10): Promise<{port, changed}>`; `openCommand(platform, url)`, `openBrowser(url)`; `bootMessage(state): string[]`; `registerSpa(app, assets)`; `buildApp(config, db, deps): FastifyInstance` (nesta task `deps` ainda é `{}` opcional — a assinatura final chega na Task 7).

- [ ] **Step 1: Testes de config**

`server/src/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { defaultDataDir, loadConfig } from './config';

describe('config', () => {
  it('pasta de dados por SO', () => {
    expect(defaultDataDir({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'win32')).toBe(
      path.join('C:\\Users\\x\\AppData\\Roaming', 'RiftDrive'),
    );
    expect(defaultDataDir({}, 'darwin')).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'RiftDrive'));
    expect(defaultDataDir({ XDG_DATA_HOME: '/tmp/xdg' }, 'linux')).toBe(path.join('/tmp/xdg', 'riftdrive'));
    expect(defaultDataDir({}, 'linux')).toBe(path.join(os.homedir(), '.local', 'share', 'riftdrive'));
  });
  it('RIFTDRIVE_DATA_DIR e porta', () => {
    const c = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/rd', PORT: '8123' });
    expect(c.dataDir).toBe(path.resolve('/tmp/rd'));
    expect(c.dbPath).toBe(path.join(path.resolve('/tmp/rd'), 'riftdrive.db'));
    expect(c.port).toBe(8123);
    expect(c.bind).toBe('127.0.0.1');
    expect(c.openBrowser).toBe(true);
  });
  it('OPEN_BROWSER=0 desliga', () => {
    expect(loadConfig({ OPEN_BROWSER: '0' }).openBrowser).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — falha** (`npx vitest run src/config.test.ts` em `server/`): módulo não existe.

- [ ] **Step 3: Implementar config**

`server/src/config.ts`:
```ts
import path from 'node:path';
import os from 'node:os';

export interface AppConfig {
  port: number;
  bind: string;
  dataDir: string;
  dbPath: string;
  openBrowser: boolean;
}

// Fora da pasta do programa, sempre: o executável é substituído inteiro a cada
// atualização, e os dados (tokens, jobs, cota) precisam sobreviver a isso.
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === 'win32' && env.APPDATA) return path.join(env.APPDATA, 'RiftDrive');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'RiftDrive');
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, 'riftdrive');
  return path.join(os.homedir(), '.local', 'share', 'riftdrive');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.RIFTDRIVE_DATA_DIR ?? defaultDataDir(env));
  return {
    port: Number(env.PORT ?? 7799),
    bind: env.BIND ?? '127.0.0.1',
    dataDir,
    dbPath: path.join(dataDir, 'riftdrive.db'),
    openBrowser: env.OPEN_BROWSER === undefined ? true : env.OPEN_BROWSER === '1' || env.OPEN_BROWSER === 'true',
  };
}
```

- [ ] **Step 4: quiet.ts, listen.ts, open-browser.ts, banner.ts, spa.ts** — portar do Learnflix com nomes em inglês:

`quiet.ts`: copiar `~/Documents/AI/learnflix-v2/server/src/quiet.ts` sem mudanças (filtra "SQLite is an experimental feature").

`listen.ts`:
```ts
interface Listenable { listen(opts: { port: number; host: string }): Promise<unknown>; }
export interface ListenResult { port: number; changed: boolean; }

// Porta ocupada é banal (outro RiftDrive aberto); anda para a seguinte em vez
// de morrer com stack trace. Qualquer outro erro sobe na hora.
export async function listenWithFallback(app: Listenable, firstPort: number, host: string, tries = 10): Promise<ListenResult> {
  for (let i = 0; i < tries; i++) {
    const port = firstPort + i;
    try {
      await app.listen({ port, host });
      return { port, changed: i > 0 };
    } catch (err) {
      if ((err as { code?: string }).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`Nenhuma porta livre entre ${firstPort} e ${firstPort + tries - 1}. Feche o que estiver usando essas portas, ou escolha outra com PORT=8080.`);
}
```

`open-browser.ts`: copiar `abrir-navegador.ts` renomeando `comandoParaAbrir`→`openCommand`, `abrirNavegador`→`openBrowser`, `ComandoDeAbertura`→`OpenCommand {command, args}`.

`banner.ts`:
```ts
export interface BootState { version: string; dataDir: string; url: string; changedPort: boolean; requestedPort: number; openingBrowser: boolean; configured: boolean; }
export function bootMessage(s: BootState): string[] {
  const lines = [`RiftDrive ${s.version}`, `  dados em ${s.dataDir}`];
  if (!s.configured) lines.push('', '  primeira vez: o navegador vai abrir no assistente de configuração do Google');
  if (s.changedPort) lines.push('', `  a porta ${s.requestedPort} estava ocupada, então o app subiu na seguinte`);
  lines.push('', `  ${s.url}${s.openingBrowser ? '  (abrindo o navegador…)' : ''}`);
  return lines;
}
```

`spa.ts`: copiar `spa.ts` do Learnflix renomeando `registrarSpa`→`registerSpa`, `AssetEmbutido`→`EmbeddedAsset` (campo `tipo`→`type`).

- [ ] **Step 5: Testes de listen, open-browser, banner**

`listen.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { listenWithFallback } from './listen';
const busy = (n: number) => { let calls = 0; return { listen: async () => { calls++; if (calls <= n) throw Object.assign(new Error('x'), { code: 'EADDRINUSE' }); }, get calls() { return calls; } }; };
describe('listenWithFallback', () => {
  it('usa a primeira porta livre', async () => { const app = busy(0); expect(await listenWithFallback(app, 7799, '127.0.0.1')).toEqual({ port: 7799, changed: false }); });
  it('anda para a seguinte quando ocupada', async () => { const app = busy(2); expect(await listenWithFallback(app, 7799, '127.0.0.1')).toEqual({ port: 7801, changed: true }); });
  it('outro erro sobe na hora', async () => { const app = { listen: async () => { throw Object.assign(new Error('perm'), { code: 'EACCES' }); } }; await expect(listenWithFallback(app, 80, '127.0.0.1')).rejects.toThrow('perm'); });
  it('desiste depois das tentativas', async () => { await expect(listenWithFallback(busy(99), 7799, '127.0.0.1', 3)).rejects.toThrow(/Nenhuma porta livre entre 7799 e 7801/); });
});
```
`open-browser.test.ts`: `openCommand('darwin', u)` → `{command:'open', args:[u]}`; `win32` → `{command:'cmd', args:['/c','start','',u]}`; `linux` → `xdg-open`; `freebsd` → `null`.
`banner.test.ts`: `bootMessage({...configured:false})` contém `'primeira vez'`; com `changedPort` contém `'estava ocupada'`.

- [ ] **Step 6: app.ts, rotas health/info, index.ts**

`routes/health.ts`: `app.get('/api/health', async () => ({ ok: true }))`.
`routes/info.ts` (versão provisória; a Task 7 adiciona `configured`):
```ts
import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '../bundled';
export async function infoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/info', async () => ({ version: APP_VERSION, platform: process.platform }));
}
```
`app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config';
import type { Db } from './db';
import { registerSpa } from './spa';
import { WEB_ASSETS } from './bundled';
import { healthRoutes } from './routes/health';
import { infoRoutes } from './routes/info';

export function buildApp(config: AppConfig, db: Db): FastifyInstance {
  const app = Fastify({ logger: false });
  // Corpo vazio em application/json vira undefined, não erro (POST sem corpo é comum aqui).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = (body as string).trim();
    if (raw === '') return done(null, undefined);
    try { done(null, JSON.parse(raw)); } catch (err) { (err as { statusCode?: number }).statusCode = 400; done(err as Error, undefined); }
  });
  app.register(healthRoutes);
  app.register(infoRoutes);
  // [ROUTES]
  registerSpa(app, WEB_ASSETS);
  void config; void db;
  return app;
}
```
`index.ts`: portar do Learnflix: `import './quiet'` primeiro; `loadConfig`; `fs.mkdirSync(dataDir, {recursive:true, mode:0o700})`; `openDb(config.dbPath)` (Task 3); `buildApp`; `listenWithFallback`; `bootMessage`; `openBrowser` se `config.openBrowser && WEB_ASSETS['/index.html']`; `SIGINT/SIGTERM` → `app.close()`. Tudo dentro de `async function main()` chamada com `void main()`.

`app.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { openDb } from './db';
import { loadConfig } from './config';
describe('app', () => {
  it('health responde', async () => {
    const app = buildApp(loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/rd-test' }), openDb(':memory:'));
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
```
(Este teste passa a compilar após a Task 3; ordem de execução: escreva-o aqui, rode após a Task 3.)

- [ ] **Step 7: Rodar os testes da casca** — `npx vitest run src/config.test.ts src/listen.test.ts src/open-browser.test.ts src/banner.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit** — `git commit -m "feat: casca do servidor — config por SO, escuta com fallback, banner, SPA embutida"`

---

### Task 3: Banco (node:sqlite), schema v1 e repositório de configurações

**Files:**
- Create: `server/src/db/index.ts`, `server/src/db/schema.ts`, `server/src/types.ts`, `server/src/settings/repo.ts`
- Test: `server/src/db/index.test.ts`, `server/src/settings/repo.test.ts`

**Interfaces:**
- Produces: `openDb(path): Db`, `pragma(db, expr)`, `transaction(db, fn)`, `migrate(db)`; tipos em `types.ts`; `SettingsRepo { get(key): string|null; set(key, value): void; quota(): QuotaSettings; setQuota(p: Partial<QuotaSettings>): void; defaultDest(): DefaultDest|null; setDefaultDest(d: DefaultDest|null): void }`, `QuotaSettings {mode:'limit'|'unlimited'; limitBytes:number; resetHour:number}`, `DefaultDest {accountId, folderId, folderName}`.

- [ ] **Step 1: Teste do banco**

`server/src/db/index.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openDb, pragma, transaction } from './index';
describe('db', () => {
  it('abre com WAL-compatível, FK e migra para v1', () => {
    const db = openDb(':memory:');
    expect(pragma(db, 'user_version')).toBe(1);
    expect(pragma(db, 'foreign_keys')).toBe(1);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => (r as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['settings', 'oauth_client', 'accounts', 'jobs', 'job_files', 'job_folders', 'copies', 'quota_usage']));
  });
  it('transaction desfaz em erro e aninha', () => {
    const db = openDb(':memory:');
    expect(() => transaction(db, () => { db.prepare("INSERT INTO settings(key,value) VALUES('a','1')").run(); throw new Error('boom'); })).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
    transaction(db, () => { db.prepare("INSERT INTO settings(key,value) VALUES('a','1')").run(); transaction(db, () => { db.prepare("INSERT INTO settings(key,value) VALUES('b','2')").run(); }); });
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 2 });
  });
  it('job_files cai em cascata com o job', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO jobs(id,name,src_folder_id,src_reader_account_id,dest_account_id,dest_parent_id,dest_parent_name,dest_final_name,path,mode,status,created_at) VALUES('j1','n','s','a','a','p','P','n','rift','copy','queued','2026-01-01T00:00:00Z')`).run();
    db.prepare(`INSERT INTO job_files(job_id,rel_path,src_id,name,mime_type,size,status) VALUES('j1','a.mp4','f1','a.mp4','video/mp4',10,'pending')`).run();
    db.prepare("DELETE FROM jobs WHERE id='j1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_files').get()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 2: Rodar — falha.**

- [ ] **Step 3: Implementar**

`db/index.ts`: copiar `~/Documents/AI/learnflix-v2/server/src/db/index.ts` (require de `node:sqlite`, `pragma`, `transaction` com SAVEPOINT `riftdrive_sp_N`, `migrate`, `openDb`). Em `openDb`, `journal_mode = WAL` só quando `dbPath !== ':memory:'` (em memória o pragma é inócuo, mas evita ruído).

`db/schema.ts`:
```ts
export const SCHEMA_V1 = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE oauth_client (id INTEGER PRIMARY KEY CHECK (id = 1), client_id TEXT NOT NULL, client_secret TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, refresh_token TEXT NOT NULL,
  access_token TEXT, access_expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','disconnected')),
  is_default_dest INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_checked_at TEXT, failed_since TEXT
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  src_folder_id TEXT NOT NULL, src_reader_account_id TEXT NOT NULL,
  dest_account_id TEXT NOT NULL, dest_parent_id TEXT NOT NULL, dest_parent_name TEXT NOT NULL,
  dest_folder_id TEXT, dest_final_name TEXT NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('rift','machine')),
  mode TEXT NOT NULL DEFAULT 'copy' CHECK (mode IN ('copy','merge')),
  status TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0, total_bytes INTEGER NOT NULL DEFAULT 0,
  done_files INTEGER NOT NULL DEFAULT 0, done_bytes INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0, deferred_files INTEGER NOT NULL DEFAULT 0,
  message TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  paused_until INTEGER, resume_reason TEXT, file_filter_json TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);
CREATE TABLE job_files (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL, src_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0, md5 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped_blocked','skipped_native','deferred','missing','failed')),
  dest_id TEXT, upload_uri TEXT, bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, deferred_until INTEGER,
  PRIMARY KEY (job_id, rel_path)
);
CREATE INDEX idx_job_files_status ON job_files(job_id, status);
CREATE TABLE job_folders (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL, dest_id TEXT NOT NULL, PRIMARY KEY (job_id, rel_path)
);
CREATE TABLE copies (
  id TEXT PRIMARY KEY, src_folder_id TEXT NOT NULL, src_reader_account_id TEXT NOT NULL,
  dest_folder_id TEXT NOT NULL, dest_account_id TEXT NOT NULL, name TEXT NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('rift','machine')),
  created_at TEXT NOT NULL, last_checked_at TEXT, last_synced_at TEXT,
  UNIQUE (src_folder_id, dest_folder_id)
);
CREATE TABLE quota_usage (account_id TEXT NOT NULL, day_key TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account_id, day_key));
`;
```

`types.ts`:
```ts
export type JobPath = 'rift' | 'machine';
export type JobMode = 'copy' | 'merge';
export type JobStatus = 'queued' | 'running' | 'paused' | 'paused_quota' | 'paused_auth' | 'paused_storage' | 'paused_offline' | 'done' | 'canceled' | 'failed';
export type FileStatus = 'pending' | 'done' | 'skipped_blocked' | 'skipped_native' | 'deferred' | 'missing' | 'failed';
export type AccountStatus = 'ok' | 'disconnected';
export interface AccountRow { id: string; email: string; refresh_token: string; access_token: string | null; access_expires_at: number | null; status: AccountStatus; is_default_dest: number; created_at: string; last_checked_at: string | null; failed_since: string | null; }
export interface JobRow { id: string; name: string; src_folder_id: string; src_reader_account_id: string; dest_account_id: string; dest_parent_id: string; dest_parent_name: string; dest_folder_id: string | null; dest_final_name: string; path: JobPath; mode: JobMode; status: JobStatus; total_files: number; total_bytes: number; done_files: number; done_bytes: number; skipped_files: number; deferred_files: number; message: string | null; created_at: string; started_at: string | null; finished_at: string | null; paused_until: number | null; resume_reason: string | null; file_filter_json: string | null; }
export interface JobFileRow { job_id: string; rel_path: string; src_id: string; name: string; mime_type: string; size: number; md5: string | null; status: FileStatus; dest_id: string | null; upload_uri: string | null; bytes_uploaded: number; attempts: number; last_error: string | null; deferred_until: number | null; }
export interface JobFolderRow { job_id: string; rel_path: string; dest_id: string; }
export interface CopyRow { id: string; src_folder_id: string; src_reader_account_id: string; dest_folder_id: string; dest_account_id: string; name: string; path: JobPath; created_at: string; last_checked_at: string | null; last_synced_at: string | null; }
```

`settings/repo.ts`:
```ts
import type { Db } from '../db';
export interface QuotaSettings { mode: 'limit' | 'unlimited'; limitBytes: number; resetHour: number; }
export interface DefaultDest { accountId: string; folderId: string; folderName: string; }
export const DEFAULT_QUOTA: QuotaSettings = { mode: 'limit', limitBytes: 600 * 1024 ** 3, resetHour: 4 };

export class SettingsRepo {
  constructor(private db: Db) {}
  get(key: string): string | null { const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined; return r?.value ?? null; }
  set(key: string, value: string): void { this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value); }
  quota(): QuotaSettings {
    const mode = (this.get('quota_mode') as QuotaSettings['mode'] | null) ?? DEFAULT_QUOTA.mode;
    const limitBytes = Number(this.get('quota_limit_bytes') ?? DEFAULT_QUOTA.limitBytes);
    const resetHour = Number(this.get('quota_reset_hour') ?? DEFAULT_QUOTA.resetHour);
    return { mode, limitBytes, resetHour };
  }
  setQuota(p: Partial<QuotaSettings>): void {
    if (p.mode) this.set('quota_mode', p.mode);
    if (p.limitBytes !== undefined) this.set('quota_limit_bytes', String(Math.max(1, Math.floor(p.limitBytes))));
    if (p.resetHour !== undefined) this.set('quota_reset_hour', String(Math.min(23, Math.max(0, Math.floor(p.resetHour)))));
  }
  defaultDest(): DefaultDest | null {
    const accountId = this.get('default_dest_account_id'); const folderId = this.get('default_dest_folder_id'); const folderName = this.get('default_dest_folder_name');
    return accountId && folderId && folderName ? { accountId, folderId, folderName } : null;
  }
  setDefaultDest(d: DefaultDest | null): void {
    if (!d) { this.db.prepare("DELETE FROM settings WHERE key IN ('default_dest_account_id','default_dest_folder_id','default_dest_folder_name')").run(); return; }
    this.set('default_dest_account_id', d.accountId); this.set('default_dest_folder_id', d.folderId); this.set('default_dest_folder_name', d.folderName);
  }
}
```

`settings/repo.test.ts`: padrão da cota (`limit`, 600 GiB, hora 4); `setQuota({mode:'unlimited', resetHour: 30})` → `resetHour` 23; `defaultDest()` null → set → objeto → `setDefaultDest(null)` → null.

- [ ] **Step 4: Rodar** `npx vitest run src/db src/settings src/app.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): schema v1 (contas, jobs, inventário, cópias, cota) e repositório de configurações"`

---

## Fase 1 — Autenticação

### Task 4: PKCE e configuração do OAuth client

**Files:**
- Create: `server/src/auth/pkce.ts`, `server/src/auth/client-config.ts`
- Test: `server/src/auth/pkce.test.ts`, `server/src/auth/client-config.test.ts`

**Interfaces:**
- Produces: `createPkce(): {verifier: string; challenge: string}`, `randomState(): string`; `validateClientId(id): boolean`, `maskClientId(id): string`, `OauthClientRepo { get(): {clientId, clientSecret} | null; set(clientId, clientSecret): void }`.

- [ ] **Step 1: Testes**

`pkce.test.ts`:
```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPkce, randomState } from './pkce';
describe('pkce', () => {
  it('challenge é SHA-256 base64url do verifier', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
  it('state é aleatório e url-safe', () => { expect(randomState()).toMatch(/^[A-Za-z0-9_-]{20,}$/); expect(randomState()).not.toBe(randomState()); });
});
```
`client-config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo, maskClientId, validateClientId } from './client-config';
describe('client-config', () => {
  it('valida o formato do client id', () => {
    expect(validateClientId('1234567890-abc123def.apps.googleusercontent.com')).toBe(true);
    expect(validateClientId('abc')).toBe(false);
    expect(validateClientId('')).toBe(false);
  });
  it('mascara deixando só o fim', () => expect(maskClientId('1234567890-abc123def.apps.googleusercontent.com')).toBe('…123def.apps.googleusercontent.com'));
  it('grava e lê, uma linha só', () => {
    const repo = new OauthClientRepo(openDb(':memory:'));
    expect(repo.get()).toBeNull();
    repo.set('1-a.apps.googleusercontent.com', 'GOCSPX-x');
    repo.set('2-b.apps.googleusercontent.com', 'GOCSPX-y');
    expect(repo.get()).toEqual({ clientId: '2-b.apps.googleusercontent.com', clientSecret: 'GOCSPX-y' });
  });
});
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

`pkce.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url'); // 64 chars, dentro de 43–128
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
export function randomState(): string { return randomBytes(24).toString('base64url'); }
```
`client-config.ts`:
```ts
import type { Db } from '../db';
export function validateClientId(id: string): boolean { return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim()); }
export function maskClientId(id: string): string { const tail = id.slice(-34); return `…${tail}`; }
export class OauthClientRepo {
  constructor(private db: Db) {}
  get(): { clientId: string; clientSecret: string } | null {
    const r = this.db.prepare('SELECT client_id, client_secret FROM oauth_client WHERE id = 1').get() as { client_id: string; client_secret: string } | undefined;
    return r ? { clientId: r.client_id, clientSecret: r.client_secret } : null;
  }
  set(clientId: string, clientSecret: string): void {
    this.db.prepare(`INSERT INTO oauth_client(id, client_id, client_secret, created_at) VALUES(1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_secret = excluded.client_secret, created_at = excluded.created_at`).run(clientId.trim(), clientSecret.trim(), new Date().toISOString());
  }
}
```
- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(auth): PKCE e configuração do OAuth client do usuário"`

---

### Task 5: Fluxo OAuth — URL, loopback, troca, refresh, revoke

**Files:**
- Create: `server/src/auth/oauth.ts`
- Test: `server/src/auth/oauth.test.ts`

**Interfaces:**
- Produces:
```ts
export const SCOPE = 'https://www.googleapis.com/auth/drive';
export interface OAuthClient { clientId: string; clientSecret: string }
export interface TokenSet { accessToken: string; refreshToken: string; expiresInSec: number }
export class OAuthError extends Error { constructor(public code: 'invalid_grant'|'access_denied'|'state_mismatch'|'no_refresh_token'|'timeout'|'http'|'invalid_client', message: string) }
export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; loginHint?: string }): string
export function exchangeCode(p: { code: string; verifier: string; redirectUri: string; client: OAuthClient }, fetchFn?: typeof fetch): Promise<TokenSet>
export function refreshAccessToken(p: { refreshToken: string; client: OAuthClient }, fetchFn?: typeof fetch): Promise<{ accessToken: string; expiresInSec: number }>
export function revokeToken(token: string, fetchFn?: typeof fetch): Promise<void>
export interface Loopback { port: number; redirectUri: string; waitForCode(expectedState: string): Promise<string>; close(): void }
export function startLoopback(opts?: { timeoutMs?: number }): Promise<Loopback>
```

- [ ] **Step 1: Testes**

`oauth.test.ts`:
```ts
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { OAuthError, buildAuthUrl, exchangeCode, refreshAccessToken, startLoopback } from './oauth';

const client = { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' };
const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('buildAuthUrl', () => {
  it('monta a URL de consentimento com PKCE e refresh token garantido', () => {
    const u = new URL(buildAuthUrl({ clientId: client.clientId, redirectUri: 'http://127.0.0.1:5000/', challenge: 'CH', state: 'ST', loginHint: 'a@b.c' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe(client.clientId);
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive');
    expect(u.searchParams.get('code_challenge')).toBe('CH');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('ST');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('login_hint')).toBe('a@b.c');
  });
});

describe('exchangeCode', () => {
  it('devolve o conjunto de tokens', async () => {
    let sent = '';
    const f = (async (_u: string, init: RequestInit) => { sent = String(init.body); return new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3599 })); }) as unknown as typeof fetch;
    const t = await exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'http://127.0.0.1:1/', client }, f);
    expect(t).toEqual({ accessToken: 'A', refreshToken: 'R', expiresInSec: 3599 });
    const p = new URLSearchParams(sent);
    expect(p.get('grant_type')).toBe('authorization_code'); expect(p.get('code_verifier')).toBe('V'); expect(p.get('client_secret')).toBe('GOCSPX-x');
  });
  it('sem refresh_token é erro explícito', async () => {
    await expect(exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'x', client }, fakeFetch(200, { access_token: 'A', expires_in: 1 }))).rejects.toMatchObject({ code: 'no_refresh_token' });
  });
  it('invalid_grant vira OAuthError', async () => {
    await expect(exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'x', client }, fakeFetch(400, { error: 'invalid_grant' }))).rejects.toMatchObject({ code: 'invalid_grant' });
  });
});

describe('refreshAccessToken', () => {
  it('renova', async () => { expect(await refreshAccessToken({ refreshToken: 'R', client }, fakeFetch(200, { access_token: 'A2', expires_in: 100 }))).toEqual({ accessToken: 'A2', expiresInSec: 100 }); });
  it('invalid_grant → OAuthError', async () => { await expect(refreshAccessToken({ refreshToken: 'R', client }, fakeFetch(400, { error: 'invalid_grant' }))).rejects.toBeInstanceOf(OAuthError); });
});

describe('startLoopback', () => {
  const hit = (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get(url, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b })); }).on('error', reject);
  });
  it('recebe o código com o state certo e responde uma página', async () => {
    const lb = await startLoopback();
    expect(lb.redirectUri).toBe(`http://127.0.0.1:${lb.port}/`);
    const codeP = lb.waitForCode('ST');
    const res = await hit(`${lb.redirectUri}?code=ABC&state=ST`);
    expect(res.status).toBe(200); expect(res.body).toContain('RiftDrive');
    expect(await codeP).toBe('ABC');
    lb.close();
  });
  it('state errado é rejeitado e ignorado até o certo chegar', async () => {
    const lb = await startLoopback();
    const codeP = lb.waitForCode('ST');
    expect((await hit(`${lb.redirectUri}?code=X&state=WRONG`)).status).toBe(400);
    await hit(`${lb.redirectUri}?code=OK&state=ST`);
    expect(await codeP).toBe('OK'); lb.close();
  });
  it('access_denied vira erro', async () => {
    const lb = await startLoopback();
    const codeP = lb.waitForCode('ST');
    await hit(`${lb.redirectUri}?error=access_denied&state=ST`);
    await expect(codeP).rejects.toMatchObject({ code: 'access_denied' }); lb.close();
  });
  it('expira', async () => {
    const lb = await startLoopback({ timeoutMs: 30 });
    await expect(lb.waitForCode('ST')).rejects.toMatchObject({ code: 'timeout' }); lb.close();
  });
});
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar `oauth.ts`**

```ts
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { t } from '../i18n/strings';

export const SCOPE = 'https://www.googleapis.com/auth/drive';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export interface OAuthClient { clientId: string; clientSecret: string; }
export interface TokenSet { accessToken: string; refreshToken: string; expiresInSec: number; }
export type OAuthErrorCode = 'invalid_grant' | 'access_denied' | 'state_mismatch' | 'no_refresh_token' | 'timeout' | 'http' | 'invalid_client';
export class OAuthError extends Error { constructor(public code: OAuthErrorCode, message: string) { super(message); } }

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; loginHint?: string }): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', p.state);
  // offline + consent: só assim o Google devolve refresh_token toda vez (sem
  // o consent, a segunda autorização da mesma conta vem sem ele).
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  if (p.loginHint) u.searchParams.set('login_hint', p.loginHint);
  return u.toString();
}

async function tokenRequest(form: Record<string, string>, fetchFn: typeof fetch): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchFn(TOKEN_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  } catch (err) { throw new OAuthError('http', t.oauth.network(err instanceof Error ? err.message : String(err))); }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? '');
    if (code === 'invalid_grant') throw new OAuthError('invalid_grant', t.oauth.invalidGrant);
    if (code === 'invalid_client' || code === 'unauthorized_client') throw new OAuthError('invalid_client', t.oauth.invalidClient);
    throw new OAuthError('http', t.oauth.tokenHttp(res.status, String(json.error_description ?? code)));
  }
  return json;
}

export async function exchangeCode(p: { code: string; verifier: string; redirectUri: string; client: OAuthClient }, fetchFn: typeof fetch = fetch): Promise<TokenSet> {
  const json = await tokenRequest({ code: p.code, client_id: p.client.clientId, client_secret: p.client.clientSecret, redirect_uri: p.redirectUri, grant_type: 'authorization_code', code_verifier: p.verifier }, fetchFn);
  if (typeof json.refresh_token !== 'string') throw new OAuthError('no_refresh_token', t.oauth.noRefreshToken);
  return { accessToken: String(json.access_token), refreshToken: json.refresh_token, expiresInSec: Number(json.expires_in ?? 3600) };
}

export async function refreshAccessToken(p: { refreshToken: string; client: OAuthClient }, fetchFn: typeof fetch = fetch): Promise<{ accessToken: string; expiresInSec: number }> {
  const json = await tokenRequest({ refresh_token: p.refreshToken, client_id: p.client.clientId, client_secret: p.client.clientSecret, grant_type: 'refresh_token' }, fetchFn);
  return { accessToken: String(json.access_token), expiresInSec: Number(json.expires_in ?? 3600) };
}

export async function revokeToken(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try { await fetchFn(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' }); } catch { /* best-effort */ }
}

export interface Loopback { port: number; redirectUri: string; waitForCode(expectedState: string): Promise<string>; close(): void; }

const PAGE = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1020;color:#F5F3FF;font:16px/1.5 system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem"><div style="font-size:1.4rem;font-weight:600;margin-bottom:.5rem">${title}</div><div style="opacity:.7">${body}</div></div></body></html>`;

export function startLoopback(opts: { timeoutMs?: number } = {}): Promise<Loopback> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  return new Promise((resolve, reject) => {
    let pending: { state: string; resolve: (c: string) => void; reject: (e: Error) => void } | null = null;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (!pending || state !== pending.state) { res.statusCode = 400; res.end(PAGE(t.oauth.pageBadStateTitle, t.oauth.pageBadStateBody)); return; }
      if (error) { res.statusCode = 200; res.end(PAGE(t.oauth.pageDeniedTitle, t.oauth.pageDeniedBody)); const p = pending; pending = null; p.reject(new OAuthError('access_denied', t.oauth.accessDenied)); return; }
      if (!code) { res.statusCode = 400; res.end(PAGE(t.oauth.pageBadStateTitle, t.oauth.pageBadStateBody)); return; }
      res.statusCode = 200; res.end(PAGE(t.oauth.pageOkTitle, t.oauth.pageOkBody));
      const p = pending; pending = null; p.resolve(code);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const timer = setTimeout(() => { if (pending) { const p = pending; pending = null; p.reject(new OAuthError('timeout', t.oauth.timeout)); } }, timeoutMs);
      timer.unref();
      resolve({
        port,
        redirectUri: `http://127.0.0.1:${port}/`,
        waitForCode: (expectedState) => new Promise<string>((res, rej) => { pending = { state: expectedState, resolve: res, reject: rej }; }),
        close: () => { clearTimeout(timer); server.close(); },
      });
    });
  });
}
```

`i18n/strings.ts` (criar agora com a seção `oauth`; as demais seções são acrescentadas pelas tasks seguintes):
```ts
export const t = {
  oauth: {
    network: (m: string) => `Não consegui falar com o Google: ${m}`,
    invalidGrant: 'O Google recusou a autorização (invalid_grant): o acesso expirou ou foi revogado. Reconecte a conta.',
    invalidClient: 'O Google não reconheceu o ID ou o segredo do cliente. Confira o que foi colado na configuração.',
    tokenHttp: (s: number, d: string) => `O Google respondeu ${s} ao pedir o token: ${d}`,
    noRefreshToken: 'O Google não devolveu um refresh token. Remova o acesso do RiftDrive em myaccount.google.com/permissions e tente de novo.',
    accessDenied: 'Você cancelou a autorização no Google.',
    timeout: 'A autorização não chegou em 10 minutos. Tente de novo.',
    pageOkTitle: 'Conectado ao RiftDrive',
    pageOkBody: 'Pode fechar esta aba e voltar ao app.',
    pageDeniedTitle: 'Autorização cancelada',
    pageDeniedBody: 'Nada foi conectado. Volte ao RiftDrive para tentar de novo.',
    pageBadStateTitle: 'Pedido não reconhecido',
    pageBadStateBody: 'Este retorno não corresponde a uma autorização iniciada pelo RiftDrive. Volte ao app e comece de novo.',
  },
};
```

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(auth): fluxo OAuth com PKCE, loopback local, troca e refresh de tokens"`

---

### Task 6: Contas — repositório, provedor de tokens e fluxo de login

**Files:**
- Create: `server/src/auth/accounts.ts`, `server/src/auth/login-flow.ts`
- Test: `server/src/auth/accounts.test.ts`, `server/src/auth/login-flow.test.ts`

**Interfaces:**
- Produces:
```ts
export interface TokenProvider { getAccessToken(accountId: string): Promise<string>; invalidate(accountId: string): void; }
export class AccountsRepo { list(): AccountRow[]; get(id): AccountRow|null; byEmail(email): AccountRow|null; insert(a: {email, refreshToken, accessToken, expiresAt}): AccountRow; updateTokens(id, accessToken, expiresAt); setRefreshToken(id, refreshToken); setStatus(id, status: AccountStatus, failedSince?: string|null); setDefault(id); remove(id); defaultDest(): AccountRow|null }
export class AccountsService implements TokenProvider { constructor(repo, oauthClient: OauthClientRepo, fetchFn, now?); getAccessToken(id); invalidate(id); markDisconnected(id); testConnection(id): Promise<{ok: boolean; email?: string; error?: string}> }
export type LoginStatus = { state: 'idle' } | { state: 'pending'; authUrl: string } | { state: 'done'; email: string } | { state: 'error'; message: string };
export class LoginFlow { constructor(deps: { repo: AccountsRepo; oauthClient: OauthClientRepo; fetchFn; openBrowser: (url) => void; startLoopback?: typeof startLoopback; aboutEmail: (accessToken: string) => Promise<string> }); start(loginHint?: string): Promise<{ authUrl: string }>; status(): LoginStatus; }
```

- [ ] **Step 1: Testes**

`accounts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo } from './client-config';
import { AccountsRepo, AccountsService } from './accounts';

const setup = () => { const db = openDb(':memory:'); const oc = new OauthClientRepo(db); oc.set('1-a.apps.googleusercontent.com', 's'); return { db, repo: new AccountsRepo(db), oc }; };

describe('AccountsRepo', () => {
  it('a primeira conta vira destino padrão; setDefault troca', () => {
    const { repo } = setup();
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: 1 });
    const b = repo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: 1 });
    expect(repo.defaultDest()?.id).toBe(a.id);
    repo.setDefault(b.id);
    expect(repo.defaultDest()?.id).toBe(b.id);
    expect(repo.get(a.id)?.is_default_dest).toBe(0);
  });
  it('remover a padrão passa o padrão para a próxima', () => {
    const { repo } = setup();
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: 1 });
    const b = repo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: 1 });
    repo.remove(a.id);
    expect(repo.defaultDest()?.id).toBe(b.id);
  });
});

describe('AccountsService', () => {
  it('usa o access token em cache enquanto válido e renova quando expira', async () => {
    const { repo, oc } = setup();
    let now = 1_000_000;
    let refreshes = 0;
    const f = (async () => { refreshes++; return new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600 })); }) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'OLD', expiresAt: now + 120_000 });
    const svc = new AccountsService(repo, oc, f, () => now);
    expect(await svc.getAccessToken(a.id)).toBe('OLD');
    now += 100_000; // dentro da margem de 60 s → renova
    expect(await svc.getAccessToken(a.id)).toBe('NEW');
    expect(refreshes).toBe(1);
    expect(repo.get(a.id)?.access_token).toBe('NEW');
  });
  it('invalid_grant marca a conta como desconectada', async () => {
    const { repo, oc } = setup();
    const f = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: null, expiresAt: null });
    const svc = new AccountsService(repo, oc, f, () => 0);
    await expect(svc.getAccessToken(a.id)).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(repo.get(a.id)?.status).toBe('disconnected');
    expect(repo.get(a.id)?.failed_since).toBeTruthy();
  });
});
```

`login-flow.test.ts`:
```ts
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { OauthClientRepo } from './client-config';
import { AccountsRepo } from './accounts';
import { LoginFlow } from './login-flow';

const hit = (url: string) => new Promise<void>((resolve) => http.get(url, (res) => res.resume().on('end', resolve)));

describe('LoginFlow', () => {
  it('start → abre navegador → retorno no loopback → conta gravada', async () => {
    const db = openDb(':memory:'); const oc = new OauthClientRepo(db); oc.set('1-a.apps.googleusercontent.com', 's');
    const repo = new AccountsRepo(db);
    let opened = '';
    const f = (async () => new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }))) as unknown as typeof fetch;
    const flow = new LoginFlow({ repo, oauthClient: oc, fetchFn: f, openBrowser: (u) => { opened = u; }, aboutEmail: async () => 'novo@x.com' });
    const { authUrl } = await flow.start();
    expect(opened).toBe(authUrl);
    const u = new URL(authUrl);
    const redirect = u.searchParams.get('redirect_uri')!; const state = u.searchParams.get('state')!;
    expect(flow.status()).toMatchObject({ state: 'pending' });
    await hit(`${redirect}?code=C&state=${state}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(flow.status()).toEqual({ state: 'done', email: 'novo@x.com' });
    expect(repo.byEmail('novo@x.com')?.refresh_token).toBe('R');
    expect(repo.defaultDest()?.email).toBe('novo@x.com');
  });
  it('sem client configurado, start falha', async () => {
    const db = openDb(':memory:');
    const flow = new LoginFlow({ repo: new AccountsRepo(db), oauthClient: new OauthClientRepo(db), fetchFn: fetch, openBrowser: () => {}, aboutEmail: async () => '' });
    await expect(flow.start()).rejects.toThrow(/client/i);
  });
  it('reconectar a mesma conta atualiza o refresh token e volta a ok', async () => {
    const db = openDb(':memory:'); const oc = new OauthClientRepo(db); oc.set('1-a.apps.googleusercontent.com', 's');
    const repo = new AccountsRepo(db);
    const a = repo.insert({ email: 'a@x.com', refreshToken: 'OLD', accessToken: null, expiresAt: null });
    repo.setStatus(a.id, 'disconnected', new Date().toISOString());
    const f = (async () => new Response(JSON.stringify({ access_token: 'A', refresh_token: 'NEW', expires_in: 3600 }))) as unknown as typeof fetch;
    const flow = new LoginFlow({ repo, oauthClient: oc, fetchFn: f, openBrowser: () => {}, aboutEmail: async () => 'a@x.com' });
    const { authUrl } = await flow.start('a@x.com');
    const u = new URL(authUrl);
    await hit(`${u.searchParams.get('redirect_uri')}?code=C&state=${u.searchParams.get('state')}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(repo.get(a.id)).toMatchObject({ refresh_token: 'NEW', status: 'ok', failed_since: null });
    expect(repo.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

`accounts.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { AccountRow, AccountStatus } from '../types';
import type { OauthClientRepo } from './client-config';
import { OAuthError, refreshAccessToken } from './oauth';
import { t } from '../i18n/strings';

export interface TokenProvider { getAccessToken(accountId: string): Promise<string>; invalidate(accountId: string): void; }

export class AccountsRepo {
  constructor(private db: Db) {}
  list(): AccountRow[] { return this.db.prepare('SELECT * FROM accounts ORDER BY created_at').all() as AccountRow[]; }
  get(id: string): AccountRow | null { return (this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined) ?? null; }
  byEmail(email: string): AccountRow | null { return (this.db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.toLowerCase()) as AccountRow | undefined) ?? null; }
  insert(a: { email: string; refreshToken: string; accessToken: string | null; expiresAt: number | null }): AccountRow {
    const id = randomUUID();
    const isFirst = this.list().length === 0 ? 1 : 0;
    this.db.prepare(`INSERT INTO accounts(id,email,refresh_token,access_token,access_expires_at,status,is_default_dest,created_at) VALUES(?,?,?,?,?,'ok',?,?)`)
      .run(id, a.email.toLowerCase(), a.refreshToken, a.accessToken, a.expiresAt, isFirst, new Date().toISOString());
    return this.get(id)!;
  }
  updateTokens(id: string, accessToken: string, expiresAt: number): void { this.db.prepare('UPDATE accounts SET access_token = ?, access_expires_at = ?, last_checked_at = ? WHERE id = ?').run(accessToken, expiresAt, new Date().toISOString(), id); }
  setRefreshToken(id: string, refreshToken: string): void { this.db.prepare("UPDATE accounts SET refresh_token = ?, access_token = NULL, access_expires_at = NULL, status = 'ok', failed_since = NULL WHERE id = ?").run(refreshToken, id); }
  setStatus(id: string, status: AccountStatus, failedSince: string | null = null): void { this.db.prepare('UPDATE accounts SET status = ?, failed_since = ? WHERE id = ?').run(status, failedSince, id); }
  setDefault(id: string): void { this.db.prepare('UPDATE accounts SET is_default_dest = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id); }
  remove(id: string): void {
    const wasDefault = this.get(id)?.is_default_dest === 1;
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    if (wasDefault) { const next = this.list()[0]; if (next) this.setDefault(next.id); }
  }
  defaultDest(): AccountRow | null { return (this.db.prepare('SELECT * FROM accounts WHERE is_default_dest = 1').get() as AccountRow | undefined) ?? this.list()[0] ?? null; }
}

const REFRESH_MARGIN_MS = 60_000;

export class AccountsService implements TokenProvider {
  private inflight = new Map<string, Promise<string>>();
  constructor(private repo: AccountsRepo, private oauthClient: OauthClientRepo, private fetchFn: typeof fetch = fetch, private now: () => number = Date.now) {}

  async getAccessToken(accountId: string): Promise<string> {
    const a = this.repo.get(accountId);
    if (!a) throw new Error(t.accounts.notFound);
    if (a.access_token && a.access_expires_at && a.access_expires_at - this.now() > REFRESH_MARGIN_MS) return a.access_token;
    const running = this.inflight.get(accountId);
    if (running) return running;
    const p = this.refresh(a).finally(() => this.inflight.delete(accountId));
    this.inflight.set(accountId, p);
    return p;
  }

  private async refresh(a: { id: string; refresh_token: string }): Promise<string> {
    const client = this.oauthClient.get();
    if (!client) throw new Error(t.accounts.noClient);
    try {
      const r = await refreshAccessToken({ refreshToken: a.refresh_token, client }, this.fetchFn);
      const expiresAt = this.now() + r.expiresInSec * 1000;
      this.repo.updateTokens(a.id, r.accessToken, expiresAt);
      if (this.repo.get(a.id)?.status !== 'ok') this.repo.setStatus(a.id, 'ok', null);
      return r.accessToken;
    } catch (err) {
      if (err instanceof OAuthError && (err.code === 'invalid_grant' || err.code === 'invalid_client')) this.markDisconnected(a.id);
      throw err;
    }
  }

  invalidate(accountId: string): void { this.repo.updateTokens(accountId, '', 0); }
  markDisconnected(accountId: string): void {
    const a = this.repo.get(accountId);
    if (a && a.status !== 'disconnected') this.repo.setStatus(accountId, 'disconnected', new Date(this.now()).toISOString());
  }
  async testConnection(accountId: string, aboutEmail: (token: string) => Promise<string>): Promise<{ ok: boolean; email?: string; error?: string }> {
    try { this.invalidate(accountId); const token = await this.getAccessToken(accountId); const email = await aboutEmail(token); return { ok: true, email }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
}
```

`login-flow.ts`:
```ts
import type { AccountsRepo } from './accounts';
import type { OauthClientRepo } from './client-config';
import { createPkce, randomState } from './pkce';
import { buildAuthUrl, exchangeCode, startLoopback as defaultStartLoopback, type Loopback } from './oauth';
import { t } from '../i18n/strings';

export type LoginStatus = { state: 'idle' } | { state: 'pending'; authUrl: string } | { state: 'done'; email: string } | { state: 'error'; message: string };

interface Deps { repo: AccountsRepo; oauthClient: OauthClientRepo; fetchFn: typeof fetch; openBrowser: (url: string) => void; startLoopback?: typeof defaultStartLoopback; aboutEmail: (accessToken: string) => Promise<string>; now?: () => number; }

// Um login por vez: começar outro cancela o anterior (fecha o loopback antigo).
export class LoginFlow {
  private current: LoginStatus = { state: 'idle' };
  private loopback: Loopback | null = null;
  constructor(private deps: Deps) {}

  status(): LoginStatus { return this.current; }

  async start(loginHint?: string): Promise<{ authUrl: string }> {
    const client = this.deps.oauthClient.get();
    if (!client) throw new Error(t.accounts.noClient);
    this.loopback?.close();
    const lb = await (this.deps.startLoopback ?? defaultStartLoopback)();
    this.loopback = lb;
    const { verifier, challenge } = createPkce();
    const state = randomState();
    const authUrl = buildAuthUrl({ clientId: client.clientId, redirectUri: lb.redirectUri, challenge, state, loginHint });
    this.current = { state: 'pending', authUrl };
    void this.finish(lb, state, verifier, client);
    this.deps.openBrowser(authUrl);
    return { authUrl };
  }

  private async finish(lb: Loopback, state: string, verifier: string, client: { clientId: string; clientSecret: string }): Promise<void> {
    try {
      const code = await lb.waitForCode(state);
      const tokens = await exchangeCode({ code, verifier, redirectUri: lb.redirectUri, client }, this.deps.fetchFn);
      const email = (await this.deps.aboutEmail(tokens.accessToken)).toLowerCase();
      const expiresAt = (this.deps.now ?? Date.now)() + tokens.expiresInSec * 1000;
      const existing = this.deps.repo.byEmail(email);
      if (existing) { this.deps.repo.setRefreshToken(existing.id, tokens.refreshToken); this.deps.repo.updateTokens(existing.id, tokens.accessToken, expiresAt); }
      else this.deps.repo.insert({ email, refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt });
      this.current = { state: 'done', email };
    } catch (err) {
      this.current = { state: 'error', message: err instanceof Error ? err.message : String(err) };
    } finally {
      lb.close();
      if (this.loopback === lb) this.loopback = null;
    }
  }
}
```

Acrescentar em `i18n/strings.ts`: `accounts: { notFound: 'Conta não encontrada.', noClient: 'Configure primeiro o ID e o segredo do OAuth client (passo 1 do assistente).' }`.

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(auth): contas conectadas com refresh de token e fluxo de login pelo loopback"`

---

### Task 7: Rotas de auth/contas, guarda de origem e `deps.ts`

**Files:**
- Create: `server/src/deps.ts`, `server/src/security.ts`, `server/src/routes/auth.ts`, `server/src/routes/accounts.ts`, `server/src/test/harness.ts`
- Modify: `server/src/app.ts` (assinatura `buildApp(config, db, deps)`), `server/src/routes/info.ts`, `server/src/index.ts`
- Test: `server/src/security.test.ts`, `server/src/routes/auth.test.ts`

**Interfaces:**
- Produces:
```ts
export interface AppDeps { db: Db; settings: SettingsRepo; oauthClient: OauthClientRepo; accountsRepo: AccountsRepo; accounts: AccountsService; login: LoginFlow; fetchFn: typeof fetch; openBrowser: (url: string) => void; /* Tasks 8–17 acrescentam: clients, quota, jobsRepo, engine, inspections */ }
export function buildDeps(config: AppConfig, db: Db, overrides?: Partial<AppDeps>): AppDeps
export function registerLocalOriginGuard(app: FastifyInstance): void
```
- `test/harness.ts`: `makeTestApp(overrides?): { app, db, deps }` (Fastify com `buildDeps(..., {fetchFn: fake, openBrowser: noop})`; o `fetchFn` default aqui é um que falha — o FakeDrive da Task 9 passa a ser o padrão).

- [ ] **Step 1: Testes**

`security.test.ts`:
```ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLocalOriginGuard } from './security';
const make = () => { const app = Fastify(); registerLocalOriginGuard(app); app.get('/api/x', async () => ({ ok: true })); app.get('/outra', async () => 'ok'); return app; };
describe('guarda de origem local', () => {
  it('sem Origin passa (navegação e fetch same-origin GET)', async () => { expect((await make().inject({ url: '/api/x' })).statusCode).toBe(200); });
  it('Origin local passa', async () => { expect((await make().inject({ url: '/api/x', headers: { origin: 'http://127.0.0.1:7799', host: '127.0.0.1:7799' } })).statusCode).toBe(200); expect((await make().inject({ url: '/api/x', headers: { origin: 'http://localhost:7799', host: 'localhost:7799' } })).statusCode).toBe(200); });
  it('Origin de outro site é 403', async () => { expect((await make().inject({ url: '/api/x', headers: { origin: 'https://malicioso.example', host: '127.0.0.1:7799' } })).statusCode).toBe(403); });
  it('Sec-Fetch-Site cross-site é 403; same-origin passa', async () => { expect((await make().inject({ url: '/api/x', headers: { 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403); expect((await make().inject({ url: '/api/x', headers: { 'sec-fetch-site': 'same-origin' } })).statusCode).toBe(200); });
  it('não afeta rotas fora de /api', async () => { expect((await make().inject({ url: '/outra', headers: { origin: 'https://malicioso.example' } })).statusCode).toBe(200); });
});
```

`routes/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeTestApp } from '../test/harness';
describe('rotas de auth', () => {
  it('client: vazio → configurado e mascarado', async () => {
    const { app } = makeTestApp();
    expect((await app.inject({ url: '/api/auth/client' })).json()).toEqual({ configured: false, clientIdMasked: null });
    const r = await app.inject({ method: 'POST', url: '/api/auth/client', payload: { clientId: '1234567890-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' } });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/client' })).json()).toEqual({ configured: true, clientIdMasked: '…234567890-abc.apps.googleusercontent.com' });
    expect((await app.inject({ url: '/api/info' })).json()).toMatchObject({ configured: { client: true, accounts: 0 } });
  });
  it('client inválido é 400 com mensagem', async () => {
    const { app } = makeTestApp();
    const r = await app.inject({ method: 'POST', url: '/api/auth/client', payload: { clientId: 'x', clientSecret: '' } });
    expect(r.statusCode).toBe(400); expect(r.json().error).toMatch(/ID do cliente/);
  });
  it('login/start sem client é 400; status começa idle', async () => {
    const { app } = makeTestApp();
    expect((await app.inject({ url: '/api/auth/login/status' })).json()).toEqual({ state: 'idle' });
    expect((await app.inject({ method: 'POST', url: '/api/auth/login/start' })).statusCode).toBe(400);
  });
  it('contas: lista, padrão, remover', async () => {
    const { app, deps } = makeTestApp();
    const a = deps.accountsRepo.insert({ email: 'a@x.com', refreshToken: 'r', accessToken: 'A', expiresAt: Date.now() + 1e6 });
    const b = deps.accountsRepo.insert({ email: 'b@x.com', refreshToken: 'r', accessToken: 'B', expiresAt: Date.now() + 1e6 });
    const list = (await app.inject({ url: '/api/accounts' })).json();
    expect(list.accounts).toHaveLength(2);
    expect(list.accounts[0]).toEqual({ id: a.id, email: 'a@x.com', status: 'ok', isDefaultDest: true, failedSince: null });
    expect(list.accounts[0]).not.toHaveProperty('refresh_token');
    await app.inject({ method: 'POST', url: `/api/accounts/${b.id}/default` });
    expect(deps.accountsRepo.defaultDest()?.id).toBe(b.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/accounts/${a.id}` })).statusCode).toBe(200);
    expect(deps.accountsRepo.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

`security.ts`:
```ts
import type { FastifyInstance } from 'fastify';
// App local: uma página maliciosa aberta no navegador poderia disparar fetch
// para http://127.0.0.1:7799/api/... Quem faz isso manda Origin (ou Sec-Fetch-Site)
// de outro site; a própria SPA, same-origin, manda Origin local ou nenhum.
export function registerLocalOriginGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return reply.code(403).send({ error: 'forbidden_origin' });
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return reply.code(403).send({ error: 'forbidden_origin' });
  });
}
```

`deps.ts`:
```ts
import type { AppConfig } from './config';
import type { Db } from './db';
import { SettingsRepo } from './settings/repo';
import { OauthClientRepo } from './auth/client-config';
import { AccountsRepo, AccountsService } from './auth/accounts';
import { LoginFlow } from './auth/login-flow';
import { openBrowser as defaultOpenBrowser } from './open-browser';

export interface AppDeps {
  db: Db; settings: SettingsRepo; oauthClient: OauthClientRepo; accountsRepo: AccountsRepo; accounts: AccountsService; login: LoginFlow;
  fetchFn: typeof fetch; openBrowser: (url: string) => void; aboutEmail: (accessToken: string) => Promise<string>;
}

// E-mail da conta pelo próprio Drive (about.get) — evita pedir o escopo userinfo.
export async function aboutEmailViaDrive(accessToken: string, fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`about.get → HTTP ${res.status}`);
  const json = (await res.json()) as { user?: { emailAddress?: string } };
  if (!json.user?.emailAddress) throw new Error('about.get sem e-mail');
  return json.user.emailAddress;
}

export function buildDeps(config: AppConfig, db: Db, overrides: Partial<AppDeps> = {}): AppDeps {
  void config;
  const fetchFn = overrides.fetchFn ?? fetch;
  const openBrowser = overrides.openBrowser ?? defaultOpenBrowser;
  const settings = overrides.settings ?? new SettingsRepo(db);
  const oauthClient = overrides.oauthClient ?? new OauthClientRepo(db);
  const accountsRepo = overrides.accountsRepo ?? new AccountsRepo(db);
  const accounts = overrides.accounts ?? new AccountsService(accountsRepo, oauthClient, fetchFn);
  const aboutEmail = overrides.aboutEmail ?? ((token: string) => aboutEmailViaDrive(token, fetchFn));
  const login = overrides.login ?? new LoginFlow({ repo: accountsRepo, oauthClient, fetchFn, openBrowser, aboutEmail });
  return { db, settings, oauthClient, accountsRepo, accounts, login, fetchFn, openBrowser, aboutEmail };
}
```

`routes/auth.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { maskClientId, validateClientId } from '../auth/client-config';
import { t } from '../i18n/strings';

export async function authRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { oauthClient, login } = opts.deps;
  app.get('/api/auth/client', async () => { const c = oauthClient.get(); return { configured: Boolean(c), clientIdMasked: c ? maskClientId(c.clientId) : null }; });
  app.post<{ Body: { clientId?: string; clientSecret?: string } }>('/api/auth/client', async (req, reply) => {
    const clientId = (req.body?.clientId ?? '').trim(); const clientSecret = (req.body?.clientSecret ?? '').trim();
    if (!validateClientId(clientId)) return reply.code(400).send({ error: t.auth.badClientId });
    if (clientSecret.length < 8) return reply.code(400).send({ error: t.auth.badClientSecret });
    oauthClient.set(clientId, clientSecret);
    return { ok: true };
  });
  app.post<{ Body: { loginHint?: string } }>('/api/auth/login/start', async (req, reply) => {
    if (!oauthClient.get()) return reply.code(400).send({ error: t.accounts.noClient });
    try { return await login.start(req.body?.loginHint); } catch (err) { return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) }); }
  });
  app.get('/api/auth/login/status', async () => login.status());
}
```

`routes/accounts.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import type { AccountRow } from '../types';
import { revokeToken } from '../auth/oauth';
import { t } from '../i18n/strings';

export const toAccountDto = (a: AccountRow) => ({ id: a.id, email: a.email, status: a.status, isDefaultDest: a.is_default_dest === 1, failedSince: a.failed_since });

export async function accountsRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { accountsRepo, accounts, fetchFn, aboutEmail } = opts.deps;
  app.get('/api/accounts', async () => ({ accounts: accountsRepo.list().map(toAccountDto) }));
  app.post<{ Params: { id: string } }>('/api/accounts/:id/default', async (req, reply) => { if (!accountsRepo.get(req.params.id)) return reply.code(404).send({ error: t.accounts.notFound }); accountsRepo.setDefault(req.params.id); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/accounts/:id/test', async (req, reply) => { if (!accountsRepo.get(req.params.id)) return reply.code(404).send({ error: t.accounts.notFound }); return accounts.testConnection(req.params.id, aboutEmail); });
  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req, reply) => {
    const a = accountsRepo.get(req.params.id); if (!a) return reply.code(404).send({ error: t.accounts.notFound });
    await revokeToken(a.refresh_token, fetchFn); accountsRepo.remove(a.id); return { ok: true };
  });
}
```

`routes/info.ts` passa a receber `deps` e devolver `{ version, platform, configured: { client: boolean, accounts: number } }`.

`app.ts`: `buildApp(config, db, deps: AppDeps)`; chama `registerLocalOriginGuard(app)` antes das rotas; registra `authRoutes` e `accountsRoutes` com `{ deps }`; `infoRoutes` com `{ deps }`.

`index.ts`: `const deps = buildDeps(config, db); const app = buildApp(config, db, deps);` e `configured: Boolean(deps.oauthClient.get()) && deps.accountsRepo.list().length > 0` no banner.

`test/harness.ts`:
```ts
import { buildApp } from '../app';
import { buildDeps, type AppDeps } from '../deps';
import { openDb } from '../db';
import { loadConfig } from '../config';
export function makeTestApp(overrides: Partial<AppDeps> = {}) {
  const db = openDb(':memory:');
  const config = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/riftdrive-test', OPEN_BROWSER: '0' });
  const failingFetch = (async () => { throw new Error('fetch não injetado no teste'); }) as unknown as typeof fetch;
  const deps = buildDeps(config, db, { fetchFn: failingFetch, openBrowser: () => {}, aboutEmail: async () => 'teste@x.com', ...overrides });
  const app = buildApp(config, db, deps);
  return { app, db, deps };
}
```

Acrescentar em `i18n/strings.ts`: `auth: { badClientId: 'O ID do cliente precisa terminar em .apps.googleusercontent.com (copie do Google Cloud → Credenciais).', badClientSecret: 'O segredo do cliente parece incompleto.' }`.

- [ ] **Step 4: Rodar tudo** `npx vitest run` → PASS. **Step 5: Commit** — `git commit -m "feat(api): rotas de OAuth client, login e contas; guarda de origem local; container de dependências"`

---

## Fase 2 — Google Drive

### Task 8: Erros estruturados e `DriveClient`

**Files:**
- Create: `server/src/drive/errors.ts`, `server/src/drive/client.ts`
- Test: `server/src/drive/errors.test.ts`, `server/src/drive/client.test.ts`

**Interfaces:**
- Produces:
```ts
// errors.ts
export class DriveError extends Error { constructor(public status: number, public reason: string, message: string) }
export class NetworkError extends Error {}
export function isTransient(e: unknown): boolean; isDailyLimit; isDownloadQuota; isBlocked; isAuthExpired; isStorageFull; isNotFound; isForbidden
// client.ts
export const FOLDER_MIME = 'application/vnd.google-apps.folder'; export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
export function isNativeGoogleMime(m: string): boolean
export const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime,trashed,parents,shortcutDetails,capabilities(canCopy,canDownload),owners(emailAddress,displayName)';
export interface DriveFile { id: string; name: string; mimeType: string; size: number; md5Checksum: string | null; modifiedTime?: string; trashed?: boolean; parents?: string[]; shortcutDetails?: { targetId: string; targetMimeType: string }; capabilities?: { canCopy?: boolean; canDownload?: boolean }; owners?: { emailAddress?: string; displayName?: string }[] }
export type UploadProgress = { done: true; file: DriveFile } | { done: false; received: number }
export interface ClientOptions { base?: string; sleep?: (ms: number) => Promise<void>; maxRetries?: number }
export class DriveClient {
  constructor(readonly accountId: string, tokens: TokenProvider, fetchFn?: typeof fetch, opts?: ClientOptions)
  getFile(id: string, fields?: string): Promise<DriveFile>
  listChildren(parentId: string): Promise<DriveFile[]>
  copyFile(id: string, name: string, parentId: string): Promise<DriveFile>
  createFolder(name: string, parentId: string): Promise<DriveFile>
  createEmptyFile(name: string, parentId: string, mimeType: string): Promise<DriveFile>
  rename(id: string, name: string): Promise<DriveFile>
  aboutEmail(): Promise<string>
  download(id: string, rangeStart?: number): Promise<Response>
  createUploadSession(p: { name: string; parentId: string; mimeType: string; size: number }): Promise<string>
  uploadChunk(sessionUri: string, chunk: Uint8Array, start: number, total: number): Promise<UploadProgress>
  uploadStatus(sessionUri: string, total: number): Promise<UploadProgress>
}
```

- [ ] **Step 1: Testes**

`errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DriveError, NetworkError, isAuthExpired, isBlocked, isDailyLimit, isDownloadQuota, isNotFound, isStorageFull, isTransient } from './errors';
import { OAuthError } from '../auth/oauth';
const e = (status: number, reason: string, message = '') => new DriveError(status, reason, message);
describe('classificação de erros do Drive', () => {
  it('transitórios', () => { expect(isTransient(e(429, 'rateLimitExceeded'))).toBe(true); expect(isTransient(e(403, 'userRateLimitExceeded'))).toBe(true); expect(isTransient(e(503, 'backendError'))).toBe(true); expect(isTransient(new NetworkError('x'))).toBe(true); expect(isTransient(e(403, 'cannotCopyFile'))).toBe(false); });
  it('limite diário (nunca userRateLimitExceeded, que é transitório)', () => { expect(isDailyLimit(e(403, 'dailyLimitExceeded'))).toBe(true); expect(isDailyLimit(e(403, 'activeItemCreationLimitExceeded'))).toBe(true); expect(isDailyLimit(e(403, 'x', 'The user has exceeded their upload limit'))).toBe(true); expect(isDailyLimit(e(403, 'userRateLimitExceeded'))).toBe(false); });
  it('cota de download do arquivo compartilhado', () => { expect(isDownloadQuota(e(403, 'downloadQuotaExceeded'))).toBe(true); expect(isDownloadQuota(e(403, 'x', 'The download quota for this file has been exceeded'))).toBe(true); });
  it('bloqueado pelo dono', () => { expect(isBlocked(e(403, 'cannotCopyFile'))).toBe(true); expect(isBlocked(e(403, 'cannotDownloadFile'))).toBe(true); expect(isBlocked(e(403, 'fileNotDownloadable'))).toBe(true); });
  it('autenticação', () => { expect(isAuthExpired(e(401, 'authError'))).toBe(true); expect(isAuthExpired(new OAuthError('invalid_grant', ''))).toBe(true); expect(isAuthExpired(e(403, 'forbidden'))).toBe(false); });
  it('armazenamento cheio e não encontrado', () => { expect(isStorageFull(e(403, 'storageQuotaExceeded'))).toBe(true); expect(isNotFound(e(404, 'notFound'))).toBe(true); });
});
```

`client.test.ts` (fetch falso local, sem FakeDrive ainda):
```ts
import { describe, expect, it } from 'vitest';
import { DriveClient } from './client';
import { DriveError } from './errors';
const tokens = { getAccessToken: async () => 'tok', invalidate: () => {} };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const gerr = (status: number, reason: string, message = 'm') => json(status, { error: { code: status, message, errors: [{ reason, message }] } });
const scripted = (responses: Array<() => Response>) => { const calls: { url: string; init: RequestInit }[] = []; const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return responses.shift()!(); }) as unknown as typeof fetch; return { f, calls }; };
const noSleep = { sleep: async () => {} };

describe('DriveClient', () => {
  it('getFile manda Bearer, supportsAllDrives e normaliza size (string → number)', async () => {
    const { f, calls } = scripted([() => json(200, { id: 'a', name: 'A', mimeType: 'video/mp4', size: '123' })]);
    const file = await new DriveClient('acc', tokens, f, noSleep).getFile('a');
    expect(file.size).toBe(123); expect(file.md5Checksum).toBeNull();
    const u = new URL(calls[0].url); expect(u.pathname).toBe('/drive/v3/files/a'); expect(u.searchParams.get('supportsAllDrives')).toBe('true');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
  it('listChildren pagina até acabar', async () => {
    const { f, calls } = scripted([() => json(200, { files: [{ id: '1', name: 'a', mimeType: 'x' }], nextPageToken: 'T' }), () => json(200, { files: [{ id: '2', name: 'b', mimeType: 'x' }] })]);
    const list = await new DriveClient('acc', tokens, f, noSleep).listChildren('P');
    expect(list.map((x) => x.id)).toEqual(['1', '2']);
    expect(new URL(calls[1].url).searchParams.get('pageToken')).toBe('T');
    expect(new URL(calls[0].url).searchParams.get('q')).toBe("'P' in parents and trashed = false");
  });
  it('erro da API vira DriveError com reason', async () => {
    const { f } = scripted([() => gerr(403, 'cannotCopyFile', 'This file cannot be copied by the user.')]);
    await expect(new DriveClient('acc', tokens, f, noSleep).copyFile('a', 'n', 'p')).rejects.toMatchObject({ status: 403, reason: 'cannotCopyFile' });
  });
  it('transitório é retentado com backoff; depois do limite, sobe', async () => {
    const { f, calls } = scripted([() => gerr(429, 'rateLimitExceeded'), () => gerr(503, 'backendError'), () => json(200, { id: 'ok', name: 'n', mimeType: 'x' })]);
    expect((await new DriveClient('acc', tokens, f, noSleep).getFile('a')).id).toBe('ok'); expect(calls).toHaveLength(3);
    const again = scripted(Array.from({ length: 6 }, () => () => gerr(429, 'rateLimitExceeded')));
    await expect(new DriveClient('acc', tokens, again.f, { ...noSleep, maxRetries: 2 }).getFile('a')).rejects.toBeInstanceOf(DriveError);
    expect(again.calls).toHaveLength(3);
  });
  it('401 invalida o token e tenta uma vez de novo', async () => {
    let invalidated = 0; const tk = { getAccessToken: async () => 'tok', invalidate: () => { invalidated++; } };
    const { f, calls } = scripted([() => gerr(401, 'authError'), () => json(200, { id: 'a', name: 'n', mimeType: 'x' })]);
    await new DriveClient('acc', tk, f, noSleep).getFile('a'); expect(invalidated).toBe(1); expect(calls).toHaveLength(2);
  });
  it('upload: sessão, chunk 308 com Range, chunk final 200', async () => {
    const { f, calls } = scripted([
      () => new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=S' } }),
      () => new Response(null, { status: 308, headers: { range: 'bytes=0-9' } }),
      () => json(200, { id: 'new', name: 'n', mimeType: 'x', size: '20' }),
    ]);
    const c = new DriveClient('acc', tokens, f, noSleep);
    const uri = await c.createUploadSession({ name: 'n', parentId: 'p', mimeType: 'application/octet-stream', size: 20 });
    expect(uri).toContain('upload_id=S');
    expect((calls[0].init.headers as Record<string, string>)['x-upload-content-length']).toBe('20');
    expect(await c.uploadChunk(uri, new Uint8Array(10), 0, 20)).toEqual({ done: false, received: 10 });
    expect((calls[1].init.headers as Record<string, string>)['content-range']).toBe('bytes 0-9/20');
    const fin = await c.uploadChunk(uri, new Uint8Array(10), 10, 20);
    expect(fin.done && fin.file.id).toBe('new');
  });
  it('uploadStatus consulta com bytes */total', async () => {
    const { f, calls } = scripted([() => new Response(null, { status: 308 })]);
    expect(await new DriveClient('acc', tokens, f, noSleep).uploadStatus('https://x/u', 50)).toEqual({ done: false, received: 0 });
    expect((calls[0].init.headers as Record<string, string>)['content-range']).toBe('bytes */50');
  });
  it('download com Range', async () => {
    const { f, calls } = scripted([() => new Response('abc', { status: 206 })]);
    const res = await new DriveClient('acc', tokens, f, noSleep).download('a', 5);
    expect(res.status).toBe(206); expect((calls[0].init.headers as Record<string, string>).range).toBe('bytes=5-');
    expect(new URL(calls[0].url).searchParams.get('alt')).toBe('media');
  });
});
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

`errors.ts`:
```ts
import { OAuthError } from '../auth/oauth';
export class DriveError extends Error { constructor(public status: number, public reason: string, message: string) { super(message || reason); } }
export class NetworkError extends Error {}
const has = (e: unknown, reasons: string[], re?: RegExp): boolean => e instanceof DriveError && (reasons.includes(e.reason) || (re ? re.test(e.message) : false));
export const isTransient = (e: unknown): boolean => e instanceof NetworkError || (e instanceof DriveError && (e.status === 429 || e.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError'].includes(e.reason)));
export const isDailyLimit = (e: unknown): boolean => has(e, ['dailyLimitExceeded', 'quotaExceeded', 'activeItemCreationLimitExceeded'], /upload limit|daily limit/i);
export const isDownloadQuota = (e: unknown): boolean => has(e, ['downloadQuotaExceeded'], /download quota/i);
export const isBlocked = (e: unknown): boolean => has(e, ['cannotCopyFile', 'cannotDownloadFile', 'fileNotDownloadable', 'cannotCopyAbusiveFile'], /cannot be copied|cannot be downloaded|not downloadable/i);
export const isAuthExpired = (e: unknown): boolean => (e instanceof DriveError && (e.status === 401 || e.reason === 'authError')) || (e instanceof OAuthError && (e.code === 'invalid_grant' || e.code === 'invalid_client'));
export const isStorageFull = (e: unknown): boolean => has(e, ['storageQuotaExceeded'], /storage quota/i);
export const isNotFound = (e: unknown): boolean => e instanceof DriveError && (e.status === 404 || e.reason === 'notFound');
export const isForbidden = (e: unknown): boolean => e instanceof DriveError && e.status === 403 && ['forbidden', 'insufficientFilePermissions', 'insufficientPermissions', 'appNotAuthorizedToFile'].includes(e.reason);
```

`client.ts`:
```ts
import type { TokenProvider } from '../auth/accounts';
import { DriveError, NetworkError, isTransient } from './errors';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
export const isNativeGoogleMime = (m: string): boolean => m.startsWith('application/vnd.google-apps.') && m !== FOLDER_MIME && m !== SHORTCUT_MIME;
export const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime,trashed,parents,shortcutDetails,capabilities(canCopy,canDownload),owners(emailAddress,displayName)';

export interface DriveFile { id: string; name: string; mimeType: string; size: number; md5Checksum: string | null; modifiedTime?: string; trashed?: boolean; parents?: string[]; shortcutDetails?: { targetId: string; targetMimeType: string }; capabilities?: { canCopy?: boolean; canDownload?: boolean }; owners?: { emailAddress?: string; displayName?: string }[]; }
export type UploadProgress = { done: true; file: DriveFile } | { done: false; received: number };
export interface ClientOptions { base?: string; sleep?: (ms: number) => Promise<void>; maxRetries?: number; }

const normalize = (raw: Record<string, unknown>): DriveFile => ({ ...(raw as object), id: String(raw.id), name: String(raw.name), mimeType: String(raw.mimeType), size: raw.size === undefined ? 0 : Number(raw.size), md5Checksum: typeof raw.md5Checksum === 'string' ? raw.md5Checksum : null }) as DriveFile;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Header Range de um 308: "bytes=0-1048575" → 1048576 bytes recebidos.
export const parseRangeEnd = (range: string | null): number => { const m = range?.match(/bytes=0-(\d+)/); return m ? Number(m[1]) + 1 : 0; };

interface Req { method?: string; query?: Record<string, string>; body?: unknown; rawBody?: Uint8Array; headers?: Record<string, string>; allow308?: boolean; noRetryBody?: boolean; }

export class DriveClient {
  private base: string; private sleep: (ms: number) => Promise<void>; private maxRetries: number;
  constructor(readonly accountId: string, private tokens: TokenProvider, private fetchFn: typeof fetch = fetch, opts: ClientOptions = {}) {
    this.base = opts.base ?? 'https://www.googleapis.com'; this.sleep = opts.sleep ?? defaultSleep; this.maxRetries = opts.maxRetries ?? 5;
  }

  // Toda chamada passa aqui: token, supportsAllDrives, erro estruturado, backoff.
  private async request(path: string, r: Req = {}): Promise<Response> {
    const url = path.startsWith('http') ? new URL(path) : new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(r.query ?? {})) url.searchParams.set(k, v);
    if (!path.startsWith('http') && url.pathname.startsWith('/drive/')) url.searchParams.set('supportsAllDrives', 'true');
    let retriedAuth = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokens.getAccessToken(this.accountId);
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...(r.headers ?? {}) };
      let init: RequestInit = { method: r.method ?? 'GET', headers };
      if (r.rawBody) init.body = r.rawBody; else if (r.body !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(r.body); }
      let res: Response;
      try { res = await this.fetchFn(url.toString(), init); }
      catch (err) { const ne = new NetworkError(err instanceof Error ? err.message : String(err)); if (attempt < this.maxRetries) { await this.backoff(attempt); continue; } throw ne; }
      if (res.ok || (r.allow308 && res.status === 308)) return res;
      const error = await toDriveError(res);
      if (error.status === 401 && !retriedAuth) { retriedAuth = true; this.tokens.invalidate(this.accountId); continue; }
      if (isTransient(error) && attempt < this.maxRetries) { await this.backoff(attempt); continue; }
      throw error;
    }
  }
  private backoff(attempt: number): Promise<void> { return this.sleep(Math.min(60_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200)); }

  async getFile(id: string, fields = FILE_FIELDS): Promise<DriveFile> { return normalize(await (await this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { query: { fields } })).json()); }
  async listChildren(parentId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = []; let pageToken: string | undefined;
    do {
      const query: Record<string, string> = { q: `'${parentId}' in parents and trashed = false`, fields: `nextPageToken,files(${FILE_FIELDS})`, pageSize: '1000', includeItemsFromAllDrives: 'true' };
      if (pageToken) query.pageToken = pageToken;
      const json = (await (await this.request('/drive/v3/files', { query })).json()) as { files?: Record<string, unknown>[]; nextPageToken?: string };
      out.push(...(json.files ?? []).map(normalize)); pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }
  async copyFile(id: string, name: string, parentId: string): Promise<DriveFile> { return normalize(await (await this.request(`/drive/v3/files/${encodeURIComponent(id)}/copy`, { method: 'POST', query: { fields: FILE_FIELDS }, body: { name, parents: [parentId] } })).json()); }
  async createFolder(name: string, parentId: string): Promise<DriveFile> { return normalize(await (await this.request('/drive/v3/files', { method: 'POST', query: { fields: FILE_FIELDS }, body: { name, mimeType: FOLDER_MIME, parents: [parentId] } })).json()); }
  async createEmptyFile(name: string, parentId: string, mimeType: string): Promise<DriveFile> { return normalize(await (await this.request('/drive/v3/files', { method: 'POST', query: { fields: FILE_FIELDS }, body: { name, mimeType, parents: [parentId] } })).json()); }
  async rename(id: string, name: string): Promise<DriveFile> { return normalize(await (await this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { method: 'PATCH', query: { fields: FILE_FIELDS }, body: { name } })).json()); }
  async aboutEmail(): Promise<string> { const j = (await (await this.request('/drive/v3/about', { query: { fields: 'user(emailAddress)' } })).json()) as { user?: { emailAddress?: string } }; return j.user?.emailAddress ?? ''; }
  download(id: string, rangeStart = 0): Promise<Response> { return this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { query: { alt: 'media' }, headers: rangeStart > 0 ? { range: `bytes=${rangeStart}-` } : {} }); }
  async createUploadSession(p: { name: string; parentId: string; mimeType: string; size: number }): Promise<string> {
    const res = await this.request('/upload/drive/v3/files', { method: 'POST', query: { uploadType: 'resumable', supportsAllDrives: 'true' }, headers: { 'x-upload-content-type': p.mimeType, 'x-upload-content-length': String(p.size) }, body: { name: p.name, parents: [p.parentId], mimeType: p.mimeType } });
    const loc = res.headers.get('location'); if (!loc) throw new DriveError(res.status, 'noUploadLocation', 'Sessão de upload sem Location'); return loc;
  }
  private async uploadResult(res: Response): Promise<UploadProgress> { if (res.status === 308) return { done: false, received: parseRangeEnd(res.headers.get('range')) }; return { done: true, file: normalize(await res.json()) }; }
  async uploadChunk(sessionUri: string, chunk: Uint8Array, start: number, total: number): Promise<UploadProgress> {
    const end = start + chunk.byteLength - 1;
    return this.uploadResult(await this.request(sessionUri, { method: 'PUT', rawBody: chunk, headers: { 'content-length': String(chunk.byteLength), 'content-range': `bytes ${start}-${end}/${total}` }, allow308: true }));
  }
  async uploadStatus(sessionUri: string, total: number): Promise<UploadProgress> {
    return this.uploadResult(await this.request(sessionUri, { method: 'PUT', headers: { 'content-length': '0', 'content-range': `bytes */${total}` }, allow308: true }));
  }
}

async function toDriveError(res: Response): Promise<DriveError> {
  let reason = ''; let message = `HTTP ${res.status}`;
  try { const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } | string };
    if (typeof j.error === 'string') reason = j.error; else { message = j.error?.message ?? message; reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? ''; } } catch { /* corpo não-JSON */ }
  if (!reason) reason = res.status === 404 ? 'notFound' : res.status === 401 ? 'authError' : res.status === 429 ? 'rateLimitExceeded' : res.status >= 500 ? 'backendError' : 'unknown';
  return new DriveError(res.status, reason, message);
}
```

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(drive): cliente da API v3 com erros estruturados, backoff e upload retomável"`

---

### Task 9: `FakeDrive` — a API em memória para os testes

**Files:**
- Create: `server/src/test/fake-drive.ts`
- Modify: `server/src/test/harness.ts` (FakeDrive vira o `fetchFn` padrão)
- Test: `server/src/test/fake-drive.test.ts`

**Interfaces:**
- Produces:
```ts
export interface FakeAccount { id: string; email: string; accessToken: string; refreshToken: string }
export interface FakeNode { id: string; name: string; mimeType: string; parents: string[]; size: number; md5: string | null; content: Buffer; canCopy: boolean; canDownload: boolean; shortcutTarget: string | null; ownerEmail: string; readers: Set<string>; trashed: boolean; modifiedTime: string }
export class FakeDrive {
  readonly fetch: typeof fetch;             // handler ligado — passe como fetchFn
  calls: { method: string; url: string }[];
  account(id: string, email: string): FakeAccount;        // token `tok-${id}`, refresh `rt-${id}`
  rootOf(accountId: string): string;                       // id da pasta raiz ("root-${id}"), criada no account()
  addFolder(p: { id?: string; name: string; parentId: string; owner: string; readers?: string[] }): FakeNode;
  addFile(p: { id?: string; name: string; parentId: string; owner: string; content?: string | Buffer; mimeType?: string; canCopy?: boolean; canDownload?: boolean; readers?: string[] }): FakeNode;
  addNative(p: { id?: string; name: string; parentId: string; owner: string; mimeType: string; readers?: string[] }): FakeNode;
  addShortcut(p: { id?: string; name: string; parentId: string; targetId: string; owner: string; readers?: string[] }): FakeNode;
  share(nodeId: string, accountId: string | '*'): void;    // visibilidade herdada pelos filhos
  children(parentId: string): FakeNode[];
  byPath(rootId: string, relPath: string): FakeNode | null;
  failNext(match: { reason: string; status?: number; times?: number; method?: string; urlIncludes?: string; message?: string }): void;
  setStorageFull(accountId: string, full: boolean): void;
  expireSession(sessionUri: string): void;
  revokeRefresh(accountId: string): void;                  // refresh passa a devolver invalid_grant
  grantCode(code: string, accountId: string): void;        // troca de código devolve tokens dessa conta
  readonly inflightLog: string[];
}
```
Comportamento (fiel à API real): `size` sai como **string**; erros em `{error:{code,message,errors:[{reason,message}]}}`; `files.list` respeita `pageSize`/`pageToken`; `alt=media` honra `Range` (206); upload retomável com `Location`, `308 + Range`, status `bytes */total`, `404` em sessão expirada, `400` se o `start` não bater com o recebido; `files.copy` exige leitura e `canCopy`, respeita `storageFull`; token desconhecido → 401 `authError`; token endpoint cobre `refresh_token` e `authorization_code`.

- [ ] **Step 1: Teste do próprio fake** (`fake-drive.test.ts`)
```ts
import { describe, expect, it } from 'vitest';
import { FakeDrive } from './fake-drive';
import { DriveClient } from '../drive/client';
const mk = () => { const fake = new FakeDrive(); const me = fake.account('me', 'me@x.com'); const tokens = { getAccessToken: async () => me.accessToken, invalidate: () => {} }; return { fake, me, client: new DriveClient('me', tokens, fake.fetch, { sleep: async () => {} }) }; };
describe('FakeDrive', () => {
  it('lista, copia, baixa e sobe', async () => {
    const { fake, me, client } = mk();
    const src = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'dono@x.com' }); fake.share(src.id, 'me');
    fake.addFile({ name: 'a.mp4', parentId: src.id, owner: 'dono@x.com', content: 'AAAA' });
    const kids = await client.listChildren(src.id); expect(kids.map((k) => k.name)).toEqual(['a.mp4']); expect(kids[0].size).toBe(4);
    const copy = await client.copyFile(kids[0].id, 'a.mp4', fake.rootOf(me.id)); expect(fake.children(fake.rootOf(me.id)).map((n) => n.name)).toEqual(['a.mp4']); expect(copy.size).toBe(4);
    const res = await client.download(kids[0].id, 2); expect(res.status).toBe(206); expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('AA');
    const uri = await client.createUploadSession({ name: 'b.bin', parentId: fake.rootOf(me.id), mimeType: 'application/octet-stream', size: 6 });
    expect(await client.uploadChunk(uri, Buffer.from('abc'), 0, 6)).toEqual({ done: false, received: 3 });
    expect(await client.uploadStatus(uri, 6)).toEqual({ done: false, received: 3 });
    const fin = await client.uploadChunk(uri, Buffer.from('def'), 3, 6); expect(fin.done).toBe(true);
    expect(fake.byPath(fake.rootOf(me.id), 'b.bin')?.content.toString()).toBe('abcdef');
  });
  it('visibilidade: sem compartilhar é 404; bloqueado é cannotCopyFile; falha injetada', async () => {
    const { fake, me, client } = mk();
    const src = fake.addFolder({ name: 'Priv', parentId: 'ext', owner: 'dono@x.com' });
    await expect(client.getFile(src.id)).rejects.toMatchObject({ status: 404 });
    fake.share(src.id, 'me');
    const f = fake.addFile({ name: 'x.pdf', parentId: src.id, owner: 'dono@x.com', canCopy: false });
    await expect(client.copyFile(f.id, 'x', fake.rootOf(me.id))).rejects.toMatchObject({ reason: 'cannotCopyFile' });
    fake.failNext({ reason: 'downloadQuotaExceeded', urlIncludes: '/copy' });
    const ok = fake.addFile({ name: 'y.pdf', parentId: src.id, owner: 'dono@x.com' });
    await expect(client.copyFile(ok.id, 'y', fake.rootOf(me.id))).rejects.toMatchObject({ reason: 'downloadQuotaExceeded' });
    expect((await client.copyFile(ok.id, 'y', fake.rootOf(me.id))).name).toBe('y');
  });
});
```

- [ ] **Step 2: Implementar `fake-drive.ts`** — esqueleto do handler (completar os ramos conforme a interface acima):
```ts
import { createHash, randomUUID } from 'node:crypto';
import { FOLDER_MIME, SHORTCUT_MIME, isNativeGoogleMime } from '../drive/client';

const gerr = (status: number, reason: string, message = reason) => new Response(JSON.stringify({ error: { code: status, message, errors: [{ domain: 'global', reason, message }] } }), { status, headers: { 'content-type': 'application/json' } });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export class FakeDrive {
  nodes = new Map<string, FakeNode>(); accounts = new Map<string, FakeAccount>(); calls: { method: string; url: string }[] = [];
  private sessions = new Map<string, { account: string; name: string; parentId: string; mimeType: string; total: number; chunks: Buffer[]; received: number; expired: boolean }>();
  private failures: Array<{ reason: string; status: number; times: number; method?: string; urlIncludes?: string; message?: string }> = [];
  private storageFull = new Set<string>(); private revoked = new Set<string>(); private codes = new Map<string, string>();
  readonly fetch: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => this.handle(String(url), init ?? {})) as unknown as typeof fetch;

  account(id: string, email: string): FakeAccount { const a = { id, email, accessToken: `tok-${id}`, refreshToken: `rt-${id}` }; this.accounts.set(id, a); this.addFolder({ id: `root-${id}`, name: 'Meu Drive', parentId: '', owner: email, readers: [id] }); return a; }
  rootOf(accountId: string): string { return `root-${accountId}`; }
  private put(n: Partial<FakeNode> & { name: string; mimeType: string; parentId: string; owner: string }): FakeNode {
    const content = n.content ?? Buffer.alloc(0);
    const node: FakeNode = { id: n.id ?? randomUUID(), name: n.name, mimeType: n.mimeType, parents: n.parentId ? [n.parentId] : [], size: n.mimeType === FOLDER_MIME || isNativeGoogleMime(n.mimeType) ? 0 : content.length, md5: n.mimeType === FOLDER_MIME || isNativeGoogleMime(n.mimeType) || n.mimeType === SHORTCUT_MIME ? null : createHash('md5').update(content).digest('hex'), content, canCopy: n.canCopy ?? true, canDownload: n.canDownload ?? true, shortcutTarget: n.shortcutTarget ?? null, ownerEmail: n.owner, readers: new Set(n.readers ?? []), trashed: false, modifiedTime: '2026-01-01T00:00:00.000Z' };
    this.nodes.set(node.id, node); return node;
  }
  addFolder(p: { id?: string; name: string; parentId: string; owner: string; readers?: string[] }): FakeNode { return this.put({ ...p, mimeType: FOLDER_MIME }); }
  addFile(p: { id?: string; name: string; parentId: string; owner: string; content?: string | Buffer; mimeType?: string; canCopy?: boolean; canDownload?: boolean; readers?: string[] }): FakeNode { return this.put({ ...p, mimeType: p.mimeType ?? 'application/octet-stream', content: typeof p.content === 'string' ? Buffer.from(p.content) : (p.content ?? Buffer.from('x')) }); }
  addNative(p: { id?: string; name: string; parentId: string; owner: string; mimeType: string; readers?: string[] }): FakeNode { return this.put(p); }
  addShortcut(p: { id?: string; name: string; parentId: string; targetId: string; owner: string; readers?: string[] }): FakeNode { return this.put({ ...p, mimeType: SHORTCUT_MIME, shortcutTarget: p.targetId }); }
  share(nodeId: string, accountId: string | '*'): void { this.nodes.get(nodeId)!.readers.add(accountId); }
  children(parentId: string): FakeNode[] { return [...this.nodes.values()].filter((n) => n.parents[0] === parentId && !n.trashed).sort((a, b) => a.name.localeCompare(b.name)); }
  byPath(rootId: string, relPath: string): FakeNode | null { let cur = rootId; for (const seg of relPath.split('/')) { const next = this.children(cur).find((n) => n.name === seg); if (!next) return null; cur = next.id; } return this.nodes.get(cur) ?? null; }
  failNext(m: { reason: string; status?: number; times?: number; method?: string; urlIncludes?: string; message?: string }): void { this.failures.push({ status: m.status ?? 403, times: m.times ?? 1, ...m }); }
  setStorageFull(accountId: string, full: boolean): void { full ? this.storageFull.add(accountId) : this.storageFull.delete(accountId); }
  expireSession(uri: string): void { const s = this.sessions.get(new URL(uri).searchParams.get('upload_id')!); if (s) s.expired = true; }
  revokeRefresh(accountId: string): void { this.revoked.add(accountId); }
  grantCode(code: string, accountId: string): void { this.codes.set(code, accountId); }

  private canRead(node: FakeNode, accountId: string): boolean { let cur: FakeNode | undefined = node; while (cur) { if (cur.readers.has(accountId) || cur.readers.has('*')) return true; cur = cur.parents[0] ? this.nodes.get(cur.parents[0]) : undefined; } return false; }
  private pub(n: FakeNode) { return { id: n.id, name: n.name, mimeType: n.mimeType, size: n.mimeType === FOLDER_MIME ? undefined : String(n.size), md5Checksum: n.md5 ?? undefined, modifiedTime: n.modifiedTime, trashed: n.trashed, parents: n.parents, shortcutDetails: n.shortcutTarget ? { targetId: n.shortcutTarget, targetMimeType: this.nodes.get(n.shortcutTarget)?.mimeType ?? 'application/octet-stream' } : undefined, capabilities: { canCopy: n.canCopy, canDownload: n.canDownload }, owners: [{ emailAddress: n.ownerEmail }] }; }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase(); const u = new URL(url); this.calls.push({ method, url });
    if (u.hostname === 'oauth2.googleapis.com') return this.handleOAuth(u, init);
    const fail = this.failures.find((f) => f.times > 0 && (!f.method || f.method === method) && (!f.urlIncludes || url.includes(f.urlIncludes)));
    if (fail) { fail.times--; return gerr(fail.status, fail.reason, fail.message); }
    const auth = (init.headers as Record<string, string> | undefined)?.authorization ?? ''; const acc = [...this.accounts.values()].find((a) => `Bearer ${a.accessToken}` === auth);
    if (!acc) return gerr(401, 'authError', 'Invalid Credentials');
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = u.pathname;
    if (path === '/drive/v3/about') return json({ user: { emailAddress: acc.email } });
    if (path === '/drive/v3/files' && method === 'GET') {
      const parent = u.searchParams.get('q')?.match(/'([^']+)' in parents/)?.[1] ?? ''; const kids = this.children(parent).filter((n) => this.canRead(n, acc.id));
      const size = Number(u.searchParams.get('pageSize') ?? 100); const off = Number(u.searchParams.get('pageToken') ?? 0); const page = kids.slice(off, off + size);
      return json({ files: page.map((n) => this.pub(n)), ...(off + size < kids.length ? { nextPageToken: String(off + size) } : {}) });
    }
    if (path === '/drive/v3/files' && method === 'POST') { if (this.storageFull.has(acc.id) && body.mimeType !== FOLDER_MIME) return gerr(403, 'storageQuotaExceeded', 'The user\'s Drive storage quota has been exceeded.'); const n = this.put({ name: body.name, mimeType: body.mimeType ?? 'application/octet-stream', parentId: body.parents?.[0] ?? this.rootOf(acc.id), owner: acc.email, readers: [acc.id], content: Buffer.alloc(0) }); return json(this.pub(n)); }
    const fileMatch = path.match(/^\/drive\/v3\/files\/([^/]+)(\/copy)?$/);
    if (fileMatch) {
      const n = this.nodes.get(decodeURIComponent(fileMatch[1])); if (!n || n.trashed || !this.canRead(n, acc.id)) return gerr(404, 'notFound', 'File not found');
      if (fileMatch[2] && method === 'POST') { if (!n.canCopy) return gerr(403, 'cannotCopyFile', 'This file cannot be copied by the user.'); if (this.storageFull.has(acc.id)) return gerr(403, 'storageQuotaExceeded', 'storage quota exceeded'); const c = this.put({ name: body.name, mimeType: n.mimeType, parentId: body.parents[0], owner: acc.email, readers: [acc.id], content: n.content }); return json(this.pub(c)); }
      if (method === 'PATCH') { n.name = body.name; return json(this.pub(n)); }
      if (u.searchParams.get('alt') === 'media') {
        if (!n.canDownload) return gerr(403, 'cannotDownloadFile', 'This file cannot be downloaded by the user.'); if (isNativeGoogleMime(n.mimeType)) return gerr(403, 'fileNotDownloadable', 'Only files with binary content can be downloaded.');
        const range = (init.headers as Record<string, string>)?.range?.match(/bytes=(\d+)-/); const start = range ? Number(range[1]) : 0;
        return new Response(new Uint8Array(n.content.subarray(start)), { status: start > 0 ? 206 : 200 });
      }
      return json(this.pub(n));
    }
    if (path === '/upload/drive/v3/files' && method === 'POST') { const id = randomUUID(); const total = Number((init.headers as Record<string, string>)['x-upload-content-length'] ?? 0); this.sessions.set(id, { account: acc.id, name: body.name, parentId: body.parents[0], mimeType: body.mimeType, total, chunks: [], received: 0, expired: false }); return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } }); }
    if (path === '/upload/drive/v3/files' && method === 'PUT') {
      const s = this.sessions.get(u.searchParams.get('upload_id') ?? ''); if (!s || s.expired) return gerr(404, 'notFound', 'upload session not found');
      const cr = (init.headers as Record<string, string>)['content-range'] ?? ''; const done = () => { if (this.storageFull.has(acc.id)) return gerr(403, 'storageQuotaExceeded', 'storage quota exceeded'); const n = this.put({ name: s.name, mimeType: s.mimeType, parentId: s.parentId, owner: acc.email, readers: [acc.id], content: Buffer.concat(s.chunks) }); return json(this.pub(n)); };
      const incomplete = () => new Response(null, { status: 308, headers: s.received > 0 ? { range: `bytes=0-${s.received - 1}` } : {} });
      if (/^bytes \*\//.test(cr)) return s.received >= s.total && s.total > 0 ? done() : incomplete();
      const m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/); if (!m) return gerr(400, 'badRequest', 'Content-Range inválido');
      if (Number(m[1]) !== s.received) return gerr(400, 'badRequest', `esperava offset ${s.received}, veio ${m[1]}`);
      const chunk = Buffer.from(await new Response(init.body as BodyInit).arrayBuffer()); s.chunks.push(chunk); s.received += chunk.length;
      return s.received >= s.total ? done() : incomplete();
    }
    return gerr(404, 'notFound', `rota não simulada: ${method} ${path}`);
  }
  private handleOAuth(u: URL, init: RequestInit): Response {
    if (u.pathname === '/revoke') return new Response('{}', { status: 200 });
    const form = new URLSearchParams(String(init.body ?? ''));
    if (form.get('grant_type') === 'refresh_token') { const acc = [...this.accounts.values()].find((a) => a.refreshToken === form.get('refresh_token')); if (!acc || this.revoked.has(acc.id)) return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400); return json({ access_token: acc.accessToken, expires_in: 3600, token_type: 'Bearer' }); }
    const accId = this.codes.get(form.get('code') ?? ''); const acc = accId ? this.accounts.get(accId) : undefined; if (!acc) return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: acc.accessToken, refresh_token: acc.refreshToken, expires_in: 3600, token_type: 'Bearer' });
  }
}
```
(`FakeAccount`/`FakeNode` exportados conforme a interface.)

- [ ] **Step 3: harness** — `makeTestApp` cria `const fake = new FakeDrive()` e passa `fetchFn: fake.fetch` por padrão; devolve `{ app, db, deps, fake }`. Contas de teste: helper `connectFakeAccount(deps, fake, id, email)` que chama `fake.account(id, email)` e `deps.accountsRepo.insert({ email, refreshToken: 'rt-'+id, accessToken: 'tok-'+id, expiresAt: Date.now()+3.6e6 })` e devolve o `AccountRow`.
- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "test: FakeDrive — Google Drive em memória para a suíte (lista, cópia, download, upload retomável, erros)"`

---

### Task 10: Links e árvore (`parseDriveId`, `listTree`)

**Files:**
- Create: `server/src/drive/links.ts`, `server/src/drive/tree.ts`
- Test: `server/src/drive/links.test.ts`, `server/src/drive/tree.test.ts`

**Interfaces:**
```ts
export function parseDriveId(input: string): string | null
export interface TreeEntry { relPath: string; id: string; name: string; mimeType: string; size: number; md5: string | null; canCopy: boolean; canDownload: boolean; isNative: boolean }
export interface TreeFolder { relPath: string; id: string; name: string }
export interface Tree { files: TreeEntry[]; folders: TreeFolder[]; totalBytes: number }
export async function listTree(client: DriveClient, rootId: string, opts?: { onProgress?: (filesSeen: number) => void; signal?: AbortSignal }): Promise<Tree>
```

- [ ] **Step 1: Testes**

`links.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseDriveId } from './links';
describe('parseDriveId', () => {
  it.each([
    ['https://drive.google.com/drive/folders/1AbC_dEf-GhI?usp=sharing', '1AbC_dEf-GhI'],
    ['https://drive.google.com/drive/u/0/folders/1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['https://drive.google.com/open?id=1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['https://drive.google.com/file/d/1AbC_dEf-GhI/view', '1AbC_dEf-GhI'],
    ['https://drive.google.com/drive/folders/1AbC_dEf-GhI#x', '1AbC_dEf-GhI'],
    ['1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['  1AbC_dEf-GhI  ', '1AbC_dEf-GhI'],
  ])('%s → %s', (input, id) => expect(parseDriveId(input)).toBe(id));
  it('rejeita lixo', () => { expect(parseDriveId('')).toBeNull(); expect(parseDriveId('https://example.com/x')).toBeNull(); expect(parseDriveId('abc')).toBeNull(); });
});
```
`tree.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { listTree } from './tree';
const mk = () => { const fake = new FakeDrive(); const me = fake.account('me', 'me@x.com'); const client = new DriveClient('me', { getAccessToken: async () => me.accessToken, invalidate: () => {} }, fake.fetch, { sleep: async () => {} }); return { fake, client }; };
describe('listTree', () => {
  it('percorre pastas, resolve atalhos e desambigua nomes repetidos', async () => {
    const { fake, client } = mk();
    const root = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    const m1 = fake.addFolder({ name: 'Módulo 1', parentId: root.id, owner: 'd@x.com' });
    fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '1234' });
    fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '56' });
    const other = fake.addFolder({ name: 'Extras', parentId: 'ext2', owner: 'd@x.com', readers: ['me'] });
    fake.addFile({ name: 'bonus.pdf', parentId: other.id, owner: 'd@x.com', content: 'pdf', canCopy: false });
    fake.addShortcut({ name: 'Bônus', parentId: root.id, targetId: other.id, owner: 'd@x.com' });
    fake.addNative({ name: 'Plano', parentId: root.id, owner: 'd@x.com', mimeType: 'application/vnd.google-apps.document' });
    const seen: number[] = [];
    const tree = await listTree(client, root.id, { onProgress: (n) => seen.push(n) });
    expect(tree.folders.map((f) => f.relPath).sort()).toEqual(['Bônus', 'Módulo 1']);
    expect(tree.files.map((f) => [f.relPath, f.size, f.canCopy, f.isNative])).toEqual([
      ['Bônus/bonus.pdf', 3, false, false], ['Módulo 1/a (2).mp4', 2, true, false], ['Módulo 1/a.mp4', 4, true, false], ['Plano', 0, true, true],
    ]);
    expect(tree.totalBytes).toBe(9); expect(seen.at(-1)).toBe(4);
  });
  it('pagina listagens grandes', async () => {
    const { fake, client } = mk();
    const root = fake.addFolder({ name: 'Grande', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    for (let i = 0; i < 2500; i++) fake.addFile({ name: `f${String(i).padStart(4, '0')}.bin`, parentId: root.id, owner: 'd@x.com', content: 'x' });
    expect((await listTree(client, root.id)).files).toHaveLength(2500);
  });
  it('respeita cancelamento', async () => {
    const { fake, client } = mk(); const ac = new AbortController(); ac.abort();
    const root = fake.addFolder({ name: 'C', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    await expect(listTree(client, root.id, { signal: ac.signal })).rejects.toThrow(/cancelad/i);
  });
});
```

- [ ] **Step 2: Rodar — falha. Step 3: Implementar**

`links.ts`:
```ts
const ID = /^[\w-]{10,}$/;
export function parseDriveId(input: string): string | null {
  const s = input.trim(); if (!s) return null;
  if (ID.test(s)) return s;
  let u: URL; try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
  const q = u.searchParams.get('id'); if (q && ID.test(q)) return q;
  const m = u.pathname.match(/\/(?:folders|d)\/([\w-]{10,})/); return m ? m[1] : null;
}
```
`tree.ts`:
```ts
import { FOLDER_MIME, SHORTCUT_MIME, isNativeGoogleMime, type DriveClient, type DriveFile } from './client';
import { isNotFound } from './errors';
import { t } from '../i18n/strings';
export interface TreeEntry { relPath: string; id: string; name: string; mimeType: string; size: number; md5: string | null; canCopy: boolean; canDownload: boolean; isNative: boolean; }
export interface TreeFolder { relPath: string; id: string; name: string; }
export interface Tree { files: TreeEntry[]; folders: TreeFolder[]; totalBytes: number; }

// Nomes repetidos na mesma pasta existem no Drive; no destino viram "a (2).mp4".
export function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf('.'); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) { const cand = `${base} (${i})${ext}`; if (!used.has(cand)) { used.add(cand); return cand; } }
}

export async function listTree(client: DriveClient, rootId: string, opts: { onProgress?: (filesSeen: number) => void; signal?: AbortSignal } = {}): Promise<Tree> {
  const files: TreeEntry[] = []; const folders: TreeFolder[] = []; let totalBytes = 0;
  const queue: { id: string; relPath: string }[] = [{ id: rootId, relPath: '' }];
  while (queue.length) {
    if (opts.signal?.aborted) throw new Error(t.inspect.canceled);
    const cur = queue.shift()!;
    const used = new Set<string>();
    for (const child of await client.listChildren(cur.id)) {
      let node: DriveFile = child;
      if (child.mimeType === SHORTCUT_MIME && child.shortcutDetails) {
        try { node = { ...(await client.getFile(child.shortcutDetails.targetId)), name: child.name }; } catch (err) { if (isNotFound(err)) continue; throw err; }
      }
      const name = uniqueName(used, node.name); const relPath = cur.relPath ? `${cur.relPath}/${name}` : name;
      if (node.mimeType === FOLDER_MIME) { folders.push({ relPath, id: node.id, name }); queue.push({ id: node.id, relPath }); continue; }
      const isNative = isNativeGoogleMime(node.mimeType);
      files.push({ relPath, id: node.id, name, mimeType: node.mimeType, size: isNative ? 0 : node.size, md5: node.md5Checksum, canCopy: node.capabilities?.canCopy !== false, canDownload: node.capabilities?.canDownload !== false, isNative });
      totalBytes += isNative ? 0 : node.size;
    }
    opts.onProgress?.(files.length);
  }
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { files, folders, totalBytes };
}
```
Acrescentar em strings: `inspect: { canceled: 'Leitura da pasta cancelada.' }` (seção ampliada na Task 11).

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(drive): parse de links e leitura da árvore com atalhos, paginação e nomes únicos"`

---

### Task 11: Análise do link (`inspect`) e cache de inspeções

**Files:**
- Create: `server/src/drive/inspect.ts`, `server/src/drive/inspections.ts`
- Test: `server/src/drive/inspect.test.ts`

**Interfaces:**
```ts
export class InspectError extends Error { constructor(public code: 'invalid_link' | 'not_a_folder' | 'no_access' | 'dest_unreachable', message: string) }
export interface InspectDeps { clientFor(accountId: string): DriveClient; accounts: AccountRow[]; quota: QuotaService; onProgress?: (filesSeen: number) => void; signal?: AbortSignal }
export interface InspectInput { link: string; destAccountId: string; destParentId: string; destParentName: string }
export interface InspectResult {
  folderId: string; name: string; owner: string | null; path: JobPath; readerAccountId: string; readerEmail: string; destAccountId: string; destEmail: string;
  totals: { files: number; bytes: number }; blocked: { count: number; bytes: number; sample: { name: string; relPath: string }[] }; native: { count: number };
  copyableBytes: number; destConflict: { existingFolderId: string } | null;
  quota: { fits: boolean; mode: 'limit' | 'unlimited'; usedBytes: number; limitBytes: number | null; remainingBytes: number | null; resetAt: string };
  shareRequestText: string | null;
}
export async function inspect(deps: InspectDeps, input: InspectInput): Promise<{ result: InspectResult; tree: Tree }>
export class InspectionCache { constructor(ttlMs = 15*60_000, max = 20); put(result: InspectResult, tree: Tree): string; get(id: string): { result: InspectResult; tree: Tree } | null }
```

- [ ] **Step 1: Testes** (`inspect.test.ts`)
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { inspect } from './inspect';
import type { AccountRow } from '../types';

function world() {
  const fake = new FakeDrive(); const db = openDb(':memory:'); const quota = new QuotaService(db, new SettingsRepo(db));
  const acc = (id: string, email: string): AccountRow => { fake.account(id, email); return { id, email, refresh_token: 'r', access_token: `tok-${id}`, access_expires_at: Date.now() + 1e6, status: 'ok', is_default_dest: id === 'dest' ? 1 : 0, created_at: '', last_checked_at: null, failed_since: null }; };
  const accounts = [acc('dest', 'dest@x.com'), acc('old', 'old@x.com')];
  const clientFor = (id: string) => new DriveClient(id, { getAccessToken: async () => `tok-${id}`, invalidate: () => {} }, fake.fetch, { sleep: async () => {} });
  const src = fake.addFolder({ name: 'Asimov 2026', parentId: 'ext', owner: 'ana@x.com' });
  fake.addFile({ name: 'a.mp4', parentId: src.id, owner: 'ana@x.com', content: '12345' });
  fake.addFile({ name: 'b.pdf', parentId: src.id, owner: 'ana@x.com', content: '123', canCopy: false, canDownload: false });
  fake.addNative({ name: 'Notas', parentId: src.id, owner: 'ana@x.com', mimeType: 'application/vnd.google-apps.document' });
  const input = { link: `https://drive.google.com/drive/folders/${src.id}`, destAccountId: 'dest', destParentId: fake.rootOf('dest'), destParentName: 'Meu Drive' };
  return { fake, quota, accounts, clientFor, src, input };
}

describe('inspect', () => {
  it('pelo rift quando a conta de destino enxerga a origem', async () => {
    const w = world(); w.fake.share(w.src.id, 'dest');
    const { result, tree } = await inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, w.input);
    expect(result).toMatchObject({ name: 'Asimov 2026', owner: 'ana@x.com', path: 'rift', readerAccountId: 'dest', destEmail: 'dest@x.com', totals: { files: 3, bytes: 8 }, blocked: { count: 1, bytes: 3 }, native: { count: 1 }, copyableBytes: 5, destConflict: null, shareRequestText: null });
    expect(result.quota.fits).toBe(true); expect(tree.files).toHaveLength(3);
  });
  it('pela máquina quando só outra conta enxerga; nativos ficam de fora e o pedido de compartilhamento vem pronto', async () => {
    const w = world(); w.fake.share(w.src.id, 'old');
    const { result } = await inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, w.input);
    expect(result.path).toBe('machine'); expect(result.readerAccountId).toBe('old');
    expect(result.blocked.count).toBe(1); expect(result.native.count).toBe(1); expect(result.copyableBytes).toBe(5);
    expect(result.shareRequestText).toContain('Asimov 2026'); expect(result.shareRequestText).toContain('dest@x.com');
  });
  it('ninguém enxerga → no_access com a dica certa', async () => {
    const w = world();
    await expect(inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, w.input)).rejects.toMatchObject({ code: 'no_access' });
  });
  it('link inválido e link de arquivo', async () => {
    const w = world(); w.fake.share(w.src.id, 'dest');
    await expect(inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, { ...w.input, link: 'nada' })).rejects.toMatchObject({ code: 'invalid_link' });
    const file = w.fake.children(w.src.id)[0];
    await expect(inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, { ...w.input, link: file.id })).rejects.toMatchObject({ code: 'not_a_folder' });
  });
  it('atalho para pasta é seguido; conflito de nome no destino é detectado', async () => {
    const w = world(); w.fake.share(w.src.id, 'dest');
    const sc = w.fake.addShortcut({ name: 'Atalho', parentId: w.fake.rootOf('dest'), targetId: w.src.id, owner: 'dest@x.com', readers: ['dest'] });
    w.fake.addFolder({ name: 'Asimov 2026', parentId: w.fake.rootOf('dest'), owner: 'dest@x.com', readers: ['dest'] });
    const { result } = await inspect({ clientFor: w.clientFor, accounts: w.accounts, quota: w.quota }, { ...w.input, link: sc.id });
    expect(result.folderId).toBe(w.src.id); expect(result.destConflict).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — falha. Step 3: Implementar**

`inspect.ts`:
```ts
import type { AccountRow, JobPath } from '../types';
import { FOLDER_MIME, SHORTCUT_MIME, type DriveClient, type DriveFile } from './client';
import { isForbidden, isNotFound } from './errors';
import { parseDriveId } from './links';
import { listTree, type Tree } from './tree';
import type { QuotaService } from './quota';
import { t } from '../i18n/strings';

export type InspectErrorCode = 'invalid_link' | 'not_a_folder' | 'no_access' | 'dest_unreachable';
export class InspectError extends Error { constructor(public code: InspectErrorCode, message: string) { super(message); } }
export interface InspectDeps { clientFor(accountId: string): DriveClient; accounts: AccountRow[]; quota: QuotaService; onProgress?: (filesSeen: number) => void; signal?: AbortSignal; }
export interface InspectInput { link: string; destAccountId: string; destParentId: string; destParentName: string; }
export interface InspectResult { folderId: string; name: string; owner: string | null; path: JobPath; readerAccountId: string; readerEmail: string; destAccountId: string; destEmail: string; totals: { files: number; bytes: number }; blocked: { count: number; bytes: number; sample: { name: string; relPath: string }[] }; native: { count: number }; copyableBytes: number; destConflict: { existingFolderId: string } | null; quota: ReturnType<QuotaService['evaluate']>; shareRequestText: string | null; }

const notAccessible = (err: unknown) => isNotFound(err) || isForbidden(err);

// Quem consegue ler a origem? Primeiro a conta de destino (→ rift). Senão, as outras (→ máquina).
async function resolveReader(deps: InspectDeps, id: string, destAccountId: string): Promise<{ reader: AccountRow; file: DriveFile; path: JobPath }> {
  const dest = deps.accounts.find((a) => a.id === destAccountId); if (!dest) throw new InspectError('dest_unreachable', t.inspect.destUnreachable);
  const ordered = [dest, ...deps.accounts.filter((a) => a.id !== destAccountId && a.status === 'ok')];
  for (const acc of ordered) {
    try { const file = await deps.clientFor(acc.id).getFile(id); return { reader: acc, file, path: acc.id === destAccountId ? 'rift' : 'machine' }; }
    catch (err) { if (!notAccessible(err)) throw err; }
  }
  throw new InspectError('no_access', t.inspect.noAccess(dest.email));
}

export async function inspect(deps: InspectDeps, input: InspectInput): Promise<{ result: InspectResult; tree: Tree }> {
  const id = parseDriveId(input.link); if (!id) throw new InspectError('invalid_link', t.inspect.invalidLink);
  let { reader, file, path } = await resolveReader(deps, id, input.destAccountId);
  const client = deps.clientFor(reader.id);
  if (file.mimeType === SHORTCUT_MIME && file.shortcutDetails) { const target = await client.getFile(file.shortcutDetails.targetId); file = { ...target, name: file.name }; }
  if (file.mimeType !== FOLDER_MIME) throw new InspectError('not_a_folder', t.inspect.notAFolder);
  const tree = await listTree(client, file.id, { onProgress: deps.onProgress, signal: deps.signal });
  const blockedFiles = tree.files.filter((f) => !f.isNative && (path === 'rift' ? !f.canCopy : !f.canDownload));
  const nativeOut = path === 'machine' ? tree.files.filter((f) => f.isNative) : [];
  const blockedBytes = blockedFiles.reduce((n, f) => n + f.size, 0);
  const copyableBytes = tree.totalBytes - blockedBytes;
  const dest = deps.accounts.find((a) => a.id === input.destAccountId)!;
  const siblings = await deps.clientFor(dest.id).listChildren(input.destParentId);
  const conflict = siblings.find((s) => s.mimeType === FOLDER_MIME && s.name === file.name);
  const result: InspectResult = {
    folderId: file.id, name: file.name, owner: file.owners?.[0]?.emailAddress ?? null, path, readerAccountId: reader.id, readerEmail: reader.email, destAccountId: dest.id, destEmail: dest.email,
    totals: { files: tree.files.length, bytes: tree.totalBytes },
    blocked: { count: blockedFiles.length, bytes: blockedBytes, sample: blockedFiles.slice(0, 20).map((f) => ({ name: f.name, relPath: f.relPath })) },
    native: { count: nativeOut.length }, copyableBytes,
    destConflict: conflict ? { existingFolderId: conflict.id } : null,
    quota: deps.quota.evaluate(dest.id, copyableBytes),
    shareRequestText: path === 'machine' ? t.inspect.shareRequest(file.name, dest.email) : null,
  };
  return { result, tree };
}
```
`inspections.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { InspectResult } from './inspect';
import type { Tree } from './tree';
// A análise lê a árvore inteira; criar o job depois reaproveita essa leitura.
export class InspectionCache {
  private items = new Map<string, { result: InspectResult; tree: Tree; at: number }>();
  constructor(private ttlMs = 15 * 60_000, private max = 20, private now: () => number = Date.now) {}
  put(result: InspectResult, tree: Tree): string { this.sweep(); const id = randomUUID(); this.items.set(id, { result, tree, at: this.now() }); while (this.items.size > this.max) this.items.delete(this.items.keys().next().value!); return id; }
  get(id: string): { result: InspectResult; tree: Tree } | null { this.sweep(); const it = this.items.get(id); return it ? { result: it.result, tree: it.tree } : null; }
  private sweep(): void { const cut = this.now() - this.ttlMs; for (const [k, v] of this.items) if (v.at < cut) this.items.delete(k); }
}
```
Strings (`inspect`): `invalidLink: 'Isso não parece um link do Google Drive. Cole o link da pasta (drive.google.com/drive/folders/…).'`, `notAFolder: 'O link aponta para um arquivo. O RiftDrive copia pastas — cole o link da pasta que contém o arquivo.'`, `noAccess: (email) => \`Nenhuma conta conectada tem acesso a essa pasta. Peça ao dono para compartilhar com ${email}, ou conecte a conta que tem acesso.\``, `destUnreachable: 'A conta de destino não está conectada.'`, `shareRequest: (name, email) => \`Oi! Você pode compartilhar a pasta "${name}" com ${email}? Assim eu faço a cópia direto dentro do Google Drive, sem baixar nada. Obrigado!\``, `canceled` (já existe).

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(drive): análise do link — detecção de caminho (rift/máquina), bloqueados, nativos, conflito e cota"`

---

## Fase 3 — Motor

### Task 12: Cota diária (`QuotaService`)

**Files:**
- Create: `server/src/drive/quota.ts`
- Test: `server/src/drive/quota.test.ts`

**Interfaces:**
```ts
export function dayKey(nowMs: number, resetHour: number): string          // 'YYYY-MM-DD' (hora local)
export function nextResetAt(nowMs: number, resetHour: number): number
export class QuotaService {
  constructor(db: Db, settings: SettingsRepo, now?: () => number)
  settings(): QuotaSettings
  used(accountId: string): number
  canSpend(accountId: string, bytes: number): boolean
  record(accountId: string, bytes: number): void
  evaluate(accountId: string, bytes: number): { fits: boolean; mode: 'limit' | 'unlimited'; usedBytes: number; limitBytes: number | null; remainingBytes: number | null; resetAt: string }
}
```

- [ ] **Step 1: Testes**
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { QuotaService, dayKey, nextResetAt } from './quota';
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();
describe('dia da cota', () => {
  it('antes da hora de renovação ainda é o dia anterior', () => { expect(dayKey(at(2026, 1, 10, 3), 4)).toBe('2026-01-09'); expect(dayKey(at(2026, 1, 10, 5), 4)).toBe('2026-01-10'); });
  it('próxima renovação', () => { expect(nextResetAt(at(2026, 1, 10, 3), 4)).toBe(at(2026, 1, 10, 4)); expect(nextResetAt(at(2026, 1, 10, 5), 4)).toBe(at(2026, 1, 11, 4)); });
});
describe('QuotaService', () => {
  const mk = (now: number) => { const db = openDb(':memory:'); const s = new SettingsRepo(db); return { s, q: new QuotaService(db, s, () => now) }; };
  it('modo limite: soma, bloqueia e vira o dia', () => {
    const { s, q } = mk(at(2026, 1, 10, 5)); s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 });
    expect(q.canSpend('a', 60)).toBe(true); q.record('a', 60);
    expect(q.canSpend('a', 50)).toBe(false); expect(q.canSpend('a', 40)).toBe(true);
    expect(q.evaluate('a', 50)).toMatchObject({ fits: false, usedBytes: 60, limitBytes: 100, remainingBytes: 40 });
    const later = new QuotaService((q as unknown as { db: never }).db, s, () => at(2026, 1, 11, 5)); expect(later.used('a')).toBe(0);
  });
  it('arquivo maior que o limite inteiro passa quando o dia está zerado (senão nunca copiaria)', () => { const { s, q } = mk(at(2026, 1, 10, 5)); s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 }); expect(q.canSpend('a', 500)).toBe(true); q.record('a', 500); expect(q.canSpend('a', 1)).toBe(false); });
  it('sem limite sempre pode; evaluate informa', () => { const { s, q } = mk(at(2026, 1, 10, 5)); s.setQuota({ mode: 'unlimited' }); q.record('a', 10 ** 15); expect(q.canSpend('a', 1)).toBe(true); expect(q.evaluate('a', 1)).toMatchObject({ fits: true, mode: 'unlimited', limitBytes: null, remainingBytes: null }); });
  it('contas não se misturam', () => { const { s, q } = mk(at(2026, 1, 10, 5)); s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 }); q.record('a', 100); expect(q.canSpend('b', 100)).toBe(true); });
});
```
(No teste da virada do dia, exponha `db` como `readonly db` público no serviço para simplificar: `new QuotaService(q.db, s, …)`.)

- [ ] **Step 2: Rodar — falha. Step 3: Implementar**
```ts
import type { Db } from '../db';
import type { QuotaSettings, SettingsRepo } from '../settings/repo';
const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(nowMs: number, resetHour: number): string { const d = new Date(nowMs - resetHour * 3_600_000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function nextResetAt(nowMs: number, resetHour: number): number { const d = new Date(nowMs); d.setHours(resetHour, 0, 0, 0); if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1); return d.getTime(); }
export class QuotaService {
  constructor(readonly db: Db, private settingsRepo: SettingsRepo, private now: () => number = Date.now) {}
  settings(): QuotaSettings { return this.settingsRepo.quota(); }
  used(accountId: string): number { const r = this.db.prepare('SELECT bytes FROM quota_usage WHERE account_id = ? AND day_key = ?').get(accountId, dayKey(this.now(), this.settings().resetHour)) as { bytes: number } | undefined; return r?.bytes ?? 0; }
  canSpend(accountId: string, bytes: number): boolean { const s = this.settings(); if (s.mode === 'unlimited') return true; const used = this.used(accountId); if (used === 0 && bytes > s.limitBytes) return true; return used + bytes <= s.limitBytes; }
  record(accountId: string, bytes: number): void { this.db.prepare('INSERT INTO quota_usage(account_id, day_key, bytes) VALUES(?,?,?) ON CONFLICT(account_id, day_key) DO UPDATE SET bytes = bytes + excluded.bytes').run(accountId, dayKey(this.now(), this.settings().resetHour), bytes); }
  evaluate(accountId: string, bytes: number) { const s = this.settings(); const usedBytes = this.used(accountId); const unlimited = s.mode === 'unlimited'; return { fits: this.canSpend(accountId, bytes), mode: s.mode, usedBytes, limitBytes: unlimited ? null : s.limitBytes, remainingBytes: unlimited ? null : Math.max(0, s.limitBytes - usedBytes), resetAt: new Date(nextResetAt(this.now(), s.resetHour)).toISOString() }; }
}
```
- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(quota): cota diária por conta — modo limite (pausa até renovar) e sem limite"`

---

### Task 13: Repositório de jobs, inventário, pastas e cópias

**Files:**
- Create: `server/src/jobs/repo.ts`
- Test: `server/src/jobs/repo.test.ts`

**Interfaces:**
```ts
export interface NewJob { name: string; srcFolderId: string; srcReaderAccountId: string; destAccountId: string; destParentId: string; destParentName: string; destFinalName: string; path: JobPath; mode: JobMode; destFolderId?: string | null; fileFilter?: string[] | null }
export interface NewJobFile { relPath: string; srcId: string; name: string; mimeType: string; size: number; md5: string | null; status?: FileStatus; lastError?: string | null }
export class JobsRepo {
  constructor(db: Db)
  create(j: NewJob): JobRow; get(id): JobRow | null; list(): JobRow[]; listByStatus(st: JobStatus[]): JobRow[]
  update(id, patch: Partial<Omit<JobRow,'id'>>): void; remove(id): void
  insertFiles(jobId, files: NewJobFile[]): void      // transação; atualiza total_files/total_bytes (só pendentes) e skipped_files (pré-marcados)
  nextPending(jobId, limit, nowMs): JobFileRow[]      // pending OU deferred vencido; ORDER BY attempts, rel_path
  countPending(jobId): { pending: number; deferredFuture: number; minDeferredUntil: number | null }
  setFile(jobId, relPath, patch: Partial<JobFileRow>): void
  recount(jobId): void                                // done_files/done_bytes/skipped_files/deferred_files a partir de job_files
  files(jobId, status?: FileStatus, limit?, offset?): JobFileRow[]; fileCounts(jobId): Record<FileStatus, number>
  folder(jobId, relPath): string | null; setFolder(jobId, relPath, destId): void
  upsertCopy(c: { srcFolderId; srcReaderAccountId; destFolderId; destAccountId; name; path }): CopyRow
  copies(): CopyRow[]; copy(id): CopyRow | null; touchCopy(id, p: { checked?: boolean; synced?: boolean }): void; removeCopy(id): void
}
```

- [ ] **Step 1: Testes** (`repo.test.ts`)
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { JobsRepo } from './repo';
const base = { name: 'J', srcFolderId: 's', srcReaderAccountId: 'a', destAccountId: 'a', destParentId: 'p', destParentName: 'P', destFinalName: 'J', path: 'rift' as const, mode: 'copy' as const };
describe('JobsRepo', () => {
  it('cria queued, insere inventário e soma totais só do que é pendente', () => {
    const r = new JobsRepo(openDb(':memory:')); const j = r.create(base);
    expect(j.status).toBe('queued');
    r.insertFiles(j.id, [{ relPath: 'a', srcId: '1', name: 'a', mimeType: 'x', size: 10, md5: null }, { relPath: 'b', srcId: '2', name: 'b', mimeType: 'x', size: 5, md5: null, status: 'skipped_blocked' }]);
    expect(r.get(j.id)).toMatchObject({ total_files: 1, total_bytes: 10, skipped_files: 1 });
  });
  it('nextPending prioriza menos tentativas e inclui deferidos vencidos', () => {
    const r = new JobsRepo(openDb(':memory:')); const j = r.create(base);
    r.insertFiles(j.id, [{ relPath: 'a', srcId: '1', name: 'a', mimeType: 'x', size: 1, md5: null }, { relPath: 'b', srcId: '2', name: 'b', mimeType: 'x', size: 1, md5: null }, { relPath: 'c', srcId: '3', name: 'c', mimeType: 'x', size: 1, md5: null }]);
    r.setFile(j.id, 'a', { attempts: 2 }); r.setFile(j.id, 'c', { status: 'deferred', deferred_until: 1000 });
    expect(r.nextPending(j.id, 10, 500).map((f) => f.rel_path)).toEqual(['b', 'a']);
    expect(r.nextPending(j.id, 10, 2000).map((f) => f.rel_path)).toEqual(['b', 'c', 'a']);
    expect(r.countPending(j.id)).toEqual({ pending: 2, deferredFuture: 1, minDeferredUntil: 1000 });
  });
  it('recount, fileCounts e cascata', () => {
    const r = new JobsRepo(openDb(':memory:')); const j = r.create(base);
    r.insertFiles(j.id, [{ relPath: 'a', srcId: '1', name: 'a', mimeType: 'x', size: 10, md5: null }, { relPath: 'b', srcId: '2', name: 'b', mimeType: 'x', size: 5, md5: null }]);
    r.setFile(j.id, 'a', { status: 'done', dest_id: 'd1' }); r.recount(j.id);
    expect(r.get(j.id)).toMatchObject({ done_files: 1, done_bytes: 10 }); expect(r.fileCounts(j.id)).toMatchObject({ done: 1, pending: 1 });
    r.setFolder(j.id, 'M1', 'f1'); expect(r.folder(j.id, 'M1')).toBe('f1'); r.remove(j.id); expect(r.list()).toHaveLength(0);
  });
  it('copies: upsert por (origem, destino)', () => {
    const r = new JobsRepo(openDb(':memory:'));
    const c1 = r.upsertCopy({ srcFolderId: 's', srcReaderAccountId: 'a', destFolderId: 'd', destAccountId: 'a', name: 'N', path: 'rift' });
    const c2 = r.upsertCopy({ srcFolderId: 's', srcReaderAccountId: 'a', destFolderId: 'd', destAccountId: 'a', name: 'N2', path: 'rift' });
    expect(c1.id).toBe(c2.id); expect(r.copies()[0].name).toBe('N2'); r.touchCopy(c1.id, { synced: true }); expect(r.copy(c1.id)?.last_synced_at).toBeTruthy();
  });
});
```
- [ ] **Step 2: Rodar — falha. Step 3: Implementar** — SQL direto (`INSERT … RETURNING` não é necessário; `get` após `run`). `update` monta `SET k = ?` a partir das chaves do patch (lista branca = colunas de `JobRow`). `nextPending`: `WHERE job_id = ? AND (status = 'pending' OR (status = 'deferred' AND deferred_until <= ?)) ORDER BY attempts ASC, rel_path ASC LIMIT ?`. `countPending`: `SUM(status='pending')`, `SUM(status='deferred' AND deferred_until > ?)`, `MIN(CASE WHEN status='deferred' THEN deferred_until END)` — como `countPending(jobId)` não recebe `now`, use `Date.now()` internamente via `now` injetado no construtor (`constructor(db, now = Date.now)`). `upsertCopy`: `INSERT … ON CONFLICT(src_folder_id, dest_folder_id) DO UPDATE SET name = excluded.name, path = excluded.path` e lê de volta por `(src, dest)`.
- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(jobs): repositório de jobs, inventário por arquivo, pastas espelhadas e cópias registradas"`

---

### Task 14: Desfechos, laço de execução e caminho rift (`runRift`)

**Files:**
- Create: `server/src/drive/outcomes.ts`, `server/src/drive/run-loop.ts`, `server/src/drive/copier.ts`
- Test: `server/src/drive/outcomes.test.ts`, `server/src/drive/copier.test.ts`

**Interfaces:**
```ts
// outcomes.ts
export type PauseKind = 'quota' | 'auth' | 'storage' | 'offline';
export interface PauseReason { kind: PauseKind; until: number | null; message: string }
export class JobPaused extends Error { constructor(public reason: PauseReason) }
export type FileOutcome = { status: 'done'; destId: string; bytes: number } | { status: 'skipped_blocked' | 'skipped_native' | 'missing' | 'failed'; error?: string } | { status: 'deferred'; until: number; error?: string }
export type Failure = 'transient' | 'pause_quota' | 'pause_auth' | 'pause_storage' | 'pause_offline' | 'blocked' | 'missing' | 'deferred' | 'fatal';
export function classifyFailure(err: unknown): Failure
export const HOUR = 3_600_000; export const DAY = 24 * HOUR;
// run-loop.ts
export interface RunContext { job: JobRow; repo: JobsRepo; quota: QuotaService; signal: AbortSignal; now: () => number; concurrency: number; onProgress?: (deltaBytes: number) => void }
export type RunResult = { kind: 'completed' } | { kind: 'paused'; reason: PauseReason } | { kind: 'aborted' }
export async function runLoop(ctx: RunContext, processFile: (file: JobFileRow) => Promise<FileOutcome>): Promise<RunResult>
export async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void>
// copier.ts
export async function runRift(ctx: RunContext & { client: DriveClient }): Promise<RunResult>
export class FolderMirror { constructor(client: DriveClient, repo: JobsRepo, job: JobRow); ensure(relDir: string): Promise<string>; siblings(destFolderId: string): Promise<Map<string, DriveFile[]>> }
```
Regras de `runLoop`:
1. Se `signal.aborted` → `aborted`.
2. `batch = repo.nextPending(job.id, concurrency * 2, now())`. Vazio → `countPending`: `pending === 0 && deferredFuture === 0` → `completed`; só deferidos futuros → `paused {kind:'quota', until: minDeferredUntil, message: t.jobs.waitingDownloadQuota}`.
3. Para cada arquivo (pool): `quota.canSpend(dest, size)` senão `JobPaused quota` com `until = nextResetAt` (modo limite) — em modo sem limite nunca pausa aqui. Chama `processFile`; aplica o desfecho em `job_files` (`done` → `dest_id`, `quota.record`, `onProgress(size)`; `deferred` → `deferred_until`; demais → status + `last_error`); `transient` (lançado por `processFile` como erro não-classificado-fatal) → `attempts++`, conta transitórios consecutivos no job; **3 seguidos** → `JobPaused {kind:'quota', until: now+HOUR, message: t.jobs.rateLimited}`; sucesso zera o contador.
4. `JobPaused` de qualquer worker → espera o pool e retorna `paused`. Erros de pausa classificados (`pause_auth`/`pause_storage`/`pause_offline`) são convertidos em `JobPaused` pelo próprio laço via `classifyFailure`: `auth → until null`, `storage → until null`, `offline → until now + 60_000`.
5. Após cada lote: `repo.recount(job.id)`. Volta ao passo 1.

`processFile` do rift (`copier.ts`): `parentId = mirror.ensure(dirname(relPath))`; em `mode === 'merge'`: `same = siblings.get(name)` com mesmo `md5` (ou mesmo `size` quando sem md5) → `done` sem copiar (dest_id = existente); se existe com conteúdo diferente → `client.rename(existing.id, \`${name} (versão anterior)\`)` e segue; `client.copyFile(src_id, name, parentId)` → `done`. Erros: `classifyFailure` → `blocked → skipped_blocked`, `missing → missing`, `deferred → {deferred, until: now + DAY}`, `fatal → failed`, pausas → relança (`JobPaused`), `transient` → relança o erro original (o laço trata).

`FolderMirror.ensure(relDir)`: `''` → `job.dest_folder_id`; percorre segmentos acumulando; cache em memória + `job_folders`; em `merge`, antes de criar procura pasta homônima nos filhos do pai (`listChildren`), senão `createFolder`.

- [ ] **Step 1: Testes**

`outcomes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DriveError, NetworkError } from './errors';
import { OAuthError } from '../auth/oauth';
import { classifyFailure } from './outcomes';
const e = (s: number, r: string, m = '') => new DriveError(s, r, m);
describe('classifyFailure', () => {
  it.each([
    [e(401, 'authError'), 'pause_auth'], [new OAuthError('invalid_grant', ''), 'pause_auth'],
    [e(403, 'storageQuotaExceeded'), 'pause_storage'], [e(403, 'downloadQuotaExceeded'), 'deferred'],
    [e(403, 'cannotCopyFile'), 'blocked'], [e(404, 'notFound'), 'missing'], [e(403, 'dailyLimitExceeded'), 'pause_quota'],
    [e(429, 'rateLimitExceeded'), 'transient'], [e(403, 'userRateLimitExceeded'), 'transient'], [new NetworkError('ECONNRESET'), 'pause_offline'],
    [e(400, 'badRequest'), 'fatal'], [new Error('x'), 'fatal'],
  ])('%o → %s', (err, kind) => expect(classifyFailure(err)).toBe(kind));
});
```
`copier.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { JobsRepo } from '../jobs/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { listTree } from './tree';
import { runRift } from './copier';

async function world(opts: { quotaLimit?: number } = {}) {
  const fake = new FakeDrive(); fake.account('me', 'me@x.com'); const db = openDb(':memory:'); const settings = new SettingsRepo(db);
  if (opts.quotaLimit) settings.setQuota({ mode: 'limit', limitBytes: opts.quotaLimit, resetHour: 4 });
  let now = new Date(2026, 0, 10, 5).getTime();
  const quota = new QuotaService(db, settings, () => now); const repo = new JobsRepo(db, () => now);
  const client = new DriveClient('me', { getAccessToken: async () => 'tok-me', invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });
  const src = fake.addFolder({ name: 'Curso', parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
  const m1 = fake.addFolder({ name: 'M1', parentId: src.id, owner: 'd@x.com' });
  fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'd@x.com', content: '12345' });
  fake.addFile({ name: 'b.mp4', parentId: m1.id, owner: 'd@x.com', content: '678' });
  fake.addFile({ name: 'c.pdf', parentId: src.id, owner: 'd@x.com', content: 'pp', canCopy: false });
  const dest = fake.addFolder({ name: 'Curso (copiando…)', parentId: fake.rootOf('me'), owner: 'me@x.com', readers: ['me'] });
  const job = repo.create({ name: 'Curso', srcFolderId: src.id, srcReaderAccountId: 'me', destAccountId: 'me', destParentId: fake.rootOf('me'), destParentName: 'Meu Drive', destFinalName: 'Curso', path: 'rift', mode: 'copy', destFolderId: dest.id });
  const tree = await listTree(client, src.id);
  repo.insertFiles(job.id, tree.files.map((f) => ({ relPath: f.relPath, srcId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5, status: f.canCopy ? 'pending' : 'skipped_blocked' })));
  const run = (signal = new AbortController().signal) => runRift({ job: repo.get(job.id)!, repo, quota, signal, now: () => now, concurrency: 2, client });
  return { fake, repo, quota, job, dest, run, client, src, setNow: (ms: number) => { now = ms; } };
}

describe('runRift', () => {
  it('espelha a árvore, copia o que pode, pula bloqueado, registra cota', async () => {
    const w = await world();
    expect(await w.run()).toEqual({ kind: 'completed' });
    expect(w.fake.byPath(w.dest.id, 'M1/a.mp4')?.content.toString()).toBe('12345');
    expect(w.fake.byPath(w.dest.id, 'M1/b.mp4')).not.toBeNull();
    expect(w.fake.byPath(w.dest.id, 'c.pdf')).toBeNull();
    const j = w.repo.get(w.job.id)!; expect(j).toMatchObject({ done_files: 2, done_bytes: 8, skipped_files: 1 });
    expect(w.quota.used('me')).toBe(8);
    expect(w.repo.folder(w.job.id, 'M1')).toBe(w.fake.byPath(w.dest.id, 'M1')!.id);
  });
  it('retomada: o que já está done não é copiado de novo nem a pasta recriada', async () => {
    const w = await world(); const ac = new AbortController();
    w.repo.setFile(w.job.id, 'M1/a.mp4', { status: 'done', dest_id: 'x' });
    expect(await w.run(ac.signal)).toEqual({ kind: 'completed' });
    expect(w.fake.children(w.fake.byPath(w.dest.id, 'M1')!.id).map((n) => n.name)).toEqual(['b.mp4']);
  });
  it('cota do dia estourada pausa até a renovação', async () => {
    const w = await world({ quotaLimit: 6 });
    const r = await w.run(); expect(r.kind).toBe('paused'); if (r.kind === 'paused') { expect(r.reason.kind).toBe('quota'); expect(r.reason.until).toBe(new Date(2026, 0, 11, 4).getTime()); }
    expect(w.repo.get(w.job.id)!.done_files).toBe(1);
  });
  it('downloadQuotaExceeded adia o arquivo por 24h e segue com os outros', async () => {
    const w = await world(); w.fake.failNext({ reason: 'downloadQuotaExceeded', urlIncludes: '/copy' });
    const r = await w.run(); expect(r.kind).toBe('paused'); if (r.kind === 'paused') expect(r.reason.until).toBeGreaterThan(Date.now());
    const files = w.repo.files(w.job.id); expect(files.filter((f) => f.status === 'done')).toHaveLength(1); expect(files.filter((f) => f.status === 'deferred')).toHaveLength(1);
  });
  it('conta desconectada pausa por auth', async () => {
    const w = await world(); w.fake.failNext({ reason: 'authError', status: 401, times: 5 });
    const r = await w.run(); expect(r.kind).toBe('paused'); if (r.kind === 'paused') expect(r.reason.kind).toBe('auth');
  });
  it('destino cheio pausa por storage; abort devolve aborted', async () => {
    const w = await world(); w.fake.setStorageFull('me', true);
    const r = await w.run(); expect(r.kind).toBe('paused'); if (r.kind === 'paused') expect(r.reason.kind).toBe('storage');
    const w2 = await world(); const ac = new AbortController(); ac.abort(); expect(await w2.run(ac.signal)).toEqual({ kind: 'aborted' });
  });
  it('merge: igual é pulado sem copiar; diferente renomeia o antigo para "(versão anterior)"', async () => {
    const w = await world();
    const m1 = w.fake.addFolder({ name: 'M1', parentId: w.dest.id, owner: 'me@x.com' });
    w.fake.addFile({ name: 'a.mp4', parentId: m1.id, owner: 'me@x.com', content: '12345' });
    w.fake.addFile({ name: 'b.mp4', parentId: m1.id, owner: 'me@x.com', content: 'OLD' });
    w.repo.update(w.job.id, { mode: 'merge' });
    expect(await w.run()).toEqual({ kind: 'completed' });
    const names = w.fake.children(m1.id).map((n) => n.name).sort();
    expect(names).toEqual(['a.mp4', 'b.mp4', 'b.mp4 (versão anterior)'].sort());
    expect(w.fake.children(m1.id).filter((n) => n.name === 'a.mp4')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar — falha. Step 3: Implementar** `outcomes.ts`:
```ts
import { isAuthExpired, isBlocked, isDailyLimit, isDownloadQuota, isNotFound, isStorageFull, isTransient, NetworkError } from './errors';
export type PauseKind = 'quota' | 'auth' | 'storage' | 'offline';
export interface PauseReason { kind: PauseKind; until: number | null; message: string; }
export class JobPaused extends Error { constructor(public reason: PauseReason) { super(reason.message); } }
export type FileOutcome = { status: 'done'; destId: string; bytes: number } | { status: 'skipped_blocked' | 'skipped_native' | 'missing' | 'failed'; error?: string } | { status: 'deferred'; until: number; error?: string };
export type Failure = 'transient' | 'pause_quota' | 'pause_auth' | 'pause_storage' | 'pause_offline' | 'blocked' | 'missing' | 'deferred' | 'fatal';
export const HOUR = 3_600_000; export const DAY = 24 * HOUR;
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
```
`run-loop.ts` e `copier.ts` conforme as regras acima (strings novas em `jobs`: `waitingDownloadQuota: 'Alguns arquivos atingiram a cota de download do Google; retomo quando ela renovar (~24 h).'`, `rateLimited: 'O Google está limitando as chamadas; retomo em 1 hora.'`, `quotaDay: (h) => \`Cota do dia atingida; retomo às ${h}.\``, `dailyLimit: 'O Google cortou o volume do dia; tento de novo em 1 hora.'`, `auth: 'A conta do Google desconectou. Reconecte para continuar.'`, `storage: 'O Drive de destino está sem espaço. Libere espaço e retome.'`, `offline: 'Sem conexão. Retomo quando a rede voltar.'`). Em `pause_quota` por `isDailyLimit`: `until = now + HOUR` (modo sem limite ou limite — o Google é quem mandou).

- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(motor): laço de execução com pausas e cópia pelo rift (espelho de pastas, bloqueados, merge)"`

---

### Task 15: Caminho pela máquina (`runMachine` / `transferOneFile`)

**Files:**
- Create: `server/src/drive/transfer.ts`
- Test: `server/src/drive/transfer.test.ts`

**Interfaces:**
```ts
export const CHUNK_SIZE = 16 * 1024 * 1024;   // múltiplo de 256 KiB, exigência do upload retomável
export interface TransferDeps { reader: DriveClient; writer: DriveClient; repo: JobsRepo; job: JobRow; chunkSize?: number; onBytes?: (n: number) => void }
export async function transferOneFile(d: TransferDeps, file: JobFileRow, parentId: string): Promise<FileOutcome>
export async function runMachine(ctx: RunContext & { reader: DriveClient; writer: DriveClient; chunkSize?: number }): Promise<RunResult>
```
Fluxo de `transferOneFile`: nativo → `skipped_native`; `size === 0` → `writer.createEmptyFile` → `done`; se `file.upload_uri` → `writer.uploadStatus` (404/410 → sessão nova; `done` → retorna); senão `createUploadSession` + `repo.setFile({upload_uri, bytes_uploaded: 0})`; `received` = recebido; `res = reader.download(src_id, received)`; se `res.status === 200 && received > 0` descarta `received` bytes do stream; itera `res.body` acumulando num buffer; a cada `>= chunkSize` envia **exatamente** `chunkSize` bytes (`uploadChunk`), atualiza `bytes_uploaded`, `onBytes`; no fim envia o resto; `done` com `dest_id`. Erros: `classifyFailure` como no rift (bloqueado → `skipped_blocked`, etc.).

- [ ] **Step 1: Testes**
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { JobsRepo } from '../jobs/repo';
import { QuotaService } from './quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from './client';
import { runMachine, transferOneFile } from './transfer';

function world(content = 'x'.repeat(2_500_000)) {
  const fake = new FakeDrive(); fake.account('old', 'old@x.com'); fake.account('new', 'new@x.com'); const db = openDb(':memory:');
  const repo = new JobsRepo(db); const quota = new QuotaService(db, new SettingsRepo(db));
  const client = (id: string) => new DriveClient(id, { getAccessToken: async () => `tok-${id}`, invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });
  const src = fake.addFolder({ name: 'Backup', parentId: 'ext', owner: 'old@x.com', readers: ['old'] });
  const big = fake.addFile({ name: 'big.bin', parentId: src.id, owner: 'old@x.com', content });
  fake.addFile({ name: 'empty.txt', parentId: src.id, owner: 'old@x.com', content: Buffer.alloc(0) });
  fake.addNative({ name: 'Doc', parentId: src.id, owner: 'old@x.com', mimeType: 'application/vnd.google-apps.document' });
  const dest = fake.addFolder({ name: 'Backup (copiando…)', parentId: fake.rootOf('new'), owner: 'new@x.com', readers: ['new'] });
  const job = repo.create({ name: 'Backup', srcFolderId: src.id, srcReaderAccountId: 'old', destAccountId: 'new', destParentId: fake.rootOf('new'), destParentName: 'Meu Drive', destFinalName: 'Backup', path: 'machine', mode: 'copy', destFolderId: dest.id });
  repo.insertFiles(job.id, [
    { relPath: 'big.bin', srcId: big.id, name: 'big.bin', mimeType: 'application/octet-stream', size: content.length, md5: null },
    { relPath: 'empty.txt', srcId: fake.children(src.id).find((n) => n.name === 'empty.txt')!.id, name: 'empty.txt', mimeType: 'text/plain', size: 0, md5: null },
    { relPath: 'Doc', srcId: fake.children(src.id).find((n) => n.name === 'Doc')!.id, name: 'Doc', mimeType: 'application/vnd.google-apps.document', size: 0, md5: null },
  ]);
  return { fake, repo, quota, job, dest, reader: client('old'), writer: client('new'), big, content };
}

describe('transferOneFile', () => {
  it('sobe em blocos de 1 MiB, persistindo o progresso, e conclui', async () => {
    const w = world(); const file = w.repo.files(w.job.id).find((f) => f.rel_path === 'big.bin')!; const seen: number[] = [];
    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job, chunkSize: 1024 * 1024, onBytes: (n) => seen.push(n) }, file, w.dest.id);
    expect(out.status).toBe('done'); expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe(w.content);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(w.content.length);
    expect(w.fake.calls.filter((c) => c.method === 'PUT')).toHaveLength(3);
  });
  it('retoma do meio: sessão guardada + Range no download', async () => {
    const w = world(); const file = w.repo.files(w.job.id).find((f) => f.rel_path === 'big.bin')!;
    const uri = await w.writer.createUploadSession({ name: 'big.bin', parentId: w.dest.id, mimeType: 'application/octet-stream', size: w.content.length });
    await w.writer.uploadChunk(uri, Buffer.from(w.content.slice(0, 1024 * 1024)), 0, w.content.length);
    w.repo.setFile(w.job.id, 'big.bin', { upload_uri: uri, bytes_uploaded: 1024 * 1024 });
    w.fake.calls.length = 0;
    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job, chunkSize: 1024 * 1024 }, w.repo.files(w.job.id).find((f) => f.rel_path === 'big.bin')!, w.dest.id);
    expect(out.status).toBe('done'); expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe(w.content);
    expect(w.fake.calls.find((c) => c.url.includes('alt=media'))).toBeTruthy();
    expect(w.fake.calls.filter((c) => c.method === 'POST' && c.url.includes('uploadType=resumable'))).toHaveLength(0);
  });
  it('sessão expirada recomeça o arquivo', async () => {
    const w = world('abc'); const uri = await w.writer.createUploadSession({ name: 'big.bin', parentId: w.dest.id, mimeType: 'application/octet-stream', size: 3 });
    w.repo.setFile(w.job.id, 'big.bin', { upload_uri: uri, bytes_uploaded: 2 }); w.fake.expireSession(uri);
    const out = await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.repo.files(w.job.id).find((f) => f.rel_path === 'big.bin')!, w.dest.id);
    expect(out.status).toBe('done'); expect(w.fake.byPath(w.dest.id, 'big.bin')?.content.toString()).toBe('abc');
  });
  it('vazio vira arquivo vazio; nativo fica de fora com motivo', async () => {
    const w = world('a');
    expect((await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.repo.files(w.job.id).find((f) => f.rel_path === 'empty.txt')!, w.dest.id)).status).toBe('done');
    expect(w.fake.byPath(w.dest.id, 'empty.txt')).not.toBeNull();
    expect((await transferOneFile({ reader: w.reader, writer: w.writer, repo: w.repo, job: w.job }, w.repo.files(w.job.id).find((f) => f.rel_path === 'Doc')!, w.dest.id)).status).toBe('skipped_native');
  });
});
describe('runMachine', () => {
  it('conclui o job inteiro', async () => {
    const w = world('abc');
    const r = await runMachine({ job: w.job, repo: w.repo, quota: w.quota, signal: new AbortController().signal, now: Date.now, concurrency: 2, reader: w.reader, writer: w.writer, chunkSize: 1024 * 1024 });
    expect(r).toEqual({ kind: 'completed' });
    expect(w.repo.fileCounts(w.job.id)).toMatchObject({ done: 2, skipped_native: 1 });
  });
});
```
- [ ] **Step 2: Rodar — falha. Step 3: Implementar** (núcleo do stream):
```ts
async function pump(res: Response, skip: number, chunkSize: number, send: (chunk: Uint8Array) => Promise<void>): Promise<void> {
  if (!res.body) return;
  let pending: Uint8Array[] = []; let pendingLen = 0; let toSkip = skip;
  const flush = async (exact: boolean) => {
    while (pendingLen >= chunkSize || (!exact && pendingLen > 0)) {
      const take = exact || pendingLen >= chunkSize ? Math.min(chunkSize, pendingLen) : pendingLen;
      const out = new Uint8Array(take); let off = 0;
      while (off < take) { const head = pending[0]; const n = Math.min(head.byteLength, take - off); out.set(head.subarray(0, n), off); off += n; if (n === head.byteLength) pending.shift(); else pending[0] = head.subarray(n); }
      pendingLen -= take; await send(out);
      if (!exact) break;
    }
  };
  for await (const raw of res.body as AsyncIterable<Uint8Array>) {
    let chunk = raw; if (toSkip > 0) { const n = Math.min(toSkip, chunk.byteLength); chunk = chunk.subarray(n); toSkip -= n; if (!chunk.byteLength) continue; }
    pending.push(chunk); pendingLen += chunk.byteLength; await flush(true);
  }
  await flush(false);
}
```
e `transferOneFile` usando `pump` com `send = async (c) => { const r = await writer.uploadChunk(uri, c, offset, size); offset += c.byteLength; repo.setFile(job.id, file.rel_path, { bytes_uploaded: offset }); onBytes?.(c.byteLength); if (r.done) destId = r.file.id; }`. `runMachine` = `runLoop(ctx, (file) => transferOneFile({...}, file, await mirror.ensure(dirname)))` reutilizando `FolderMirror` com `ctx.writer`.
- [ ] **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(motor): transferência entre contas pela máquina com upload retomável por blocos"`

---

### Task 16: Motor de jobs (`JobEngine`) e nomes da pasta de destino

**Files:**
- Create: `server/src/jobs/naming.ts`, `server/src/jobs/engine.ts`
- Test: `server/src/jobs/engine.test.ts`

**Interfaces:**
```ts
// naming.ts
export const WORKING_SUFFIX = ' (copiando…)';
export function workingName(finalName: string): string
export async function ensureDestFolder(job: JobRow, client: DriveClient, repo: JobsRepo): Promise<string>   // cria "{final} (copiando…)" se dest_folder_id null (modo copy); grava no job
export async function finalizeName(job: JobRow, client: DriveClient): Promise<void>                       // renomeia para dest_final_name (só se o nome atual tem o sufixo)
// engine.ts
export interface EngineDeps { repo: JobsRepo; accountsRepo: AccountsRepo; clientFor: (accountId: string) => DriveClient; quota: QuotaService; now?: () => number; log?: (m: string) => void; runners?: { rift: typeof runRift; machine: typeof runMachine }; concurrency?: { rift: number; machine: number } }
export interface JobStats { bytesPerSec: number; etaSec: number | null }
export class JobEngine {
  constructor(deps: EngineDeps)
  start(intervalMs?: number): void; stop(): void
  recoverOnBoot(): void
  tick(): Promise<void>                      // resolve quando o job iniciado neste tick termina (ou quando não há nada a fazer)
  pause(id: string): void; resume(id: string): void; cancel(id: string): void; remove(id: string): boolean
  stats(id: string): JobStats | null
  isRunning(id: string): boolean
}
```
Regras: um job `running` por vez; `tick`: (1) `paused_quota/paused_offline` com `paused_until <= now` → `queued`; (2) se nada rodando, pega o `queued` mais antigo e roda até retornar; `pause(id)` em job rodando → `pauseRequested + abort`; `cancel` → `cancelRequested + abort`; resultado `aborted` → `paused`/`canceled` conforme o pedido. `completed` → `finalizeName` (modo copy), `upsertCopy`, `touchCopy(synced)` (merge), `recount`, `status 'done'`, `finished_at`, `message = t.jobs.summary(done, skipped_blocked, skipped_native, missing, failed)`. `paused` → `status = 'paused_'+kind`, `paused_until`, `resume_reason = message`; `kind === 'auth'` → `accountsRepo.setStatus(dest, 'disconnected')` só se ainda não. Exceção inesperada → `failed` com `message`. `stats`: janela de 30 s de `(t, bytes)` alimentada por `onProgress`; `eta = (total - done) / bps`.

- [ ] **Step 1: Testes** (`engine.test.ts`) — com `FakeDrive`, dois jobs rift na fila, um com cota estourada:
```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { AccountsRepo } from '../auth/accounts';
import { QuotaService } from '../drive/quota';
import { FakeDrive } from '../test/fake-drive';
import { DriveClient } from '../drive/client';
import { listTree } from '../drive/tree';
import { JobsRepo } from './repo';
import { JobEngine } from './engine';

async function world(quotaLimit?: number) {
  const fake = new FakeDrive(); fake.account('me', 'me@x.com'); const db = openDb(':memory:'); const settings = new SettingsRepo(db);
  if (quotaLimit) settings.setQuota({ mode: 'limit', limitBytes: quotaLimit, resetHour: 4 });
  let now = new Date(2026, 0, 10, 5).getTime(); const nowFn = () => now;
  const repo = new JobsRepo(db, nowFn); const accountsRepo = new AccountsRepo(db); accountsRepo.insert({ email: 'me@x.com', refreshToken: 'rt-me', accessToken: 'tok-me', expiresAt: now + 1e9 });
  const me = accountsRepo.list()[0];
  const clientFor = () => new DriveClient('me', { getAccessToken: async () => 'tok-me', invalidate: () => {} }, fake.fetch, { sleep: async () => {}, maxRetries: 1 });
  const quota = new QuotaService(db, settings, nowFn);
  const engine = new JobEngine({ repo, accountsRepo, clientFor, quota, now: nowFn });
  const makeJob = async (name: string, files: string[]) => {
    const src = fake.addFolder({ name, parentId: 'ext', owner: 'd@x.com', readers: ['me'] });
    for (const f of files) fake.addFile({ name: f, parentId: src.id, owner: 'd@x.com', content: '12345' });
    const job = repo.create({ name, srcFolderId: src.id, srcReaderAccountId: me.id, destAccountId: me.id, destParentId: fake.rootOf('me'), destParentName: 'Meu Drive', destFinalName: name, path: 'rift', mode: 'copy' });
    const tree = await listTree(clientFor(), src.id);
    repo.insertFiles(job.id, tree.files.map((f) => ({ relPath: f.relPath, srcId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5 })));
    return job;
  };
  return { fake, repo, engine, makeJob, setNow: (ms: number) => { now = ms; } };
}

describe('JobEngine', () => {
  it('roda a fila em ordem, cria a pasta "(copiando…)" e renomeia ao concluir; registra a cópia', async () => {
    const w = await world(); const a = await w.makeJob('A', ['1.mp4']); const b = await w.makeJob('B', ['1.mp4', '2.mp4']);
    await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('done'); expect(w.repo.get(b.id)!.status).toBe('queued');
    await w.engine.tick(); expect(w.repo.get(b.id)!.status).toBe('done');
    expect(w.fake.children(w.fake.rootOf('me')).map((n) => n.name).sort()).toEqual(['A', 'B']);
    expect(w.repo.copies().map((c) => c.name).sort()).toEqual(['A', 'B']);
    expect(w.repo.get(b.id)!.message).toMatch(/2 arquivos/);
  });
  it('cota estourada pausa com horário e o tick após a renovação retoma', async () => {
    const w = await world(6); const a = await w.makeJob('A', ['1.mp4', '2.mp4']);
    await w.engine.tick(); const paused = w.repo.get(a.id)!; expect(paused.status).toBe('paused_quota'); expect(paused.paused_until).toBe(new Date(2026, 0, 11, 4).getTime());
    await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('paused_quota');
    w.setNow(new Date(2026, 0, 11, 5).getTime()); await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('done');
  });
  it('pause do usuário e resume; cancel', async () => {
    const w = await world(); const a = await w.makeJob('A', ['1.mp4']); w.engine.pause(a.id); expect(w.repo.get(a.id)!.status).toBe('paused');
    await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('paused');
    w.engine.resume(a.id); await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('done');
    const b = await w.makeJob('B', ['1.mp4']); w.engine.cancel(b.id); expect(w.repo.get(b.id)!.status).toBe('canceled'); expect(w.engine.remove(b.id)).toBe(true);
  });
  it('recoverOnBoot devolve running à fila', async () => {
    const w = await world(); const a = await w.makeJob('A', ['1.mp4']); w.repo.update(a.id, { status: 'running' }); w.engine.recoverOnBoot(); expect(w.repo.get(a.id)!.status).toBe('queued');
  });
  it('conta desconectada → paused_auth e conta marcada', async () => {
    const w = await world(); const a = await w.makeJob('A', ['1.mp4']); w.fake.failNext({ reason: 'authError', status: 401, times: 10 });
    await w.engine.tick(); expect(w.repo.get(a.id)!.status).toBe('paused_auth');
  });
});
```
- [ ] **Step 2: Rodar — falha. Step 3: Implementar** `naming.ts` e `engine.ts` conforme as regras. **Step 4: Rodar → PASS. Step 5: Commit** — `git commit -m "feat(jobs): motor com fila, pausas automáticas, retomada por horário e pasta de destino nomeada ao concluir"`

---

### Task 17: Re-sync — "Verificar novidades"

**Files:**
- Create: `server/src/drive/resync.ts`
- Test: `server/src/drive/resync.test.ts`

**Interfaces:**
```ts
export interface DiffFile { relPath: string; kind: 'new' | 'updated'; entry: TreeEntry }
export interface DiffGroup { folder: string; newFiles: number; updatedFiles: number; bytes: number; files: DiffFile[] }
export function diffTrees(src: Tree, dst: Tree): DiffGroup[]        // agrupa pela 1ª pasta; raiz = '(raiz)'
export class ResyncService {
  constructor(deps: { repo: JobsRepo; clientFor: (accountId: string) => DriveClient })
  check(copyId: string): Promise<{ groups: Omit<DiffGroup, 'files'>[] }>   // guarda o diff em memória para o sync
  sync(copyId: string, folders: string[]): Promise<JobRow>                 // cria job mode='merge' com os arquivos dos grupos escolhidos
}
```
- [ ] **Step 1: Testes** — origem com `M1/a` (igual), `M1/b` (md5 diferente), `M2/c` (novo), raiz `d` (novo); destino com `M1/a`, `M1/b` (velho). `diffTrees` → grupos `M1 {new 0, updated 1}`, `M2 {new 1}`, `(raiz) {new 1}`. `check` grava `last_checked_at`; `sync(['M1'])` cria job `merge` com 1 arquivo (`M1/b`), `dest_folder_id = copy.dest_folder_id`; sync de grupo não checado → erro "faça a verificação primeiro".
- [ ] **Step 2–5:** implementar (`diffTrees`: mapa `relPath → entry` do destino; novo = ausente; atualizado = `md5` ambos presentes e diferentes, ou sem md5 e `size` diferente; nativos sem md5 nunca contam como atualizados), rodar, commit — `git commit -m "feat(resync): verificar novidades — diff origem × destino por md5 e sincronização seletiva por pasta"`.

---

## Fase 4 — API

### Task 18: Rotas de análise, pastas, jobs, cópias, configurações e cota; `deps` completo; boot do motor

**Files:**
- Create: `server/src/routes/inspect.ts`, `server/src/routes/jobs.ts`, `server/src/routes/copies.ts`, `server/src/routes/settings.ts`, `server/src/routes/quota.ts`
- Modify: `server/src/deps.ts` (acrescenta `jobsRepo`, `quota`, `clientFor`, `engine`, `inspections`, `resync`), `server/src/app.ts` (registra rotas), `server/src/index.ts` (`engine.recoverOnBoot(); engine.start()`; `engine.stop()` no shutdown), `server/src/routes/info.ts`
- Test: `server/src/routes/jobs.test.ts`, `server/src/routes/inspect.test.ts`, `server/src/routes/settings.test.ts`

**Interfaces (DTOs — espelhados em `web/src/api/client.ts`):**
```ts
export interface JobDto { id: string; name: string; path: 'rift'|'machine'; mode: 'copy'|'merge'; status: JobStatus; totals: { files: number; bytes: number }; done: { files: number; bytes: number }; skippedFiles: number; deferredFiles: number; message: string | null; pausedUntil: string | null; resumeReason: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; dest: { accountEmail: string; parentName: string; folderId: string | null; finalName: string }; source: { folderId: string; readerEmail: string }; stats: { bytesPerSec: number; etaSec: number | null } | null }
export interface JobFileDto { relPath: string; name: string; size: number; status: FileStatus; error: string | null; srcUrl: string; destUrl: string | null }
export interface CopyDto { id: string; name: string; path: JobPath; destFolderId: string; destAccountEmail: string; createdAt: string; lastCheckedAt: string | null; lastSyncedAt: string | null; destUrl: string }
export interface QuotaDto { mode: 'limit'|'unlimited'; limitBytes: number | null; usedBytes: number; remainingBytes: number | null; resetAt: string; accountEmail: string }
export interface SettingsDto { quotaMode: 'limit'|'unlimited'; quotaGb: number; quotaResetHour: number; defaultDest: { accountId: string; folderId: string; folderName: string } | null }
```
Rotas:
- `POST /api/inspect {link, destAccountId?, destParentId?, destParentName?}` → `{ inspectionId, ...InspectResult }` (destino padrão quando omitido: conta padrão + `root`/"Meu Drive"). Erros `InspectError` → 400 `{error, code}`; auth → 503 `{error, code:'auth'}`.
- `GET /api/drive/folders?accountId=&parentId=root` → `{ folders: [{id, name}] }` (só `FOLDER_MIME`, ordenadas).
- `GET /api/jobs` → `{ jobs: JobDto[] }` · `POST /api/jobs {inspectionId, name, destAccountId, destParentId, destParentName, conflict?: 'rename'|'merge'}` → cria o job a partir da inspeção em cache (`job_files` do `tree`: rift → `pending` se `canCopy` senão `skipped_blocked`; máquina → `skipped_native` para nativos, `skipped_blocked` se `!canDownload`); `conflict === 'merge'` → `mode='merge'`, `destFolderId = destConflict.existingFolderId`; `conflict === 'rename'` → `destFinalName` com sufixo `(2)`, `(3)`…; sem conflito nada muda. Inspeção expirada → 410 `{error: t.jobs.inspectionExpired}`.
- `GET /api/jobs/:id` → `{ job: JobDto, counts: Record<FileStatus, number> }` · `GET /api/jobs/:id/files?status=&limit=&offset=` → `{ files: JobFileDto[] }` (`srcUrl = https://drive.google.com/file/d/{src_id}/view`).
- `POST /api/jobs/:id/pause | resume | cancel` · `DELETE /api/jobs/:id` (409 se rodando).
- `GET /api/copies` · `POST /api/copies/:id/check` → `{ groups }` · `POST /api/copies/:id/sync {folders}` → `{ job: JobDto }` · `DELETE /api/copies/:id`.
- `GET /api/settings` · `PATCH /api/settings {quotaMode?, quotaGb?, quotaResetHour?, defaultDest?}`.
- `GET /api/quota?accountId=` → `QuotaDto` (padrão: conta de destino padrão; 404 sem contas).
- `GET /api/info` → `{ version, platform, configured: { client: boolean, accounts: number } }`.

- [ ] **Step 1: Testes de rota** — com `makeTestApp()` + `connectFakeAccount` + pasta compartilhada no FakeDrive: `inspect` devolve `path: 'rift'` e `inspectionId`; `POST /api/jobs` cria `queued` com `total_files` certo e `skipped_blocked` pré-marcado; `deps.engine.tick()` → `GET /api/jobs/:id` com `status 'done'` e `dest.folderId`; `conflict: 'rename'` gera `"Nome (2)"`; `PATCH /api/settings {quotaMode:'unlimited'}` reflete em `GET /api/quota` (`limitBytes: null`); `DELETE /api/jobs/:id` de job concluído → 200.
- [ ] **Step 2: Implementar** `deps.ts` completo:
```ts
const jobsRepo = overrides.jobsRepo ?? new JobsRepo(db);
const quota = overrides.quota ?? new QuotaService(db, settings);
const clientFor = overrides.clientFor ?? ((accountId: string) => new DriveClient(accountId, accounts, fetchFn));
const inspections = overrides.inspections ?? new InspectionCache();
const engine = overrides.engine ?? new JobEngine({ repo: jobsRepo, accountsRepo, clientFor, quota, log: (m) => console.log(`[motor] ${m}`) });
const resync = overrides.resync ?? new ResyncService({ repo: jobsRepo, clientFor });
```
`toJobDto(job, deps)` em `routes/jobs.ts` (exportado para `copies.ts`). `index.ts`: após `listen`, `deps.engine.recoverOnBoot(); deps.engine.start(1000);` e no shutdown `deps.engine.stop()`.
- [ ] **Step 3: Rodar toda a suíte → PASS. Step 4: Commit** — `git commit -m "feat(api): análise, jobs, cópias, configurações e cota; motor sobe com o servidor"`

---

## Fase 5 — Interface

### Task 19: Esqueleto da web — Vite, Tailwind com tokens, fontes, cliente da API, hooks, strings, marca

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/public/favicon.svg`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/src/i18n/strings.ts`, `web/src/api/client.ts`, `web/src/api/hooks.ts`, `web/src/components/Brand.tsx`, `web/src/components/Button.tsx`, `web/src/components/Field.tsx`, `web/src/components/PathChip.tsx`, `web/src/components/Banner.tsx`, `web/src/lib/format.ts`

**Interfaces:**
- `api.*`: `info()`, `authClient()`, `setAuthClient(id, secret)`, `loginStart(hint?)`, `loginStatus()`, `accounts()`, `removeAccount(id)`, `testAccount(id)`, `setDefaultAccount(id)`, `inspect(body)`, `folders(accountId, parentId)`, `jobs()`, `job(id)`, `jobFiles(id, status?)`, `createJob(body)`, `pauseJob/resumeJob/cancelJob/deleteJob(id)`, `copies()`, `checkCopy(id)`, `syncCopy(id, folders)`, `deleteCopy(id)`, `settings()`, `patchSettings(body)`, `quota(accountId?)`. Erros HTTP viram `ApiError {status, message, code?}` com a mensagem do servidor.
- Hooks: `useInfo`, `useAccounts`, `useJobs` (refetchInterval 2000 quando houver job `running`/`queued`), `useJob(id)`, `useJobFiles(id, status)`, `useCopies`, `useSettings`, `useQuota(accountId?)`, mutações invalidando `['jobs']`, `['accounts']`, `['quota']`, `['settings']`, `['copies']`, `['info']`.
- `format.ts`: `formatBytes(n)` ("48,2 GB" em pt-BR, base 1024), `formatEta(sec)` ("~2h40", "~35 min", "< 1 min"), `formatTime(iso)` ("04:00"), `formatDate(iso)` ("ontem", "28/07").
- Tailwind `theme.extend.colors`: `ink: '#0B1020'`, `surface: '#141A33'`, `surface2: '#1B2240'`, `line: 'rgba(255,255,255,0.08)'`, `fg: '#F5F3FF'`, `muted: 'rgba(245,243,255,0.6)'`, `violet: { DEFAULT: '#A78BFA', strong: '#C4B5FD' }`, `cyan: '#67E8F9'`, `amber: '#F2B134'`, `green: '#34D399'`, `red: '#F87171'`; `fontFamily.sans: ['"DM Sans"', 'system-ui', …]`, `fontFamily.mono: ['"JetBrains Mono"', 'ui-monospace', …]`. Dependências: `@fontsource/dm-sans`, `@fontsource/jetbrains-mono` (importadas em `main.tsx`).
- `vite.config.ts`: porta 5173, proxy `/api` → `http://localhost:7799`.
- `Brand`: lockup `Rift` (700) + `Drive` (400, opacidade .7) com o SVG do portal (`docs/brand/logo.svg` inline como componente `PortalMark`); prop `animated` faz a seta atravessar (keyframes, desligado sob `prefers-reduced-motion`).
- `PathChip path` → "pelo rift" (violeta) / "pela sua máquina" (âmbar) com `title` explicativo.
- `Banner tone="info"|"warn"|"error"` → superfície tingida (`bg-violet/10`, `bg-amber/10`, `bg-red/10`) **sem borda lateral**.

- [ ] **Steps:** criar arquivos; `App.tsx` com rotas `/`, `/configurar`, `/copia/:id`, `/configuracoes` (páginas placeholder que as Tasks 20–23 preenchem); `npm install`; `npm run build --workspace=web` → PASS; `node scripts/gerar-bundled.mjs` embute; commit — `git commit -m "feat(web): esqueleto da interface — tokens da marca, fontes, cliente da API e hooks"`.

---

### Task 20: Página de configuração inicial (assistente do OAuth)

**Files:**
- Create: `web/src/pages/Setup.tsx`, `web/src/pages/setup/steps.ts`

Conteúdo (fiel ao mockup `docs/brand/mockups/06-fluxos.html`): título "Antes de tudo: seu acesso ao Google"; parágrafo explicando por quê (sem servidor próprio; credencial que só o usuário tem; ~8 min; nada passa por terceiros); 5 passos com número/✓, links diretos:
1. Criar projeto → `https://console.cloud.google.com/projectcreate`
2. Ativar a Drive API → `https://console.cloud.google.com/apis/library/drive.googleapis.com`
3. Tela de consentimento: Externo e **publicar em produção** → `https://console.cloud.google.com/auth/audience` — `Banner tone="warn"` com o texto dos 7 dias; botão "Feito, publiquei"
4. Criar credencial OAuth tipo "App para computador" → `https://console.cloud.google.com/apis/credentials/oauthclient`
5. Colar ID e segredo (`Field`s) — validação local do sufixo `.apps.googleusercontent.com`
Botão "Validar e entrar com Google →": `setAuthClient` → `loginStart` → polling `loginStatus` a cada 1 s → `done` → etapa 2 de 2: "cristiano@… conectado — esta conta será o destino padrão", botões "Conectar outra conta" e "Começar a usar" (→ `/`). Erros do servidor em `Banner tone="error"`. Estado dos passos em `localStorage('riftdrive.setup.steps')` (try/catch). Link "Já tem um client? Pular para colar".

- [ ] **Steps:** implementar; `npm run build --workspace=web`; conferência manual com `npm run dev`; commit — `git commit -m "feat(web): assistente de primeira vez — OAuth client guiado e login pelo loopback"`.

---

### Task 21: Página inicial — caixa do link, análise inline e listas de cópias

**Files:**
- Create: `web/src/pages/Home.tsx`, `web/src/pages/home/AnalysisCard.tsx`, `web/src/pages/home/JobLists.tsx`, `web/src/components/JobCard.tsx`, `web/src/components/QuotaLine.tsx`, `web/src/components/FolderPicker.tsx`, `web/src/components/ShareRequest.tsx`

Comportamento:
- Sem client ou sem contas (`useInfo`) → redireciona para `/configurar`.
- Topbar: `Brand`, chip da conta de destino padrão (dropdown troca a padrão), ⚙ → `/configuracoes`.
- Hero: "O que vamos copiar hoje?" + input (cola link; `Enter`/"Analisar") + linha `QuotaLine` ("Cota de hoje: 288 GB restantes · renova às 04:00" ou "Sem limite de cota").
- `AnalysisCard` (após `inspect`): nome · `N arquivos · X GB · de dono@`; linha **Caminho**: `PathChip` + texto (rift: "Essa pasta está compartilhada com {dest}: a cópia acontece dentro do Google, sem passar pela sua máquina. Pode fechar o app no meio — ela continua." / máquina: `Banner tone="warn"` com "Essa pasta não está compartilhada com {dest}, então os arquivos vão baixar e subir pela sua máquina. Se o dono compartilhar a pasta com você, a cópia acontece dentro do Google — instantânea e sem usar sua internet." + `ShareRequest` (botão "Copiar pedido para enviar ao dono" → clipboard do `shareRequestText`)); **Bloqueados**: "N arquivos — o dono desativou cópia/download · ficarão de fora · copiável: X GB" + "ver quais" (expande `blocked.sample`); **Nativos** (máquina): "N documentos do Google ficam de fora (precisam de conversão)"; **Destino**: `select` de conta + `FolderPicker` (navega `folders(accountId, parentId)` com breadcrumb a partir de "Meu Drive") + campo nome (pré-preenchido); **Conflito**: se `destConflict`, radio "Usar outro nome ({nome} (2))" / "Mesclar dentro da pasta existente"; **Cota**: "Cabe na cota de hoje" / "Vai usar a cota de hoje e continuar amanhã às 04:00" / "Sem limite"; botões "Cancelar" e "Iniciar cópia →" (`createJob`). Durante a análise: "Lendo a pasta…" com spinner do portal.
- `JobLists`: seções "Em andamento" (`running`/`queued`), "Pausadas" (`paused*`), "Concluídas" (`done`/`canceled`/`failed`, colapsa em "ver todas (N)" acima de 5). `JobCard`: nome, `PathChip`, barra (gradiente ciano→violeta; âmbar quando pausada), `done/total arquivos · N bloqueados`, `X de Y GB`, velocidade/ETA na máquina, para pausadas o `resumeReason` ("Retoma sozinha às 04:00"), menu ⋯ (Pausar/Retomar/Cancelar/Remover/Abrir no Drive); clique → `/copia/:id`. Concluídas mostram "Verificar novidades" quando houver `copy` correspondente (via `useCopies`, casando por `dest.folderId`).

- [ ] **Steps:** implementar; build; conferência manual; commit — `git commit -m "feat(web): página inicial — análise inline do link com caminho, bloqueados, destino, cota e listas de cópias"`.

---

### Task 22: Página do job

**Files:**
- Create: `web/src/pages/Job.tsx`

Conteúdo: cabeçalho (← voltar, nome, `PathChip`, status em texto), barra grande, números (`done/total`, bytes, velocidade/ETA, iniciado em, concluído em), `Banner` com `resumeReason` quando pausada (auth → botão "Reconectar" que leva a `/configuracoes`), ações (Pausar/Retomar/Cancelar/Remover, "Abrir pasta no Drive" quando `dest.folderId`), abas de arquivos por estado (Pendentes · Concluídos · Bloqueados · Fora (nativos) · Faltando · Falhas) listando `JobFileDto` com link "abrir no Drive" (`srcUrl`), paginação por "carregar mais". Polling de `useJob` a cada 2 s enquanto ativo.

- [ ] **Steps:** implementar; build; commit — `git commit -m "feat(web): página do job — progresso, motivo da pausa, ações e arquivos por estado"`.

---

### Task 23: Configurações

**Files:**
- Create: `web/src/pages/Settings.tsx`

Seções (fiel ao mockup): **Cota diária** — explicação (~750 GB/dia do Google) e dois radios: "Limitar a [600] GB por dia · renova às [04]:00" (inputs numéricos; salva no blur) e "Sem limite" (texto explicando a pausa + retentativa a cada hora); **Contas do Google** — lista (`email`, chip conectada/desconectada "desde dd/mm", "destino padrão"), ações Testar · Reconectar (`loginStart(email)` + polling) · Remover (confirmação) · Tornar padrão, botão "+ Conectar outra conta"; **Cópia** — destino padrão (`FolderPicker`), texto fixo "Arquivos bloqueados pelo dono ficam de fora e aparecem na lista do job"; **Cópias registradas** — lista de `CopyDto` com "Verificar novidades" (mostra grupos com novos/atualizados e checkboxes → "Baixar selecionados") e "Esquecer".

- [ ] **Steps:** implementar; build; commit — `git commit -m "feat(web): configurações — cota (limite ou sem limite), contas, destino padrão e cópias registradas"`.

---

### Task 24: Documentos de design e produto; ícones

**Files:**
- Create: `PRODUCT.md`, `DESIGN.md`, `web/public/favicon.svg` (já na Task 19), `web/public/icon-512.svg`
- Modify: `web/index.html` (`theme-color #0B1020`, título "RiftDrive", favicon)

`PRODUCT.md`: o que é, para quem, promessa, princípios (caminho honesto; nunca apagar; progresso confiável; cota explícita; vocabulário), o que não é, voz (profissional, direta; "cota"; chips). `DESIGN.md`: tokens (cores com contraste medido sobre `#0B1020`: `fg` 17:1, `muted` ≥ 7:1, `violet.strong` ≥ 8:1, `amber` ≥ 9:1), tipografia (DM Sans 400/500/600/700; JetBrains Mono para números e caminhos), escala de espaçamento (4/8/12/16/24/32), raios (6/8/10/14), superfícies, estados (foco `ring-2 ring-violet`), motion (portal atravessando; 200 ms; `prefers-reduced-motion`), componentes (chips, banners sem borda lateral, cartões, barras), regras de copy.

- [ ] **Steps:** escrever; commit — `git commit -m "docs: PRODUCT.md e DESIGN.md do RiftDrive"`.

---

## Fase 6 — Distribuição

### Task 25: Empacotamento, instaladores, release e README

**Files:**
- Create: `scripts/empacotar.mjs`, `scripts/build-binario.mjs`, `scripts/definir-repo.mjs`, `install.sh`, `install.ps1`, `.github/workflows/release.yml`, `README.md`, `CLAUDE.md`

- [ ] **Step 1:** Copiar de `~/Documents/AI/learnflix-v2` os quatro scripts e os dois instaladores e o workflow, substituindo `learnflix` → `riftdrive`, `Learnflix` → `RiftDrive`, `LEARNFLIX_BASE_URL` → `RIFTDRIVE_BASE_URL`, repo `OnaitsirC-MiromA/learnflix-v2` → `OnaitsirC-MiromA/riftdrive`, pasta do Windows `Programs\Learnflix` → `Programs\RiftDrive`. Em `release.yml`, `npm test` continua (a raiz testa só o server). Rodar `npm run repo` para auditar consistência.
- [ ] **Step 2:** `README.md` (pt-BR, direto como o do Learnflix): o que faz (dois caminhos, com a frase "pelo rift nada passa pela sua máquina"), **Como rodar** (`npx riftdrive`, `curl … install.sh | sh`, `irm … install.ps1 | iex`), **Primeira vez** (o assistente e por que cada um cria o próprio client; o aviso do "Testing"), **Cota diária**, **O que fica de fora e por quê**, **Onde ficam os dados**, **Desenvolvimento** (`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run build:binario`), **Privacidade** (tokens só na sua máquina; nenhum servidor), licença MIT.
- [ ] **Step 3:** `CLAUDE.md` do repo: comandos, arquitetura em 10 linhas, convenções (inglês/português, zero nativos, strings centralizadas, "cota"), onde ficam specs/planos.
- [ ] **Step 4:** `npm run build` → `dist/riftdrive.cjs`; `OPEN_BROWSER=0 PORT=7899 RIFTDRIVE_DATA_DIR=/tmp/rd-smoke node dist/riftdrive.cjs &` → `curl :7899/api/health` → `{"ok":true}`; `curl :7899/` → HTML com `RiftDrive`; matar o processo.
- [ ] **Step 5: Commit** — `git commit -m "chore(dist): bundle único, executável SEA, instaladores de uma linha, release por tag e README"`

---

### Task 26: Verificação ponta a ponta local

- [ ] **Step 1:** `npm test` (server) → tudo verde; `npm run build` → web + server + bundle sem erros.
- [ ] **Step 2:** Subir `node dist/riftdrive.cjs` com `RIFTDRIVE_DATA_DIR` temporário; abrir no navegador (ou Playwright): a Home redireciona para `/configurar`; o assistente aceita um client id com formato válido e devolve erro claro do Google ao tentar logar sem rede/credencial real (comportamento esperado sem conta real).
- [ ] **Step 3:** (Opcional, se houver credenciais reais do dono) `RIFTDRIVE_LIVE_TEST=1` com uma pasta pequena compartilhada: análise → job → `done` → pasta no Drive.
- [ ] **Step 4:** Registrar no README qualquer limitação observada. Commit final — `git commit -m "chore: verificação ponta a ponta e ajustes finais"`.

---

## Self-review do plano

**Cobertura da spec:** §1 (dois caminhos) → Tasks 11, 14, 15; fora do escopo (nativos na máquina) → Task 15 `skipped_native`; §2 (marca, layout, inline, assistente, cota) → Tasks 19–23; OAuth client próprio → Tasks 4–7, 20; distribuição → Task 25; §3.1–3.2 → Tasks 1–3; §3.3 módulos → cada um tem task (links/tree 10, inspect/inspections 11, quota 12, outcomes/run-loop/copier 14, transfer 15, resync 17, engine/naming 16, routes 7/18, security 7, strings transversal); §3.4 → Task 3 (tabela `job_folders` acrescentada à spec implicitamente — é detalhe de implementação do espelho de pastas); §3.5 → Tasks 5–7; §3.6 → Task 11; §3.7 → Tasks 14, 16; §3.8 → Task 15; §3.9 → Task 17; §3.10 → Task 7; §3.11 → Task 18; §3.12 → Tasks 19–23; §3.13 → FakeDrive (9) + testes por task; §3.14 → Task 25.

**Consistência de nomes:** `JobsRepo` (não `JobRepo`), `QuotaService.evaluate/canSpend/record/used`, `runLoop/runRift/runMachine`, `FolderMirror.ensure`, `classifyFailure`, `JobPaused`, `InspectionCache.put/get`, `LoginFlow.start/status`, `AccountsService.getAccessToken/invalidate/markDisconnected/testConnection`, `DriveClient` métodos conforme Task 8 — usados com os mesmos nomes nas Tasks 11–18.

**Decisões registradas durante o plano (complementam a spec):** tabela `job_folders`; `userRateLimitExceeded` é transitório e vira "limite" só após 3 falhas consecutivas no job; arquivo maior que a cota inteira passa quando o dia está zerado; merge renomeia a versão antiga para "(versão anterior)" em vez de apagar; detalhe do job é página própria.
