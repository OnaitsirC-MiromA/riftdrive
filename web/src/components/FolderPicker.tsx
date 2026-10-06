import { useState } from 'react';
import { useFolders } from '../api/hooks';
import { Button } from './Button';
import { ChevronRight, FolderIcon } from './icons';
import { s } from '../i18n/strings';

export interface PickedFolder {
  id: string;
  name: string;
}

// Navegador de pastas da conta de destino: mostra a pasta escolhida; "trocar"
// abre a lista com trilha de navegação a partir de "Meu Drive".
export function FolderPicker({ accountId, value, onChange }: { accountId: string | undefined; value: PickedFolder; onChange: (f: PickedFolder) => void }) {
  const [open, setOpen] = useState(false);
  const [trail, setTrail] = useState<PickedFolder[]>([{ id: 'root', name: s.common.myDrive }]);
  const current = trail[trail.length - 1];
  const { data: folders, isLoading, error } = useFolders(open ? accountId : undefined, current.id);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line">
          <FolderIcon className="text-muted" />
          {value.name}
        </span>
        <Button variant="link" size="sm" onClick={() => setOpen(true)}>
          {s.common.change}
        </Button>
      </span>
    );
  }

  return (
    <div className="card p-3 text-[13px] w-full">
      <nav aria-label="Pasta atual" className="flex flex-wrap items-center gap-1 text-muted mb-2">
        {trail.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="text-faint" width={12} height={12} />}
            <button type="button" className={`rounded px-1 ${i === trail.length - 1 ? 'text-fg font-medium' : 'hover:text-fg'}`} onClick={() => setTrail(trail.slice(0, i + 1))}>
              {f.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="max-h-56 overflow-auto -mx-1">
        {isLoading && <div className="px-2 py-1.5 text-muted">{s.common.loading}</div>}
        {error && <div className="px-2 py-1.5 text-red">{(error as Error).message}</div>}
        {folders?.length === 0 && <div className="px-2 py-1.5 text-muted">—</div>}
        {folders?.map((f) => (
          <button
            key={f.id}
            type="button"
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] text-left"
            onClick={() => setTrail([...trail, f])}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <FolderIcon className="text-muted shrink-0" />
              <span className="truncate">{f.name}</span>
            </span>
            <ChevronRight className="text-faint shrink-0" width={12} height={12} />
          </button>
        ))}
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
