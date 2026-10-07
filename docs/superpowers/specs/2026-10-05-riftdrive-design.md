# RiftDrive — design do produto e da arquitetura

Data: 2026-10-05
Status: aprovado em brainstorming (marca, layout, fluxos, motor, OAuth, distribuição); blocos de arquitetura 2 e 3 fechados por delegação ("prossiga até o final").

## 1. O que é

**RiftDrive** copia pastas de um Google Drive para outro. Dois cenários:

- **Pelo rift** — a pasta de origem está acessível pela conta de destino (compartilhada comigo, atalho ou link público). A cópia acontece **dentro do Google** (`files.copy`, servidor-a-servidor): nada passa pela máquina do usuário, não usa a internet dele, pode fechar o app no meio.
- **Pela sua máquina** — origem e destino são contas diferentes e a de destino não enxerga a origem. Os bytes descem de uma conta e sobem na outra, em blocos, com retomada. Mais lento; precisa do app aberto.

O app diz sempre qual caminho vai usar e por quê, e empurra para o caminho bom: quando a rota é pela máquina, oferece um pedido pronto para o dono compartilhar a pasta com a conta de destino.

Nasce da funcionalidade "Cópias da nuvem" do Cursos Locais (M7–M11), reescrita sem rclone. É o irmão do Learnflix: mesma caixa de distribuição, conteúdo diferente.

### Público e promessa
Quem acumula acervos grandes no Drive (cursos, backups, migração de conta) e cansou de "fazer uma cópia" arquivo por arquivo ou de ferramentas que baixam tudo para o disco. Promessa: **cole o link, escolha a pasta, a gente leva** — e mostra o progresso com honestidade (o que foi, o que ficou de fora e por quê).

### Fora do escopo da v1
- Conversão de arquivos nativos do Google (Docs/Sheets/Slides) no caminho pela máquina: ficam **de fora com motivo** ("formato nativo do Google — precisa de conversão"). Pelo rift, `files.copy` copia nativos normalmente.
- Tradução da interface (pt-BR só; textos centralizados para permitir depois).
- Marca personalizável, pontos de extensão em código, auto-update, sincronização bidirecional, exclusão no destino (o RiftDrive **nunca apaga** nada em lugar nenhum).

## 2. Decisões de produto

| Tema | Decisão |
|---|---|
| Nome · comando | RiftDrive · `npx riftdrive` (nome livre no npm; `rift` está tomado) |
| Símbolo | **Portal**: porta luminosa em gradiente ciano→violeta; seta entra apagada e sai nítida. Animável como loader. |
| Paleta | tinta `#0B1020`, superfície `#141A33`, superfície-2 `#1B2240`, texto `#F5F3FF`, violeta `#A78BFA` (ação) / `#C4B5FD` (texto de destaque), ciano `#67E8F9` (brilho), âmbar `#F2B134` (cota/aviso/"pela sua máquina"), verde `#34D399` (concluído), vermelho `#F87171` (erro). Tema escuro por padrão. |
| Tipografia | DM Sans (UI), JetBrains Mono (números, caminhos, comandos). Auto-hospedadas via `@fontsource`. |
| Tom | Profissional, direto, sem jargão. Vocabulário do jogo só no nome e em micro-momentos (chip "pelo rift"). "Cota", nunca "orçamento". |
| Layout | **Ação primeiro, uma coluna**: a caixa "Cole um link do Google Drive" é o centro; cópias abaixo como cartões (Em andamento / Pausadas / Concluídas, esta colapsa em "ver todas" acima de 5). |
| Nova cópia | **Inline**: colou o link → a análise abre embaixo da caixa (nome, tamanho, dono, caminho + explicação, bloqueados, destino já preenchido, cota) → "Iniciar cópia". Sem modal. |
| Detalhe do job | Página própria (`/copia/:id`), com volta para a lista. |
| Primeira vez | Assistente do OAuth em 5 passos com link direto para cada página do Google Cloud e "feito" lembrado; o passo "publicar em produção" ganha destaque âmbar e a explicação dos 7 dias. Quem já tem client pula para colar. |
| OAuth | **Client próprio de cada usuário** (tipo "App para computador"). Nunca um client embutido. |
| Cota diária | Configuração com dois modos: **Limitar a N GB/dia, renova às HH:MM** (padrão 600 GB, 04:00; pausa e retoma sozinha) ou **Sem limite** (vai até o Google cortar; ao cortar, pausa, avisa e retenta a cada hora). |
| Instalação | Padrão Learnflix: `npx riftdrive` (Node ≥ 22.5) ou instalador de uma linha (`install.sh` / `install.ps1`) que baixa o executável SEA com SHA-256 conferido. Releases por tag no GitHub Actions. |
| Repositório | `OnaitsirC-MiromA/riftdrive`, público, MIT. |
| Convenções | Identificadores em inglês; comentários, commits (`feat:`/`fix:`/`docs:`/…) e UI em português. |

