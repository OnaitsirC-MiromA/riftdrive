import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps } from '../deps';
import { FOLDER_MIME, SHORTCUT_MIME, type DriveFile } from '../drive/client';
import { isAuthExpired } from '../drive/errors';
import { InspectError, inspect, reinspectDest } from '../drive/inspect';
import { t } from '../i18n/strings';

interface InspectBody {
  link?: string;
  destAccountId?: string;
  destParentId?: string;
  destParentName?: string;
  /** Análise anterior a reaproveitar quando só o destino mudou. */
  inspectionId?: string;
  /** Token inventado pela SPA para acompanhar a leitura em GET /api/inspect/progress. */
  progressToken?: string;
}

export async function inspectRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { accountsRepo, settings, clientFor, quota, inspections, inspectProgress } = opts.deps;

  const sendError = (reply: FastifyReply, err: unknown) => {
    if (err instanceof InspectError) return reply.code(400).send({ error: err.message, code: err.code });
    if (isAuthExpired(err)) return reply.code(503).send({ error: t.jobs.auth, code: 'auth' });
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  };

  // Analisa o link: quem lê a origem, por qual caminho vai, o que fica de fora,
  // cabe na cota. Guarda a árvore para o POST /api/jobs não ler tudo de novo.
  // Com `inspectionId` e a mesma conta de destino, só o conflito no novo pai é
  // conferido — a árvore é a da análise guardada e o id continua o mesmo.
  app.post<{ Body: InspectBody }>('/api/inspect', async (req, reply) => {
    const dest = (req.body?.destAccountId ? accountsRepo.get(req.body.destAccountId) : null) ?? accountsRepo.defaultDest();
    if (!dest) return reply.code(400).send({ error: t.accounts.none, code: 'no_accounts' });

    const dd = settings.defaultDest();
    const destParentId = req.body?.destParentId || (dd?.accountId === dest.id ? dd.folderId : 'root');
    const destParentName = req.body?.destParentName || (dd?.accountId === dest.id ? dd.folderName : t.drive.myDrive);

    const previousId = req.body?.inspectionId;
    const cached = previousId ? inspections.get(previousId) : null;
    if (previousId && cached && cached.result.destAccountId === dest.id) {
      try {
        const result = await reinspectDest({ clientFor }, cached.result, destParentId);
        inspections.update(previousId, result);
        return { inspectionId: previousId, destParentId, destParentName, ...result };
      } catch (err) {
        return sendError(reply, err);
      }
    }

    const link = (req.body?.link ?? '').trim();
    if (!link) return reply.code(400).send({ error: t.inspect.invalidLink, code: 'invalid_link' });

    const token = req.body?.progressToken;
    const onProgress = token ? (n: number) => inspectProgress.set(token, n) : undefined;
    try {
      const { result, tree } = await inspect({ clientFor, accounts: accountsRepo.list(), quota, onProgress }, { link, destAccountId: dest.id, destParentId, destParentName });
      const inspectionId = inspections.put(result, tree);
      return { inspectionId, destParentId, destParentName, ...result };
    } catch (err) {
      return sendError(reply, err);
    } finally {
      if (token) inspectProgress.clear(token);
    }
  });

  // Quantos arquivos a leitura em curso já encontrou. 404 quando não há leitura
  // com esse token — inclusive depois que ela termina.
  app.get<{ Querystring: { token?: string } }>('/api/inspect/progress', async (req, reply) => {
    const filesSeen = req.query.token ? inspectProgress.get(req.query.token) : null;
    if (filesSeen === null) return reply.code(404).send({ error: 'not_found' });
    return { filesSeen };
  });

  // Navegador de pastas, da origem e do destino. Pais especiais: `starred`
  // (pastas com estrela da conta) e `shared` (o que outros compartilharam).
  // `q` busca pelo nome em toda a conta e ignora o pai. Atalhos para pasta
  // entram com o id da pasta alvo, então navegar e analisar funcionam direto.
  app.get<{ Querystring: { accountId?: string; parentId?: string; q?: string } }>('/api/drive/folders', async (req, reply) => {
    const acc = (req.query.accountId ? accountsRepo.get(req.query.accountId) : null) ?? (req.query.accountId ? null : accountsRepo.defaultDest());
    if (!acc) return reply.code(404).send({ error: t.accounts.notFound });
    const parentId = req.query.parentId || 'root';
    const term = (req.query.q ?? '').trim();
    try {
      const client = clientFor(acc.id);
      const kids = term
        ? await client.searchFolders(term)
        : parentId === 'starred'
          ? await client.listStarredFolders()
          : parentId === 'shared'
            ? await client.listSharedWithMe()
            : await client.listChildren(parentId);
      return { folders: toFolderRows(kids) };
    } catch (err) {
      if (isAuthExpired(err)) return reply.code(503).send({ error: t.jobs.auth, code: 'auth' });
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Cria uma pasta dentro da pasta mãe (ou de `root`), para quem escolhe o
  // destino poder abrir uma "Cursos 2026" sem sair do app. A pasta da cópia em
  // si o motor cria depois, com o nome da origem.
  app.post<{ Body: { accountId?: string; parentId?: string; name?: string } }>('/api/drive/folders', async (req, reply) => {
    const acc = (req.body?.accountId ? accountsRepo.get(req.body.accountId) : null) ?? (req.body?.accountId ? null : accountsRepo.defaultDest());
    if (!acc) return reply.code(404).send({ error: t.accounts.notFound });
    const name = (req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: t.drive.invalidName, code: 'invalid_name' });
    try {
      const created = await clientFor(acc.id).createFolder(name, req.body?.parentId || 'root');
      return { folder: { id: created.id, name: created.name } };
    } catch (err) {
      if (isAuthExpired(err)) return reply.code(503).send({ error: t.jobs.auth, code: 'auth' });
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export interface FolderRow {
  id: string;
  name: string;
  /** Linha é um atalho; `id` já é o da pasta alvo. */
  shortcut?: true;
}

// Só o que é pasta ou atalho para pasta; arquivos e atalhos para arquivo saem.
export function toFolderRows(kids: DriveFile[]): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const k of kids) {
    if (k.mimeType === FOLDER_MIME) rows.push({ id: k.id, name: k.name });
    else if (k.mimeType === SHORTCUT_MIME && k.shortcutDetails?.targetMimeType === FOLDER_MIME) rows.push({ id: k.shortcutDetails.targetId, name: k.name, shortcut: true });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
