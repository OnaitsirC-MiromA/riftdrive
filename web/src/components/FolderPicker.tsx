import { useEffect, useState } from 'react';
import type { Account, Folder } from '../api/client';
import { useCreateFolder, useFolders } from '../api/hooks';
import { Button } from './Button';
import { ChevronRight, FolderIcon, FolderPlusIcon, PeopleIcon, SearchIcon, ShortcutIcon, StarIcon } from './icons';
import { s } from '../i18n/strings';

export interface PickedFolder {
  id: string;
  name: string;
  /** Veio da seção "Com estrela" — a trilha mostra a estrela em vez do caminho. */
  starred?: boolean;
  /** Veio de "Compartilhados comigo" — a trilha mostra as pessoas. */
  shared?: boolean;
  /** É um atalho; `id` já é o da pasta alvo. */
  shortcut?: boolean;
}

const ROOT: PickedFolder = { id: 'root', name: s.common.myDrive };

// Espera o usuário parar de digitar antes de perguntar ao Drive.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// O ícone diz de onde a pasta veio: estrela, atalho, compartilhada, ou pasta comum.
const kindIcon = (f: PickedFolder, size = 14) =>
  f.starred ? (
    <StarIcon className="text-amber shrink-0" width={size} height={size} />
  ) : f.shortcut ? (
    <ShortcutIcon className="text-muted shrink-0" width={size} height={size} />
  ) : f.shared ? (
    <PeopleIcon className="text-muted shrink-0" width={size} height={size} />
  ) : (
    <FolderIcon className="text-muted shrink-0" width={size} height={size} />
  );

type ListState = { isLoading: boolean; error: unknown; data?: Folder[] };

/**
 * Painel de navegação do Drive de uma conta: busca pelo nome no topo, seletor
 * de conta quando há mais de uma, e, na raiz, as seções Compartilhados comigo
 * (só na origem), Com estrela e Meu Drive. Clicar numa linha entra na pasta;
 * "Escolher" confirma a pasta atual.
 */
