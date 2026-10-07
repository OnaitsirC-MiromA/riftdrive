import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { FOLDER_MIME, SHORTCUT_MIME, type DriveFile } from '../drive/client';
import { isAuthExpired } from '../drive/errors';
import { InspectError, inspect } from '../drive/inspect';
import { t } from '../i18n/strings';

interface InspectBody {
  link?: string;
  destAccountId?: string;
  destParentId?: string;
  destParentName?: string;
}

export async function inspectRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { accountsRepo, settings, clientFor, quota, inspections } = opts.deps;

  // Analisa o link: quem lê a origem, por qual caminho vai, o que fica de fora,
  // cabe na cota. Guarda a árvore para o POST /api/jobs não ler tudo de novo.
  app.post<{ Body: InspectBody }>('/api/inspect', async (req, reply) => {
    const link = (req.body?.link ?? '').trim();
    if (!link) return reply.code(400).send({ error: t.inspect.invalidLink, code: 'invalid_link' });

    const dest = (req.body?.destAccountId ? accountsRepo.get(req.body.destAccountId) : null) ?? accountsRepo.defaultDest();
    if (!dest) return reply.code(400).send({ error: t.accounts.none, code: 'no_accounts' });

    const dd = settings.defaultDest();
    const destParentId = req.body?.destParentId || (dd?.accountId === dest.id ? dd.folderId : 'root');
    const destParentName = req.body?.destParentName || (dd?.accountId === dest.id ? dd.folderName : t.drive.myDrive);

    try {
      const { result, tree } = await inspect({ clientFor, accounts: accountsRepo.list(), quota }, { link, destAccountId: dest.id, destParentId, destParentName });
      const inspectionId = inspections.put(result, tree);
      return { inspectionId, destParentId, destParentName, ...result };
    } catch (err) {
      if (err instanceof InspectError) return reply.code(400).send({ error: err.message, code: err.code });
      if (isAuthExpired(err)) return reply.code(503).send({ error: t.jobs.auth, code: 'auth' });
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
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
