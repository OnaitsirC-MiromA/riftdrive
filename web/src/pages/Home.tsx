import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError, type Inspection } from '../api/client';
import { useAccounts, useInfo, useInspectProgress, useJobs } from '../api/hooks';
import { Shell } from '../components/Shell';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { QuotaLine } from '../components/QuotaLine';
import { PortalMark } from '../components/Brand';
import { FolderBrowser, type PickedFolder } from '../components/FolderPicker';
import { FolderIcon, PeopleIcon, ShortcutIcon, StarIcon } from '../components/icons';
import { AnalysisCard } from './home/AnalysisCard';
import { JobLists } from './home/JobLists';
import { s } from '../i18n/strings';

/** Pasta escolhida no navegador, com a conta por onde ela foi encontrada. */
interface PickedSource extends PickedFolder {
  accountEmail: string;
}

type DestOverride = { destAccountId: string; destParentId: string; destParentName: string };

// Token para acompanhar a leitura; fora de contexto seguro (acesso por IP) não há randomUUID.
const newToken = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export default function Home() {
  const info = useInfo();
  const { data: accounts = [] } = useAccounts();
  const { data: jobs = [] } = useJobs();
  const [link, setLink] = useState('');
  const [source, setSource] = useState<PickedSource | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseAccountId, setBrowseAccountId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  // Primeira análise: a tela mostra "Lendo a pasta…" no lugar do cartão.
  const [analyzing, setAnalyzing] = useState(false);
  // Trocou o destino com um cartão na tela: o cartão fica, com o status ao lado.
  const [reinspect, setReinspect] = useState<{ text: string; token: string | null } | null>(null);
  const [progressToken, setProgressToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useInspectProgress(progressToken ?? reinspect?.token ?? null);
  const filesSeen = progress.data ?? null;

  if (info.data && (!info.data.configured.client || info.data.configured.accounts === 0)) return <Navigate to="/configurar" replace />;

  // Quem navega começa pela conta de destino padrão: achar a pasta ali é cair no rift.
  const browseAccount = accounts.find((a) => a.id === browseAccountId) ?? accounts.find((a) => a.isDefaultDest) ?? accounts[0];
  // O analisador aceita o link colado ou o id da pasta escolhida no navegador.
  const target = source?.id ?? link.trim();

  const analyze = async (what: string, dest?: DestOverride) => {
    if (!what || analyzing || reinspect) return;
    // Com um cartão na tela e a mesma conta de destino, o servidor reaproveita a
    // árvore e só confere o conflito: instantâneo, sem contador. Outra conta relê.
    const previous = dest && inspection ? inspection : null;
    const fast = Boolean(previous && dest && dest.destAccountId === previous.destAccountId);
    const token = fast ? null : newToken();
    setError(null);
    if (previous) {
      const email = accounts.find((a) => a.id === dest?.destAccountId)?.email ?? '';
      setReinspect({ text: fast ? s.analysis.checkingDest : s.analysis.rereading(email), token });
    } else {
      setAnalyzing(true);
      setProgressToken(token);
    }
    try {
      setInspection(await api.inspect({ link: what, ...dest, inspectionId: previous?.inspectionId, progressToken: token ?? undefined }));
    } catch (err) {
      if (!previous) setInspection(null);
      setError(err instanceof ApiError ? err.message : s.common.error);
    } finally {
      setAnalyzing(false);
      setReinspect(null);
      setProgressToken(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void analyze(target);
  };

  // Escolheu no navegador: a análise dispara na hora, sem segundo clique.
  const choose = (f: PickedFolder) => {
    setBrowsing(false);
    setLink('');
    setSource({ ...f, accountEmail: browseAccount?.email ?? '' });
    void analyze(f.id);
  };

  const clear = () => {
    setLink('');
    setSource(null);
    setBrowsing(false);
    setInspection(null);
    setError(null);
  };

  const SourceIcon = source?.starred ? StarIcon : source?.shortcut ? ShortcutIcon : source?.shared ? PeopleIcon : FolderIcon;

  return (
    <Shell>
      <section className="grid gap-3 mb-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{s.home.title}</h1>
        <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
          {source ? (
            <span className="flex-1 min-w-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-surface border border-line text-[14px]">
              <SourceIcon className={source.starred ? 'text-amber shrink-0' : 'text-muted shrink-0'} width={14} height={14} />
              <span className="truncate">{source.name}</span>
              <span className="text-muted text-[12px] truncate">· {source.accountEmail}</span>
            </span>
          ) : (
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={s.home.placeholder}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label={s.home.placeholder}
              className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-3.5 py-2.5 text-[14px] font-mono text-fg placeholder:font-sans placeholder:text-faint focus-visible:border-violet/60"
            />
          )}
          {!source && (
            <Button onClick={() => setBrowsing((b) => !b)} aria-expanded={browsing} disabled={!browseAccount}>
              <FolderIcon width={14} height={14} />
              {s.home.browse}
            </Button>
          )}
          {inspection || link || source ? <Button onClick={clear}>{s.home.clear}</Button> : null}
          <Button variant="primary" type="submit" disabled={analyzing || !target}>
            {s.home.analyze}
          </Button>
        </form>
        {browsing && browseAccount && !source && (
          <FolderBrowser accountId={browseAccount.id} accounts={accounts} onAccountChange={setBrowseAccountId} mode="source" onChoose={choose} onClose={() => setBrowsing(false)} />
        )}
        {accounts.length > 0 && <QuotaLine />}
        {analyzing && (
          <div className="flex items-center gap-3 text-muted text-[13px] card px-4 py-3" aria-live="polite">
            <PortalMark size={22} animated className="text-fg" />
            {s.home.analyzing}
            {filesSeen !== null && <span className="num">· {s.home.filesSeen(filesSeen)}</span>}
          </div>
        )}
        {error && !analyzing && <Banner tone="error">{error}</Banner>}
        {inspection && !analyzing && (
          <AnalysisCard
            key={inspection.inspectionId}
            inspection={inspection}
            accounts={accounts}
            onReinspect={(dest) => void analyze(target, dest)}
            onCancel={clear}
            onStarted={clear}
            busy={reinspect ? { text: reinspect.text, filesSeen: reinspect.token ? filesSeen : null } : null}
          />
        )}
      </section>

      <JobLists jobs={jobs} />
    </Shell>
  );
}
