import { useState } from 'react';
import type { Account, Inspection } from '../../api/client';
import { useCreateJob } from '../../api/hooks';
import { formatBytes, formatTime } from '../../lib/format';
import { Banner } from '../../components/Banner';
import { PortalMark } from '../../components/Brand';
import { Button } from '../../components/Button';
import { Field, Select } from '../../components/Field';
import { FolderPicker, type PickedFolder } from '../../components/FolderPicker';
import { PathChip } from '../../components/PathChip';
import { ShareRequest } from '../../components/ShareRequest';
import { s } from '../../i18n/strings';

interface Props {
  inspection: Inspection;
  accounts: Account[];
  onReinspect: (dest: { destAccountId: string; destParentId: string; destParentName: string }) => void;
  onCancel: () => void;
  onStarted: () => void;
  /** Reconferindo o destino: o cartão fica, com o status ao lado dele e o início travado. */
  busy?: { text: string; filesSeen: number | null } | null;
}

// O coração do app: o que a análise descobriu, por qual caminho vai, o que fica
// de fora, onde vai parar e se cabe na cota. Um botão inicia.
export function AnalysisCard({ inspection: i, accounts, onReinspect, onCancel, onStarted, busy = null }: Props) {
  const [name, setName] = useState(i.name);
  const [conflict, setConflict] = useState<'rename' | 'merge'>('rename');
  const [showBlocked, setShowBlocked] = useState(false);
  const create = useCreateJob();
  const dest: PickedFolder = { id: i.destParentId, name: i.destParentName };
  const rift = i.path === 'rift';

  const start = () =>
    create.mutate(
      { inspectionId: i.inspectionId, name: name.trim() || i.name, destAccountId: i.destAccountId, destParentId: i.destParentId, destParentName: i.destParentName, conflict: i.destConflict ? conflict : undefined },
      { onSuccess: onStarted },
    );

  return (
    <section className="card p-4 sm:p-5 grid gap-4" aria-label="Análise da pasta">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold">{i.name}</h2>
        <span className="num text-muted">
          {s.analysis.files(i.totals.files)} · {formatBytes(i.totals.bytes)}
          {i.owner && <> · {s.analysis.from(i.owner)}</>}
        </span>
      </header>

      <dl className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-3 text-[13px] items-baseline">
        <dt className="label pt-0.5">{s.analysis.pathLabel}</dt>
        <dd className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <PathChip path={i.path} size="md" />
            {!rift && <span className="text-muted">· {s.analysis.keepOpen}</span>}
          </div>
          {rift ? (
            <p className="text-muted leading-relaxed">{s.analysis.riftText(i.destEmail)}</p>
          ) : (
            <Banner tone="warn">
              <p>
                {s.analysis.machineText(i.destEmail)} <span className="text-muted">{s.analysis.machineHint}</span>
              </p>
              {i.shareRequestText && (
                <div className="mt-2">
                  <ShareRequest text={i.shareRequestText} />
                </div>
              )}
            </Banner>
          )}
        </dd>

        {(i.blocked.count > 0 || i.native.count > 0) && (
          <>
            <dt className="label pt-0.5">{s.analysis.blockedLabel}</dt>
            <dd className="grid gap-1.5">
              {i.blocked.count > 0 && (
                <div>
                  <span className="text-amber">{s.analysis.blocked(i.blocked.count)}</span>{' '}
                  <span className="text-muted">
                    — {s.analysis.blockedText} · {s.analysis.copyable(formatBytes(i.copyableBytes))}
                  </span>{' '}
                  <Button variant="link" size="sm" onClick={() => setShowBlocked((v) => !v)}>
                    {showBlocked ? s.analysis.hide : s.analysis.seeWhich}
                  </Button>
                  {showBlocked && (
                    <ul className="mt-1.5 grid gap-0.5 num text-muted max-h-40 overflow-auto">
                      {i.blocked.sample.map((b) => (
                        <li key={b.relPath} className="truncate">
                          {b.relPath}
                        </li>
                      ))}
                      {i.blocked.count > i.blocked.sample.length && <li>… e mais {i.blocked.count - i.blocked.sample.length}</li>}
                    </ul>
                  )}
                </div>
              )}
              {i.native.count > 0 && <div className="text-muted">{s.analysis.native(i.native.count)}</div>}
            </dd>
          </>
        )}

        <dt className="label pt-0.5">{s.analysis.destLabel}</dt>
        <dd className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 ? (
              <Select aria-label="Conta de destino" value={i.destAccountId} onChange={(e) => onReinspect({ destAccountId: e.target.value, destParentId: 'root', destParentName: s.common.myDrive })} className="w-auto">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="px-2.5 py-1.5 rounded-lg bg-surface border border-line">{i.destEmail}</span>
            )}
            <FolderPicker accountId={i.destAccountId} value={dest} onChange={(f) => onReinspect({ destAccountId: i.destAccountId, destParentId: f.id, destParentName: f.name })} />
            {busy && (
              <span className="basis-full inline-flex items-center gap-2 text-muted text-[12px]" aria-live="polite">
                <PortalMark size={16} animated className="text-fg" />
                {busy.text}
                {busy.filesSeen !== null && <span className="num">· {s.home.filesSeen(busy.filesSeen)}</span>}
              </span>
            )}
          </div>
          <Field label={s.analysis.nameLabel} value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
          {i.destConflict && (
            <Banner tone="warn">
              <p className="mb-2">{s.analysis.conflictText(i.name)}</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="conflict" checked={conflict === 'rename'} onChange={() => setConflict('rename')} className="mt-1 accent-violet" />
                <span>{s.analysis.conflictRename(name.trim() || i.name)}</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer mt-1.5">
                <input type="radio" name="conflict" checked={conflict === 'merge'} onChange={() => setConflict('merge')} className="mt-1 accent-violet" />
                <span>{s.analysis.conflictMerge}</span>
              </label>
            </Banner>
          )}
        </dd>

        <dt className="label pt-0.5">{s.analysis.quotaLabel}</dt>
        <dd className="text-muted">
          {i.quota.mode === 'unlimited' ? (
            s.quota.unlimitedShort
          ) : i.quota.fits ? (
            <>
              {s.quota.fits} · <span className="text-fg font-medium">{formatBytes(i.quota.remainingBytes)}</span> restantes, renova às {formatTime(i.quota.resetAt)}
            </>
          ) : (
            <span className="text-amber">{s.quota.doesNotFit(formatTime(i.quota.resetAt))}</span>
          )}
        </dd>
      </dl>

      {create.error && <Banner tone="error">{(create.error as Error).message}</Banner>}

      <footer className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>{s.analysis.cancel}</Button>
        <Button variant="primary" onClick={start} disabled={create.isPending || Boolean(busy)}>
          {create.isPending ? s.analysis.starting : s.analysis.start}
        </Button>
      </footer>
    </section>
  );
}
