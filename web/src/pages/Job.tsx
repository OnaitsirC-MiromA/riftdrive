import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FileStatus } from '../api/client';
import { isActive, isFinished, isPaused, useJob, useJobActions, useJobFiles } from '../api/hooks';
import { Shell } from '../components/Shell';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { PathChip } from '../components/PathChip';
import { ProgressBar } from '../components/JobCard';
import { ChevronLeft, ExternalIcon } from '../components/icons';
import { formatBytes, formatDate, formatEta, formatSpeed, formatTime } from '../lib/format';
import { s } from '../i18n/strings';

const FILE_TABS: FileStatus[] = ['pending', 'done', 'skipped_blocked', 'skipped_native', 'deferred', 'missing', 'failed'];
const PAGE = 200;

export default function Job() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error } = useJob(id);
  const actions = useJobActions();
  const [tab, setTab] = useState<FileStatus>('pending');
  const [limit, setLimit] = useState(PAGE);
  const { data: files = [], isLoading } = useJobFiles(id, tab, limit);

  if (error) {
    return (
      <Shell>
        <Banner tone="error">{s.job.notFound}</Banner>
      </Shell>
    );
  }
  if (!data) return <Shell>{null}</Shell>;
  const { job, counts } = data;
  const paused = isPaused(job);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Shell maxWidth="max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg mb-4">
        <ChevronLeft width={14} height={14} /> {s.nav.back}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.02em] truncate">{job.name}</h1>
          <p className="text-[13px] text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <PathChip path={job.path} />
            <span>{s.job.status[job.status]}</span>
            {job.mode === 'merge' && <span>· mesclagem</span>}
            <span>· {job.source.readerEmail} → {job.dest.accountEmail}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(job.status === 'running' || job.status === 'queued') && <Button onClick={() => actions.pause.mutate(job.id)}>{s.job.pause}</Button>}
          {paused && (
            <Button variant="primary" onClick={() => actions.resume.mutate(job.id)}>
              {s.job.resume}
            </Button>
          )}
          {!isFinished(job) && <Button onClick={() => window.confirm(s.job.confirmCancel) && actions.cancel.mutate(job.id)}>{s.job.cancel}</Button>}
          {job.dest.folderId && (
            <a href={`https://drive.google.com/drive/folders/${job.dest.folderId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] px-3.5 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.11] font-medium">
              {s.job.openInDrive} <ExternalIcon width={13} height={13} />
            </a>
          )}
          {!isActive(job) && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(s.job.confirmRemove)) actions.remove.mutate(job.id, { onSuccess: () => navigate('/') });
              }}
            >
              {s.job.remove}
            </Button>
          )}
        </div>
      </header>

      <section className="card p-4 sm:p-5 mt-5 grid gap-3">
        <ProgressBar job={job} />
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 num text-muted">
          <span>{s.job.files(job.done.files, job.totals.files)}</span>
          <span>
            {s.job.bytes(formatBytes(job.done.bytes), formatBytes(job.totals.bytes))}
            {job.stats && job.stats.bytesPerSec > 0 && <> · {formatSpeed(job.stats.bytesPerSec)}</>}
            {job.stats?.etaSec != null && job.stats.etaSec > 0 && <> · {s.job.eta(formatEta(job.stats.etaSec))}</>}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted">
          {job.startedAt && <span>{s.job.started} {formatDate(job.startedAt)}</span>}
          {job.finishedAt && <span>{s.job.finished} {formatDate(job.finishedAt)}</span>}
          <span>
            {job.dest.parentName} / {job.dest.finalName}
          </span>
        </div>
        {paused && (
          <Banner tone={job.status === 'paused' ? 'info' : 'warn'}>
            {job.resumeReason ?? s.job.status[job.status]}
            {job.pausedUntil && job.status !== 'paused' && <> · {s.job.resumesAt(formatTime(job.pausedUntil))}</>}
            {job.status === 'paused_auth' && (
              <>
                {' '}
                <Link to="/configuracoes" className="text-violet-strong hover:underline font-medium">
                  {s.job.reconnect} →
                </Link>
              </>
            )}
          </Banner>
        )}
        {job.message && isFinished(job) && <p className="text-[13px] text-muted">{job.message}</p>}
      </section>

      <section className="mt-7">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="label">
            {s.job.filesTitle} · {total.toLocaleString('pt-BR')}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
          {FILE_TABS.filter((t) => counts[t] > 0 || t === tab).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setLimit(PAGE);
              }}
              className={`text-[12px] px-2.5 py-1 rounded-md ${tab === t ? 'bg-violet/[0.18] text-violet-strong font-semibold' : 'bg-white/[0.06] text-muted hover:text-fg'}`}
            >
              {s.job.fileStatus[t]} <span className="num">{counts[t]}</span>
            </button>
          ))}
        </div>
        {tab === 'deferred' && counts.deferred > 0 && <p className="text-[12.5px] text-muted mb-2">{s.job.deferredHint}</p>}
        <div className="card divide-y divide-line">
          {isLoading && <div className="px-4 py-3 text-muted text-[13px]">{s.common.loading}</div>}
          {!isLoading && files.length === 0 && <div className="px-4 py-3 text-muted text-[13px]">{s.job.noFiles}</div>}
          {files.map((f) => (
            <div key={f.relPath} className="px-4 py-2.5 grid gap-0.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="num truncate" title={f.relPath}>
                  {f.relPath}
                </span>
                <span className="flex items-center gap-3 shrink-0 text-muted num">
                  {f.status === 'pending' && job.path === 'machine' && f.bytesUploaded > 0 && <span>{formatBytes(f.bytesUploaded)} / </span>}
                  <span>{formatBytes(f.size)}</span>
                  <a href={f.srcUrl} target="_blank" rel="noopener noreferrer" className="text-violet-strong hover:underline" title={s.job.openSource}>
                    <ExternalIcon width={13} height={13} />
                  </a>
                </span>
              </div>
              {f.error && (f.status === 'failed' || f.status === 'skipped_blocked' || f.status === 'missing' || f.status === 'skipped_native') && (
                <p className="text-[12px] text-muted truncate" title={f.error}>
                  {f.error}
                </p>
              )}
            </div>
          ))}
        </div>
        {files.length >= limit && (
          <Button variant="link" size="sm" className="mt-2" onClick={() => setLimit((l) => l + PAGE)}>
            {s.job.loadMore}
          </Button>
        )}
      </section>
    </Shell>
  );
}
