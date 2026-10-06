import { useState } from 'react';
import type { Job } from '../../api/client';
import { isActive, isFinished, isPaused } from '../../api/hooks';
import { JobCard } from '../../components/JobCard';
import { Button } from '../../components/Button';
import { s } from '../../i18n/strings';

const FINISHED_PREVIEW = 5;

function Section({ title, jobs, compact = false }: { title: string; jobs: Job[]; compact?: boolean }) {
  const [all, setAll] = useState(false);
  if (!jobs.length) return null;
  const shown = compact && !all ? jobs.slice(0, FINISHED_PREVIEW) : jobs;
  return (
    <section className="grid gap-2">
      <h2 className="label">
        {title} · {jobs.length}
      </h2>
      {shown.map((j) => (
        <JobCard key={j.id} job={j} compact={compact} />
      ))}
      {compact && jobs.length > FINISHED_PREVIEW && (
        <Button variant="link" size="sm" className="justify-self-start" onClick={() => setAll((v) => !v)}>
          {all ? s.home.seeLess : s.home.seeAll(jobs.length)}
        </Button>
      )}
    </section>
  );
}

export function JobLists({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return <p className="text-center text-muted text-[13px] py-10">{s.home.empty}</p>;
  return (
    <div className="grid gap-6">
      <Section title={s.home.inProgress} jobs={jobs.filter(isActive)} />
      <Section title={s.home.paused} jobs={jobs.filter(isPaused)} />
      <Section title={s.home.finished} jobs={jobs.filter(isFinished)} compact />
    </div>
  );
}
