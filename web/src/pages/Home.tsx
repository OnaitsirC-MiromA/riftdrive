import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError, type Inspection } from '../api/client';
import { useAccounts, useInfo, useJobs } from '../api/hooks';
import { Shell } from '../components/Shell';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { QuotaLine } from '../components/QuotaLine';
import { PortalMark } from '../components/Brand';
import { AnalysisCard } from './home/AnalysisCard';
import { JobLists } from './home/JobLists';
import { s } from '../i18n/strings';

export default function Home() {
  const info = useInfo();
  const { data: accounts = [] } = useAccounts();
  const { data: jobs = [] } = useJobs();
  const [link, setLink] = useState('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (info.data && (!info.data.configured.client || info.data.configured.accounts === 0)) return <Navigate to="/configurar" replace />;

  const analyze = async (dest?: { destAccountId: string; destParentId: string; destParentName: string }) => {
    if (!link.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      setInspection(await api.inspect({ link: link.trim(), ...dest }));
    } catch (err) {
      setInspection(null);
      setError(err instanceof ApiError ? err.message : s.common.error);
    } finally {
      setAnalyzing(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void analyze();
  };

  const clear = () => {
    setLink('');
    setInspection(null);
    setError(null);
  };

  return (
    <Shell>
      <section className="grid gap-3 mb-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{s.home.title}</h1>
        <form onSubmit={onSubmit} className="flex gap-2">
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
          {inspection || link ? (
            <Button onClick={clear}>{s.home.clear}</Button>
          ) : null}
          <Button variant="primary" type="submit" disabled={analyzing || !link.trim()}>
            {s.home.analyze}
          </Button>
        </form>
        <QuotaLine />
        {analyzing && (
          <div className="flex items-center gap-3 text-muted text-[13px] card px-4 py-3" aria-live="polite">
            <PortalMark size={22} animated className="text-fg" />
            {s.home.analyzing}
          </div>
        )}
        {error && !analyzing && <Banner tone="error">{error}</Banner>}
        {inspection && !analyzing && (
          <AnalysisCard
            key={inspection.inspectionId}
            inspection={inspection}
            accounts={accounts}
            onReinspect={(dest) => void analyze(dest)}
            onCancel={clear}
            onStarted={clear}
          />
        )}
      </section>

      <JobLists jobs={jobs} />
    </Shell>
  );
}
