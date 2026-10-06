# CLAUDE.md

Guia para o Claude Code trabalhar neste repositório.

## O que é

**RiftDrive** copia pastas de um Google Drive para outro: **pelo rift** (origem acessível pela conta de destino → `files.copy` servidor-a-servidor, nada passa pela máquina) ou **pela sua máquina** (contas diferentes → download de uma, upload retomável na outra). App local: um processo Node serve a SPA e a API em `127.0.0.1:7799`; o motor de cópia roda no mesmo processo. Irmão do Learnflix (mesma distribuição: `npx riftdrive`, instalador de uma linha, executável SEA).

Código com identificadores em **inglês**; comentários, commits (`feat:`/`fix:`/`test:`/`docs:`/`chore:`/`refactor:`) e interface em **português**.

## Comandos

Node ≥ 22.5, npm (workspaces `server` e `web`).

```bash
npm install
npm run dev                                  # Vite :5173 (proxy /api → :7777) + tsx watch
npm test                                     # = vitest no server (sem rede; FakeDrive)
cd server && ../node_modules/.bin/vitest run src/drive/copier.test.ts   # um arquivo
npm run build                                # web build → gerar-bundled → tsc server → esbuild dist/riftdrive.cjs
npm run build:binario                        # SEA desta máquina em build/
npm start                                    # node dist/riftdrive.cjs
```

Não há script de typecheck separado: `tsc --noEmit` roda no `build` de cada workspace. O servidor nunca emite JS (roda via `tsx`); o bundle é CommonJS (sem top-level await em `index.ts`). Imports ESM sem extensão.

`server/src/bundled.ts` é **gerado** (`scripts/gerar-bundled.mjs`) e ignorado pelo git — sem `web/dist`, nasce vazio e o Vite serve a interface.

## Regras que não mudam

- **Zero módulos nativos** no servidor: banco via `node:sqlite` (carregado por `require()` depois do `quiet.ts`), HTTP via `fetch`. É o que permite o executável único.
- **Sem rede nos testes**: todo HTTP passa por `fetchFn` injetável; `server/src/test/fake-drive.ts` simula a Drive API e o token endpoint.
- **Nunca apagar nada no Drive.** Mesclar renomeia a versão antiga para "(versão anterior)".
- **Textos centralizados**: `server/src/i18n/strings.ts` e `web/src/i18n/strings.ts`. Vocabulário: **cota** (nunca "orçamento"); chips "pelo rift" / "pela sua máquina".
- **Migrações** por `PRAGMA user_version` em `server/src/db/index.ts`: acrescente `if (version < N)`, nunca edite `SCHEMA_V1`.
- Design segue `DESIGN.md` (tokens no `web/tailwind.config.js`); avisos são superfície tingida, sem borda lateral colorida.

## Mapa do servidor (`server/src`)

- `index.ts` boot · `app.ts` Fastify + rotas (`// [ROUTES]`) · `deps.ts` container (`buildDeps`, injeção nos testes) · `security.ts` guarda de origem local.
- `auth/` OAuth do usuário: `client-config` (id/segredo), `pkce`, `oauth` (URL, loopback `127.0.0.1:porta`, troca, refresh), `accounts` (repo + `AccountsService` = `TokenProvider`), `login-flow`.
- `drive/` `client` (API v3, backoff, erros `DriveError`), `errors` (classificadores), `links`, `tree` (`listTree`), `inspect` (detecção de caminho), `inspections` (cache 15 min), `quota`, `outcomes` (`classifyFailure`, `JobPaused`), `run-loop` (laço comum), `copier` (`runRift`, `FolderMirror`), `transfer` (`runMachine`, upload retomável), `resync` (diff por md5).
- `jobs/` `repo` (jobs, `job_files`, `job_folders`, `copies`), `inventory`, `naming` ("(copiando…)"), `engine` (fila, pausas, retomada, stats).
- `routes/` uma por recurso; DTOs montados à mão em `jobs.ts` (`toJobDto`).

## Mapa da web (`web/src`)

`App.tsx` rotas `/`, `/configurar`, `/copia/:id`, `/configuracoes` · `api/client.ts` DTOs + `api.*` · `api/hooks.ts` TanStack Query (polling 2 s com job ativo) · `pages/Home` (caixa do link + `home/AnalysisCard` inline + `home/JobLists`) · `pages/Setup` (assistente OAuth) · `pages/Job` · `pages/Settings` · `components/` (`Brand`, `PathChip`, `Banner`, `JobCard`, `FolderPicker`, `Shell`…).

## Documentos

Spec: `docs/superpowers/specs/2026-10-05-riftdrive-design.md`. Plano: `docs/superpowers/plans/2026-10-05-riftdrive.md`. Produto/voz: `PRODUCT.md`. Visual: `DESIGN.md`. Marca e mockups do brainstorming: `docs/brand/`.