## 3. Arquitetura

### 3.1 Forma
Um processo Node ≥ 22.5. **Fastify** serve a SPA (React 18 + Vite + TanStack Query + Tailwind) e a API JSON em `127.0.0.1:7799` (fallback para as portas seguintes; distinta do Learnflix para conviverem). O motor de cópia vive no mesmo processo. Sem Electron: o navegador é a janela; o executável SEA é o "duplo clique".

Zero módulos nativos: banco via **`node:sqlite`**, HTTP via `fetch` global, OAuth loopback via `node:http`. É o que permite o esbuild gerar um `.cjs` único e o SEA embutir tudo.

**Casca portada do Learnflix** (adaptando nomes): escuta com fallback de porta, abrir navegador, banner de boas-vindas no terminal, modo silencioso, servir SPA embutida (`bundled.ts` gerado) com fallback para `index.html`, pasta de dados por SO.

### 3.2 Pasta de dados
`RIFTDRIVE_DATA_DIR` ou, por padrão: macOS `~/Library/Application Support/RiftDrive`; Windows `%APPDATA%\RiftDrive`; Linux `$XDG_DATA_HOME/riftdrive` (ou `~/.local/share/riftdrive`). Contém `riftdrive.db` (e WAL). Em POSIX, pasta e arquivo em `0700`/`0600`.

### 3.3 Componentes do servidor (`server/src/`)

| Módulo | Responsabilidade |
|---|---|
| `config.ts` | env → `AppConfig` (porta, host, data dir, quiet, abrir navegador) |
| `db/` | `openDb` (WAL, foreign keys), `migrate` por `PRAGMA user_version`, `schema.ts` |
| `auth/client-config.ts` | guarda/valida id (`*.apps.googleusercontent.com`) e segredo do OAuth client |
| `auth/pkce.ts` | verifier/challenge S256, `state` |
| `auth/oauth.ts` | monta URL de consentimento; **servidor loopback** efêmero em `127.0.0.1:0` que recebe `?code&state`, responde uma página "pode voltar ao RiftDrive" e encerra; troca código→tokens; refresh; revoke (best-effort) |
| `auth/accounts.ts` | contas conectadas: e-mail (via `about.get`), tokens, estado `ok`/`disconnected`, destino padrão, `getAccessToken(accountId)` com refresh e cache |
| `drive/client.ts` | `DriveClient(accountId)`: `fetch` autenticado para `/drive/v3`, paginação, backoff, **`DriveError` estruturado** (`code`, `reason`, `message`) e classificadores `isTransient`, `isDownloadQuota`, `isBlocked`, `isAuthExpired`, `isStorageFull`, `isDailyLimit`, `isNotFound` |
| `drive/links.ts` | link/ID → `folderId` (`/folders/`, `?id=`, `/file/d/`, `open?id=`) |
| `drive/inspect.ts` | análise: resolve atalho, metadados, **detecção de caminho** (3.6), árvore com `listTree`, totais, bloqueados, conflito de nome no destino |
| `drive/tree.ts` | `listTree(client, folderId)` → entradas `{relPath, id, name, mimeType, size, md5, canCopy, canDownload}`; resolve atalhos; ignora lixeira |
| `drive/copier.ts` | caminho rift: cria pastas espelhando a árvore, `files.copy` por arquivo com paralelismo N, atualiza `job_files` |
| `drive/transfer.ts` | caminho máquina: `alt=media` (com `Range` para retomar) → sessão de **upload retomável** por blocos de 16 MB; persiste `upload_uri`/`bytes_uploaded` |
| `drive/quota.ts` | uso por conta e "dia" (dia vira na hora de renovação); `canSpend(bytes)` nos dois modos; `nextResetAt()` |
| `drive/resync.ts` | diff origem × destino por `relPath` (novo; atualizado se `md5` difere ou, sem md5, `size` difere); agrupa por subpasta de 1º nível |
| `jobs/engine.ts` | fila (um job por vez), ciclo de vida (3.7), tick, pausas automáticas e retomada, recuperação no boot, eventos de progresso |
| `jobs/naming.ts` | pasta de destino nasce `"{nome} (copiando…)"` e é renomeada para `"{nome}"` ao concluir; conflito → "usar outro nome" ou "mesclar" |
| `routes/` | `auth` (client, login start/status, accounts), `inspect`, `jobs`, `copies`, `settings`, `health`, `info` |
| `security.ts` | hook `onRequest` para `/api/*`: rejeita `Origin`/`Sec-Fetch-Site` de outra origem (anti-CSRF/DNS-rebinding de app local) |
| `i18n/strings.ts` | textos do servidor (mensagens de erro em português) |

