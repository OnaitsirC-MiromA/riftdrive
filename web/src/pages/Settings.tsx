import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Copy, DiffGroup } from '../api/client';
import { useAccountActions, useAccounts, useAuthClient, useCopies, useCopyActions, usePatchSettings, useSettings } from '../api/hooks';
import { Shell } from '../components/Shell';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { FolderPicker } from '../components/FolderPicker';
import { PathChip } from '../components/PathChip';
import { ChevronLeft, ExternalIcon } from '../components/icons';
import { formatBytes, formatDate } from '../lib/format';
import { s } from '../i18n/strings';

export default function Settings() {
  return (
    <Shell maxWidth="max-w-2xl">
      <Link to="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg mb-4">
        <ChevronLeft width={14} height={14} /> {s.nav.back}
      </Link>
      <h1 className="text-xl font-semibold tracking-[-0.02em] mb-6">{s.settings.title}</h1>
      <div className="grid gap-9">
        <QuotaSection />
        <AccountsSection />
        <CopySection />
        <CopiesSection />
        <OAuthSection />
      </div>
    </Shell>
  );
}

function SectionTitle({ children, intro }: { children: React.ReactNode; intro?: string }) {
  return (
    <header className="grid gap-1 mb-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {intro && <p className="text-[13px] text-muted leading-relaxed">{intro}</p>}
    </header>
  );
}

function Radio({ checked, onChange, title, children }: { checked: boolean; onChange: () => void; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className={`grid grid-cols-[16px_1fr] gap-3 p-3 rounded-lg border cursor-pointer ${checked ? 'border-violet/60 bg-violet/[0.07]' : 'border-line'}`}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 accent-violet" />
      <span className="grid gap-1 text-[13px]">
        <span className="font-semibold">{title}</span>
        <span className="text-muted leading-relaxed">{children}</span>
      </span>
    </label>
  );
}

function QuotaSection() {
  const { data } = useSettings();
  const patch = usePatchSettings();
  const [gb, setGb] = useState('');
  const [hour, setHour] = useState('');
  useEffect(() => {
    if (data) {
      setGb(String(data.quotaGb));
      setHour(String(data.quotaResetHour));
    }
  }, [data]);
  if (!data) return null;
  const saveNumbers = () => {
    const quotaGb = Number(gb.replace(',', '.'));
    const quotaResetHour = Number(hour);
    const body: { quotaGb?: number; quotaResetHour?: number } = {};
    if (Number.isFinite(quotaGb) && quotaGb > 0 && quotaGb !== data.quotaGb) body.quotaGb = quotaGb;
    if (Number.isInteger(quotaResetHour) && quotaResetHour >= 0 && quotaResetHour <= 23 && quotaResetHour !== data.quotaResetHour) body.quotaResetHour = quotaResetHour;
    if (Object.keys(body).length) patch.mutate(body);
  };
  const numInput = 'w-16 bg-surface border border-line rounded-md px-2 py-0.5 text-center num text-fg';
  return (
    <section>
      <SectionTitle intro={s.settings.quotaIntro}>{s.settings.quotaTitle}</SectionTitle>
      <div className="grid gap-2">
        <Radio
          checked={data.quotaMode === 'limit'}
          onChange={() => patch.mutate({ quotaMode: 'limit' })}
          title={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {s.settings.limitTo}
              <input aria-label="GB por dia" value={gb} onChange={(e) => setGb(e.target.value)} onBlur={saveNumbers} onKeyDown={(e) => e.key === 'Enter' && saveNumbers()} inputMode="decimal" className={numInput} />
              {s.settings.gbPerDay}
              <input aria-label="Hora da renovação" value={hour} onChange={(e) => setHour(e.target.value)} onBlur={saveNumbers} onKeyDown={(e) => e.key === 'Enter' && saveNumbers()} inputMode="numeric" className={numInput} />
              :00
            </span>
          }
        >
          {s.settings.limitText}
        </Radio>
        <Radio checked={data.quotaMode === 'unlimited'} onChange={() => patch.mutate({ quotaMode: 'unlimited' })} title={s.settings.unlimited}>
          {s.settings.unlimitedText}
        </Radio>
        {patch.error && <Banner tone="error">{(patch.error as Error).message}</Banner>}
      </div>
    </section>
  );
}

