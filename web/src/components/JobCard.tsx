import { useNavigate } from 'react-router-dom';
import type { Job } from '../api/client';
import { isActive, isFinished, isPaused, useJobActions } from '../api/hooks';
import { formatBytes, formatDate, formatEta, formatSpeed, formatTime, percent } from '../lib/format';
import { PathChip } from './PathChip';
import { DotsIcon } from './icons';
import { s } from '../i18n/strings';

export function ProgressBar({ job, className = '' }: { job: Job; className?: string }) {
  const pct = job.status === 'done' ? 100 : percent(job.done.bytes, job.totals.bytes);
  const tone = job.status === 'done' ? 'bg-green' : isPaused(job) ? 'bg-amber' : job.status === 'failed' || job.status === 'canceled' ? 'bg-white/20' : 'bg-gradient-to-r from-cyan to-violet';
  return (
    <div className={`h-1.5 rounded-full bg-white/[0.08] overflow-hidden ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function JobMenu({ job }: { job: Job }) {
  const actions = useJobActions();
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <details className="relative" onClick={(e) => e.stopPropagation()}>
      <summary className="list-none cursor-pointer p-1.5 rounded-md text-muted hover:text-fg hover:bg-white/[0.08]" aria-label="Ações">
        <DotsIcon />
      </summary>
      <div className="absolute right-0 mt-1 z-10 card p-1 min-w-[180px] text-[13px]">
        {job.status === 'running' || job.status === 'queued' ? (
          <MenuItem onClick={act(() => actions.pause.mutate(job.id))}>{s.job.pause}</MenuItem>
        ) : isPaused(job) ? (
          <MenuItem onClick={act(() => actions.resume.mutate(job.id))}>{s.job.resume}</MenuItem>
        ) : null}
        {!isFinished(job) && <MenuItem onClick={act(() => window.confirm(s.job.confirmCancel) && actions.cancel.mutate(job.id))}>{s.job.cancel}</MenuItem>}
        {job.dest.folderId && (
          <MenuItem onClick={act(() => window.open(`https://drive.google.com/drive/folders/${job.dest.folderId}`, '_blank', 'noopener'))}>{s.job.openInDrive}</MenuItem>
        )}
        {!isActive(job) && (
          <MenuItem tone="danger" onClick={act(() => window.confirm(s.job.confirmRemove) && actions.remove.mutate(job.id))}>
            {s.job.remove}
          </MenuItem>
        )}
      </div>
    </details>
  );
}

function MenuItem({ children, onClick, tone }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; tone?: 'danger' }) {
  return (
    <button type="button" onClick={onClick} className={`w-full text-left px-3 py-1.5 rounded-md hover:bg-white/[0.08] ${tone === 'danger' ? 'text-red' : ''}`}>
      {children}
    </button>
  );
}

export function JobCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  const navigate = useNavigate();
  const open = () => navigate(`/copia/${job.id}`);
  const paused = isPaused(job);
  return (
    <article
      className={`card cursor-pointer hover:border-white/[0.14] transition-colors ${compact ? 'px-4 py-3' : 'p-4'}`}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      role="link"
      aria-label={job.name}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2.5">
          {compact && <span className={`text-[11px] px-1.5 py-0.5 rounded ${job.status === 'done' ? 'bg-green/[0.16] text-green' : 'bg-white/[0.08] text-muted'}`}>{s.job.status[job.status]}</span>}
          <h3 className="font-semibold truncate">{job.name}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PathChip path={job.path} />
          <JobMenu job={job} />
        </div>
      </div>

      {!compact && (
        <>
          <ProgressBar job={job} className="mt-3" />
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 num text-muted">
            <span>
              {s.job.files(job.done.files, job.totals.files)}
              {job.skippedFiles > 0 && <> · {s.job.blockedShort(job.skippedFiles)}</>}
            </span>
            <span>
              {s.job.bytes(formatBytes(job.done.bytes), formatBytes(job.totals.bytes))}
              {job.stats && job.stats.bytesPerSec > 0 && <> · {formatSpeed(job.stats.bytesPerSec)}</>}
              {job.stats?.etaSec != null && job.stats.etaSec > 0 && <> · {formatEta(job.stats.etaSec)}</>}
            </span>
          </div>
          {paused && (
            <p className="mt-2 text-[12.5px] text-amber">
              {job.resumeReason}
              {job.pausedUntil && job.status !== 'paused' && <> · {s.job.resumesAt(formatTime(job.pausedUntil))}</>}
            </p>
          )}
        </>
      )}

      {compact && (
        <p className="mt-1 text-[12px] text-muted truncate">
          {formatDate(job.finishedAt ?? job.createdAt)} · {s.job.files(job.done.files, job.totals.files)} · {formatBytes(job.done.bytes)}
          {job.message && <> · {job.message}</>}
        </p>
      )}
    </article>
  );
}