### 3.4 Dados (SQLite, migrações por `user_version`)

```sql
settings(key TEXT PK, value TEXT)             -- quota_mode ('limit'|'unlimited'), quota_gb, quota_reset_hour,
                                              -- default_dest_account_id, default_dest_folder_id, default_dest_folder_name
oauth_client(id INTEGER PK CHECK(id=1), client_id, client_secret, created_at)
accounts(id TEXT PK, email, refresh_token, access_token, access_expires_at, status ('ok'|'disconnected'),
         is_default_dest INTEGER, created_at, last_checked_at, failed_since)
jobs(id TEXT PK, name, src_folder_id, src_reader_account_id, dest_account_id, dest_parent_id, dest_parent_name,
     dest_folder_id, dest_final_name, path ('rift'|'machine'), mode ('copy'|'merge'),
     status, total_files, total_bytes, done_files, done_bytes, skipped_files, deferred_files,
     message, created_at, started_at, finished_at, paused_until, resume_reason, file_filter_json)
job_files(job_id FK, rel_path, src_id, name, mime_type, size, md5, status
          ('pending'|'done'|'skipped_blocked'|'skipped_native'|'deferred'|'missing'|'failed'),
          dest_id, upload_uri, bytes_uploaded, attempts, last_error, PRIMARY KEY(job_id, rel_path))
copies(id TEXT PK, src_folder_id, src_reader_account_id, dest_folder_id, dest_account_id, name, path,
       created_at, last_checked_at, last_synced_at)
quota_usage(account_id, day_key, bytes, PRIMARY KEY(account_id, day_key))
```

Princípios: o inventário em `job_files` é a verdade — é o que torna qualquer job retomável depois de fechar o app; `copies` sobrevive à limpeza de jobs; nada tem caminho de disco (não existe disco).

### 3.5 OAuth (fluxo)
1. `POST /api/auth/client` grava id/segredo (valida formato).
2. `POST /api/auth/login/start` → gera PKCE + `state`, sobe loopback em porta aleatória, devolve `{authUrl}`; servidor abre o navegador. Parâmetros: `scope=https://www.googleapis.com/auth/drive`, `access_type=offline`, `prompt=consent` (garante refresh token), `code_challenge_method=S256`.
3. O Google redireciona para `http://127.0.0.1:{porta}/?code&state`; o loopback valida `state`, troca o código em `https://oauth2.googleapis.com/token` (com `code_verifier`), consulta `about.get?fields=user` para o e-mail, grava a conta (primeira vira destino padrão) e responde uma página mínima "Conectado — pode voltar ao RiftDrive".
4. `GET /api/auth/login/status` (polling da SPA) → `pending|done|error`.
5. Refresh: `grant_type=refresh_token`; `invalid_grant` → conta `disconnected`, jobs dela → `paused_auth`, banner com "Reconectar" (mesmo fluxo 2–4 com `login_hint`).
6. Remover conta: revoke best-effort + apaga tokens; jobs dependentes ficam `failed` com motivo.

Tudo com o `fetch` global; o token endpoint e o `about.get` são injetáveis para teste.

### 3.6 Detecção de caminho (em `inspect`)
Dado o `folderId` e a conta de destino **D**:
1. `files.get(folderId, fields=id,name,mimeType,shortcutDetails,owners,capabilities)` **como D**. 200 → D lê a origem → **pelo rift**. (Cobre compartilhado comigo, atalho, link público.)
2. Senão, para cada outra conta **S** conectada: `files.get` como S. Primeira que lê → **pela sua máquina** (lê como S, escreve como D).
3. Nenhuma lê → erro: "Nenhuma conta conectada tem acesso a essa pasta. Peça ao dono para compartilhar com {D}, ou conecte a conta que tem acesso."

Atalho → segue `shortcutDetails.targetId`. Depois, `listTree` como a conta leitora: totais, e por arquivo:
- rift: `capabilities.canCopy === false` → **bloqueado** (dono desativou cópia).
- máquina: `capabilities.canDownload === false` → **bloqueado**; `mimeType` nativo do Google → **skipped_native**.

Resposta da análise: `{name, owner, path, readerAccount, totals{files,bytes}, blocked{count,bytes,sample[]}, native{count}, copyableBytes, destConflict?: {existingFolderId}, quota{fits, remaining, resetAt}, shareRequestText}`.