export function FolderBrowser({
  accountId,
  accounts,
  onAccountChange,
  mode = 'dest',
  onChoose,
  onClose,
}: {
  accountId: string;
  accounts?: Account[];
  onAccountChange?: (id: string) => void;
  /** `source` acrescenta "Compartilhados comigo" e não deixa escolher a raiz inteira. */
  mode?: 'dest' | 'source';
  onChoose: (f: PickedFolder) => void;
  onClose: () => void;
}) {
  const [trail, setTrail] = useState<PickedFolder[]>([ROOT]);
  const [typed, setTyped] = useState('');
  const term = useDebounced(typed.trim(), 300);
  const current = trail[trail.length - 1];
  const atRoot = current.id === 'root';
  const searching = term.length > 0;
  const forSource = mode === 'source';

  const children = useFolders(searching ? undefined : accountId, current.id);
  const starred = useFolders(!searching && atRoot ? accountId : undefined, 'starred');
  const shared = useFolders(!searching && atRoot && forSource ? accountId : undefined, 'shared');
  const found = useFolders(searching ? accountId : undefined, 'root', term);

  const enter = (f: PickedFolder) => {
    setTrail([...trail, f]);
    setTyped('');
  };
  // Um resultado da busca pode estar em qualquer lugar: a trilha recomeça da raiz.
  const enterFound = (f: PickedFolder) => {
    setTrail([ROOT, f]);
    setTyped('');
  };
  const switchAccount = (id: string) => {
    setTrail([ROOT]);
    setTyped('');
    onAccountChange?.(id);
  };

  const rows = (list: Folder[] | undefined, extra: Partial<PickedFolder>, onClick: (f: PickedFolder) => void) =>
    list?.map((f) => {
      const pf: PickedFolder = { id: f.id, name: f.name, ...extra, shortcut: Boolean(f.shortcut) };
      return (
        <button key={f.id} type="button" className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] text-left" onClick={() => onClick(pf)}>
          <span className="inline-flex items-center gap-2 truncate">
            {kindIcon(pf)}
            <span className="truncate">{pf.name}</span>
            {pf.shortcut && <span className="text-faint text-[11px] shrink-0">{s.common.shortcut}</span>}
          </span>
          <ChevronRight className="text-faint shrink-0" width={12} height={12} />
        </button>
      );
    });
  const state = (q: ListState, empty: string) => (
    <>
      {q.isLoading && <div className="px-2 py-1.5 text-muted">{s.common.loading}</div>}
      {q.error ? <div className="px-2 py-1.5 text-red">{(q.error as Error).message}</div> : null}
      {q.data?.length === 0 && <div className="px-2 py-1.5 text-muted">{empty}</div>}
    </>
  );

  // "Nova pasta", só no destino: abre a pasta mãe de uma cópia sem sair do app.
  const createFolder = useCreateFolder();
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const stopNaming = () => {
    setNaming(false);
    setNewName('');
    createFolder.reset();
  };
  const create = () => {
    const name = newName.trim();
    if (!name || createFolder.isPending) return;
    createFolder.mutate(
      { accountId, parentId: current.id, name },
      {
        onSuccess: ({ folder }) => {
          stopNaming();
          enter({ id: folder.id, name: folder.name });
        },
      },
    );
  };

  const hasStarred = Boolean(starred.data && starred.data.length > 0);
  const canChoose = !searching && !(forSource && atRoot);
  const canCreate = !forSource && !searching;

  return (
    <div className="card p-3 text-[13px] w-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="relative flex-1 min-w-[12rem]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" width={14} height={14} />
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={s.common.searchFolders}
            aria-label={s.common.searchFolders}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-2 text-[13px] text-fg placeholder:text-faint focus-visible:border-violet/60"
          />
        </label>
        {accounts && accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => switchAccount(e.target.value)}
            aria-label={s.common.account}
            className="bg-surface border border-line rounded-lg px-2.5 py-2 text-[13px] text-fg focus-visible:border-violet/60 max-w-[16rem]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {searching ? (
        <div className="label px-2 pb-1" aria-live="polite">
          {s.common.resultsFor(term)}
        </div>
      ) : (
        <nav aria-label="Pasta atual" className="flex flex-wrap items-center gap-1 text-muted mb-2">
          {trail.map((f, i) => (
            <span key={f.id} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="text-faint" width={12} height={12} />}
              <button type="button" className={`inline-flex items-center gap-1 rounded px-1 ${i === trail.length - 1 ? 'text-fg font-medium' : 'hover:text-fg'}`} onClick={() => setTrail(trail.slice(0, i + 1))}>
                {(f.starred || f.shared || f.shortcut) && kindIcon(f, 12)}
                {f.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="max-h-64 overflow-auto -mx-1">
        {searching ? (
          <>
            {rows(found.data, {}, enterFound)}
            {state(found, s.common.noResults)}
          </>
        ) : (
          <>
            {atRoot && forSource && (
              <>
                <div className="label px-2 pt-1 pb-1">{s.common.shared}</div>
                {rows(shared.data, { shared: true }, enter)}
                {state(shared, '—')}
              </>
            )}
            {atRoot && hasStarred && (
              <>
                <div className={`label px-2 pb-1 ${forSource ? 'pt-3' : 'pt-1'}`}>{s.common.starred}</div>
                {rows(starred.data, { starred: true }, enter)}
              </>
            )}
            {atRoot && (forSource || hasStarred) && <div className="label px-2 pt-3 pb-1">{s.common.myDrive}</div>}
            {rows(children.data, {}, enter)}
            {state(children, '—')}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mt-2 pt-2 border-t border-line">
        {canCreate && naming ? (
          <form
            className="flex-1 flex items-center gap-2 min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && stopNaming()}
              placeholder={s.common.newFolderName}
              aria-label={s.common.newFolderName}
              autoComplete="off"
              className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-3 py-1.5 text-[13px] text-fg placeholder:text-faint focus-visible:border-violet/60"
            />
            <Button size="sm" variant="primary" type="submit" disabled={!newName.trim() || createFolder.isPending}>
              {s.common.create}
            </Button>
            <Button size="sm" onClick={stopNaming}>
              {s.common.cancel}
            </Button>
          </form>
        ) : (
          <>
            {canCreate && (
              <Button variant="link" size="sm" className="mr-auto" onClick={() => setNaming(true)}>
                <FolderPlusIcon width={14} height={14} />
                {s.common.newFolder}
              </Button>
            )}
            <Button size="sm" onClick={onClose}>
              {s.common.close}
            </Button>
            <Button size="sm" variant="primary" disabled={!canChoose} onClick={() => onChoose(current)}>
              {s.common.choose} “{current.name}”
            </Button>
          </>
        )}
      </div>
      {createFolder.error ? (
        <div className="text-red text-[12px] mt-1.5" role="alert">
          {(createFolder.error as Error).message}
        </div>
      ) : null}
    </div>
  );
}

// Seletor de pasta do destino: mostra a pasta escolhida; "trocar" abre o
// navegador no lugar e fecha ao escolher.
export function FolderPicker({ accountId, value, onChange }: { accountId: string | undefined; value: PickedFolder; onChange: (f: PickedFolder) => void }) {
  const [open, setOpen] = useState(false);

  if (!open || !accountId) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line">
          {kindIcon(value)}
          {value.name}
        </span>
        <Button variant="link" size="sm" onClick={() => setOpen(true)} disabled={!accountId}>
          {s.common.change}
        </Button>
      </span>
    );
  }

  return (
    <FolderBrowser
      accountId={accountId}
      onChoose={(f) => {
        onChange(f);
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
  );
}
