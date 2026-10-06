import { useState } from 'react';
import { useFolders } from '../api/hooks';
import { Button } from './Button';
import { ChevronRight, FolderIcon, StarIcon } from './icons';
import { s } from '../i18n/strings';

export interface PickedFolder {
  id: string;
  name: string;
  /** Veio da seção "Com estrela" — a trilha mostra a estrela em vez do caminho. */
  starred?: boolean;
}

const ROOT: PickedFolder = { id: 'root', name: s.common.myDrive };

// Navegador de pastas da conta de destino: mostra a pasta escolhida; "trocar"
// abre a lista com trilha de navegação a partir de "Meu Drive". Na raiz, as
// pastas com estrela aparecem primeiro — é onde quem organiza o Drive guarda
// os destinos de sempre.
export function FolderPicker({ accountId, value, onChange }: { accountId: string | undefined; value: PickedFolder; onChange: (f: PickedFolder) => void }) {
  const [open, setOpen] = useState(false);
  const [trail, setTrail] = useState<PickedFolder[]>([ROOT]);
  const current = trail[trail.length - 1];
  const atRoot = current.id === 'root';
  const { data: folders, isLoading, error } = useFolders(open ? accountId : undefined, current.id);
  const { data: starred } = useFolders(open && atRoot ? accountId : undefined, 'starred');

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line">
          {value.starred ? <StarIcon className="text-amber" width={14} height={14} /> : <FolderIcon className="text-muted" />}
          {value.name}
        </span>
        <Button variant="link" size="sm" onClick={() => setOpen(true)}>
          {s.common.change}
        </Button>
      </span>
    );
  }

  const row = (f: PickedFolder, icon: React.ReactNode) => (
    <button
      key={f.id}
      type="button"
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] text-left"
      onClick={() => setTrail([...trail, f])}
    >
      <span className="inline-flex items-center gap-2 truncate">
        {icon}
        <span className="truncate">{f.name}</span>
      </span>
      <ChevronRight className="text-faint shrink-0" width={12} height={12} />
    </button>
  );

  return (
    <div className="card p-3 text-[13px] w-full">
      <nav aria-label="Pasta atual" className="flex flex-wrap items-center gap-1 text-muted mb-2">
        {trail.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="text-faint" width={12} height={12} />}
            <button type="button" className={`inline-flex items-center gap-1 rounded px-1 ${i === trail.length - 1 ? 'text-fg font-medium' : 'hover:text-fg'}`} onClick={() => setTrail(trail.slice(0, i + 1))}>
              {f.starred && <StarIcon className="text-amber" width={12} height={12} />}
              {f.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="max-h-64 overflow-auto -mx-1">
        {atRoot && starred && starred.length > 0 && (
          <>
            <div className="label px-2 pt-1 pb-1">{s.common.starred}</div>
            {starred.map((f) => row({ ...f, starred: true }, <StarIcon className="text-amber shrink-0" width={14} height={14} />))}
            <div className="label px-2 pt-3 pb-1">{s.common.myDrive}</div>
          </>
        )}
        {isLoading && <div className="px-2 py-1.5 text-muted">{s.common.loading}</div>}
        {error && <div className="px-2 py-1.5 text-red">{(error as Error).message}</div>}
        {folders?.length === 0 && <div className="px-2 py-1.5 text-muted">—</div>}
        {folders?.map((f) => row(f, <FolderIcon className="text-muted shrink-0" />))}
      </div>
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-line">
        <Button size="sm" onClick={() => setOpen(false)}>
          {s.common.close}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            onChange(current);
            setOpen(false);
          }}
        >
          {s.common.choose} “{current.name}”
        </Button>
      </div>
    </div>
  );
}
