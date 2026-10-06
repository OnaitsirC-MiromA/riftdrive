import type { JobPath } from '../api/client';
import { s } from '../i18n/strings';

// O chip que diz, em toda cópia, qual rota está em uso — e por quê a de
// "compartilhado comigo" é melhor. Violeta = rift; âmbar = pela máquina.
export function PathChip({ path, size = 'sm' }: { path: JobPath; size?: 'sm' | 'md' }) {
  const rift = path === 'rift';
  return (
    <span
      title={rift ? s.path.riftTitle : s.path.machineTitle}
      className={`inline-flex items-center rounded font-semibold tracking-[0.02em] whitespace-nowrap ${size === 'md' ? 'text-[12px] px-2.5 py-1' : 'text-[10.5px] px-2 py-0.5'} ${
        rift ? 'bg-violet/[0.18] text-violet-strong' : 'bg-amber/[0.16] text-amber'
      }`}
    >
      {rift ? s.path.rift : s.path.machine}
    </span>
  );
}