function AccountsSection() {
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const { remove, setDefault, test } = useAccountActions();
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  return (
    <section>
      <SectionTitle>{s.settings.accountsTitle}</SectionTitle>
      <div className="grid gap-2">
        {accounts.map((a) => (
          <div key={a.id} className="card px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-medium truncate">{a.email}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${a.status === 'ok' ? 'bg-green/[0.16] text-green' : 'bg-amber/[0.16] text-amber'}`}>
                {a.status === 'ok' ? s.settings.connected : s.settings.disconnected(a.failedSince ? formatDate(a.failedSince) : '')}
              </span>
              {a.isDefaultDest && <span className="text-muted">{s.settings.defaultDest}</span>}
              {testResult[a.id] && <span className="text-muted">{testResult[a.id]}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {!a.isDefaultDest && (
                <Button size="sm" onClick={() => setDefault.mutate(a.id)}>
                  {s.settings.makeDefault}
                </Button>
              )}
              <Button
                size="sm"
                disabled={test.isPending}
                onClick={() => test.mutate(a.id, { onSuccess: (r) => setTestResult((m) => ({ ...m, [a.id]: r.ok ? s.settings.testOk(r.email ?? '') : (r.error ?? s.common.error) })) })}
              >
                {test.isPending ? s.settings.testing : s.settings.test}
              </Button>
              <Button size="sm" onClick={() => navigate(`/configurar?reconectar=${encodeURIComponent(a.email)}`)}>
                {s.settings.reconnect}
              </Button>
              <Button size="sm" variant="danger" onClick={() => window.confirm(s.settings.confirmRemove(a.email)) && remove.mutate(a.id)}>
                {s.settings.remove}
              </Button>
            </div>
          </div>
        ))}
        <Button size="sm" className="justify-self-start" onClick={() => navigate('/configurar?outra=1')}>
          {s.settings.connectAnother}
        </Button>
      </div>
    </section>
  );
}

function CopySection() {
  const { data } = useSettings();
  const { data: accounts = [] } = useAccounts();
  const patch = usePatchSettings();
  if (!data) return null;
  const account = accounts.find((a) => a.id === data.defaultDest?.accountId) ?? accounts.find((a) => a.isDefaultDest) ?? accounts[0];
  const value = data.defaultDest ? { id: data.defaultDest.folderId, name: data.defaultDest.folderName } : { id: 'root', name: s.common.myDrive };
  return (
    <section>
      <SectionTitle>{s.settings.copyTitle}</SectionTitle>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-[13px] items-start">
        <dt className="label pt-1.5">{s.settings.defaultFolder}</dt>
        <dd>
          {account ? (
            <FolderPicker accountId={account.id} value={value} onChange={(f) => patch.mutate({ defaultDest: { accountId: account.id, folderId: f.id, folderName: f.name } })} />
          ) : (
            <span className="text-muted">—</span>
          )}
        </dd>
        <dt className="label pt-0.5">Bloqueados</dt>
        <dd className="text-muted">{s.settings.blockedPolicy}</dd>
      </dl>
    </section>
  );
}

function CopiesSection() {
  const { data: copies = [] } = useCopies();
  return (
    <section>
      <SectionTitle intro={s.settings.copiesIntro}>{s.settings.copiesTitle}</SectionTitle>
      {copies.length === 0 ? <p className="text-[13px] text-muted">{s.settings.noCopies}</p> : <div className="grid gap-2">{copies.map((c) => <CopyRow key={c.id} copy={c} />)}</div>}
    </section>
  );
}

function CopyRow({ copy }: { copy: Copy }) {
  const { check, sync, remove } = useCopyActions();
  const [groups, setGroups] = useState<DiffGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (folder: string) => {
    const next = new Set(selected);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setSelected(next);
  };
  return (
    <div className="card px-4 py-3 grid gap-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-medium truncate">{copy.name}</span>
          <PathChip path={copy.path} />
          <span className="text-muted">{copy.destAccountEmail}</span>
          {copy.lastCheckedAt && <span className="text-muted">· {s.settings.lastChecked(formatDate(copy.lastCheckedAt))}</span>}
          <a href={copy.destUrl} target="_blank" rel="noopener noreferrer" className="text-violet-strong hover:underline inline-flex items-center gap-1">
            <ExternalIcon width={12} height={12} />
          </a>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            disabled={check.isPending}
            onClick={() =>
              check.mutate(copy.id, {
                onSuccess: (r) => {
                  setGroups(r.groups);
                  setSelected(new Set(r.groups.map((g) => g.folder)));
                },
              })
            }
          >
            {check.isPending ? s.settings.checking : s.settings.check}
          </Button>
          <Button size="sm" variant="danger" onClick={() => remove.mutate(copy.id)}>
            {s.settings.forget}
          </Button>
        </div>
      </div>
      {check.error && <Banner tone="error">{(check.error as Error).message}</Banner>}
      {groups && groups.length === 0 && <p className="text-muted">{s.settings.noNews}</p>}
      {groups && groups.length > 0 && (
        <div className="grid gap-1.5 pt-1">
          {groups.map((g) => (
            <label key={g.folder} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selected.has(g.folder)} onChange={() => toggle(g.folder)} className="accent-violet" />
              <span className="font-medium">{g.folder}</span>
              <span className="text-muted">
                · {s.settings.news(g.newFiles, g.updatedFiles)} · {formatBytes(g.bytes)}
              </span>
            </label>
          ))}
          <Button
            size="sm"
            variant="primary"
            className="justify-self-start mt-1"
            disabled={!selected.size || sync.isPending}
            onClick={() => sync.mutate({ id: copy.id, folders: [...selected] }, { onSuccess: () => setGroups(null) })}
          >
            {s.settings.download}
          </Button>
          {sync.error && <Banner tone="error">{(sync.error as Error).message}</Banner>}
        </div>
      )}
    </div>
  );
}

function OAuthSection() {
  const { data } = useAuthClient();
  const navigate = useNavigate();
  if (!data) return null;
  return (
    <section>
      <SectionTitle>{s.settings.oauthTitle}</SectionTitle>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-muted num">{data.configured ? s.settings.oauthText(data.clientIdMasked ?? '') : '—'}</span>
        <Button size="sm" onClick={() => navigate('/configurar')}>
          {s.settings.oauthChange}
        </Button>
      </div>
    </section>
  );
}