### 3.7 Ciclo de vida do job
Estados: `queued → running → done | canceled | failed`, com pausas: `paused` (usuário), `paused_quota`, `paused_auth`, `paused_storage`, `paused_offline`. Qualquer pausa volta para `running` quando a causa some (timer, reconexão, rede) ou por ação do usuário.

Motor: tick a cada 1 s; um job `running` por vez; dentro do job, até **4** cópias paralelas (rift) ou **2** transferências (máquina). Backoff exponencial do job em erro transitório (1 s → 60 s), zera no sucesso. No boot, jobs `running` voltam a `queued`; `paused_*` recalculam `paused_until`.

Por arquivo:
- antes: `quota.canSpend(size)`; se não → job `paused_quota` (modo limite: até `nextResetAt`; modo sem limite: só quando o Google devolver erro de limite diário → retenta a cada 60 min).
- sucesso → `done`, soma em `quota_usage`.
- `isBlocked` → `skipped_blocked` (permanente, listado); `isDownloadQuota` → `deferred` (retenta após 24 h; se só restarem deferidos, job `paused_quota` até lá); `isNotFound` → `missing`; `isStorageFull` → job `paused_storage` (destino cheio — mensagem clara); `isAuthExpired` → job `paused_auth`; rede fora → `paused_offline` (retenta 30 s, 60 s, …); outros após 5 tentativas → `failed` no arquivo, job segue.
- fim: se `pending` vazio → renomeia a pasta (tira "(copiando…)"), grava/atualiza `copies`, `done` (com resumo: feitos, bloqueados, nativos, faltantes).

Modo `merge` (mesclar/re-sync): escreve direto na pasta existente; arquivo com mesmo `relPath` e mesmo `md5` (ou mesmo `size`, sem md5) é `done` sem copiar; `file_filter_json` restringe a subpastas escolhidas.

### 3.8 Caminho pela máquina (detalhe)
Por arquivo: abre sessão `POST /upload/drive/v3/files?uploadType=resumable` como D (metadados `{name, parents:[destFolderId], mimeType}`, `X-Upload-Content-Length`) → guarda `upload_uri`. Lê `GET /files/{id}?alt=media` como S com `Range: bytes={bytes_uploaded}-`, consumindo o stream em blocos de 16 MB e enviando `PUT upload_uri` com `Content-Range: bytes a-b/total`; `308` → atualiza `bytes_uploaded` (pelo header `Range`), `200/201` → `done` com `dest_id`. Ao retomar, consulta a sessão (`PUT` vazio com `Content-Range: bytes */total`) para saber onde parou; sessão expirada (~1 semana, `404/410`) → recomeça o arquivo. Velocidade e ETA calculados por janela deslizante de 30 s.

### 3.9 Re-sync ("Verificar novidades")
`POST /api/copies/:id/check` → `listTree` da origem (como leitora) e do destino (como D), diff por `relPath`, agrupa por subpasta de 1º nível: `{folder, newFiles, updatedFiles, bytes}`. `POST /api/copies/:id/sync {folders[]}` → cria job `mode='merge'`, `path` igual ao da cópia original, com `file_filter_json`. Nunca apaga no destino.

### 3.10 Segurança do app local
- Escuta só em `127.0.0.1`.
- Hook em `/api/*`: se `Origin` presente e não for `http://127.0.0.1:{porta}`/`http://localhost:{porta}` → 403; se `Sec-Fetch-Site` presente e não for `same-origin`/`none` → 403.
- O loopback do OAuth valida `state`, aceita uma única resposta e fecha; expira em 10 min.
- Segredo do client sai do servidor apenas na tela de configuração (mascarado) — nunca em `/api/info`.

### 3.11 API (resumo)
```
GET  /api/health · GET /api/info {version, configured, accounts[]}
POST /api/auth/client · GET /api/auth/client (mascarado) · POST /api/auth/login/start · GET /api/auth/login/status
GET  /api/accounts · DELETE /api/accounts/:id · POST /api/accounts/:id/test · POST /api/accounts/:id/default
POST /api/inspect {link, destAccountId?, destParentId?}
GET  /api/drive/folders?accountId&parentId   (navegador de pastas do destino)
GET  /api/jobs · POST /api/jobs · GET /api/jobs/:id · GET /api/jobs/:id/files?status=
POST /api/jobs/:id/pause|resume|cancel · DELETE /api/jobs/:id
GET  /api/copies · POST /api/copies/:id/check · POST /api/copies/:id/sync · DELETE /api/copies/:id
GET  /api/settings · PATCH /api/settings
GET  /api/quota  {mode, limitBytes, usedBytes, remainingBytes, resetAt}  (por conta de destino padrão)
```
Progresso: a SPA faz polling de `GET /api/jobs` a cada 2 s enquanto houver job ativo (simples, suficiente, sem WebSocket).

### 3.12 Web (`web/src/`)
- `main.tsx`, `App.tsx` — rotas: `/` (Home), `/configurar` (assistente), `/copia/:id` (detalhe), `/configuracoes`.
- `api/client.ts` (DTOs espelhando o servidor), `api/hooks.ts` (TanStack Query; invalidações por `['jobs']`, `['accounts']`, `['quota']`).
- `pages/Home.tsx` — caixa do link + `AnalysisCard` inline + listas; redireciona para `/configurar` se não houver client ou conta.
- `pages/Setup.tsx` — assistente (5 passos com estado em `localStorage`, links diretos, campos do client, botão "Validar e entrar com Google" que inicia o login e faz polling).
- `pages/Job.tsx` — progresso, caminho, velocidade/ETA (máquina), lista de arquivos por estado (bloqueados com link para abrir no Drive), pausar/retomar/cancelar.
- `pages/Settings.tsx` — cota (limite/sem limite), contas (testar, reconectar, remover, padrão, conectar outra), destino padrão.
- `components/` — `Brand` (portal animado), `PathChip`, `QuotaLine`, `JobCard`, `FolderPicker`, `ShareRequest`, `Banner`.
- `i18n/strings.ts` — todos os textos da UI.
- Design: `DESIGN.md` na raiz com tokens; **sem** bordas laterais coloridas em avisos (superfície tingida), `prefers-reduced-motion` respeitado, foco visível, contraste ≥ 4.5:1 sobre `#0B1020`.

### 3.13 Testes (Vitest, sem rede)
- `FakeDrive`: implementação em memória do subconjunto da API (files.get/list/copy/create/patch, download com Range, sessão de upload com 308), com injeção de erros por `reason` — base de todos os testes de motor.
- Unitários: `links`, `pkce`, `quota` (virada do dia, dois modos), `tree` (atalhos, paginação), `inspect` (3 desfechos da detecção, bloqueados, conflito), `copier` (árvore espelhada, paralelismo, bloqueados, retomada com inventário), `transfer` (blocos, 308, retomada após "reinício", sessão expirada), `engine` (ciclo de vida, pausas e retomadas, recuperação no boot), `resync` (diff e agrupamento), `naming`.
- Rotas via `app.inject` com `FakeDrive` e token endpoint falso; `security` (Origin estranho → 403).
- Opcional e desligado por padrão: smoke real contra uma conta (`RIFTDRIVE_LIVE_TEST=1`).
- `web`: `tsc --noEmit` + `vite build`; conferência manual.

### 3.14 Distribuição
Portado do Learnflix: `scripts/gerar-bundled.mjs` (web/dist → `server/src/bundled.ts`), `scripts/empacotar.mjs` (esbuild → `dist/riftdrive.cjs`, `bin` do pacote), `scripts/build-binario.mjs` (SEA + postject → `build/riftdrive[.exe]`), `install.sh`/`install.ps1` (baixa da release, confere `checksums.txt`, põe no PATH), `.github/workflows/release.yml` (testa → matriz darwin-arm64/x64, linux-x64/arm64, win32-x64 → release + `npm publish --provenance`). O npm é publicado por trusted publishing (OIDC), sem token guardado: a primeira versão sai da máquina do dono (`npm publish` com 2FA) e, com o pacote existindo, o dono cadastra o Trusted Publisher em npmjs.com (GitHub Actions, OnaitsirC-MiromA/riftdrive, `release.yml`). Dali em diante a tag publica sozinha.

## 4. Riscos conhecidos
- **Semântica exata dos erros de limite diário do Google** não está documentada de forma estável; classificamos um conjunto (`dailyLimitExceeded`, `quotaExceeded`, `activeItemCreationLimitExceeded`, `userRateLimitExceeded` persistente) como "limite diário" e tratamos com pausa + retentativa horária. Ajustável sem mudar a arquitetura.
- **Client em "Teste"**: o assistente avisa, mas não consegue verificar o estado de publicação pela API; se o token morrer em 7 dias, o banner de reconexão explica o motivo provável.
- **Volume**: `listTree` de uma origem com dezenas de milhares de arquivos leva minutos (paginação de 1000). A análise mostra progresso ("lendo a pasta… 4.200 arquivos") e pode ser cancelada.
