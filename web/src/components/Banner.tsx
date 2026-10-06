import type { ReactNode } from 'react';

type Tone = 'info' | 'warn' | 'error' | 'success';

// Superfície tingida, sem borda lateral colorida: o tom vem do fundo e do texto.
const TONE: Record<Tone, string> = {
  info: 'bg-violet/10 text-fg',
  warn: 'bg-amber/10 text-fg',
  error: 'bg-red/10 text-fg',
  success: 'bg-green/10 text-fg',
};

export function Banner({ tone = 'info', children, className = '', role }: { tone?: Tone; children: ReactNode; className?: string; role?: string }) {
  return (
    <div role={role ?? (tone === 'error' ? 'alert' : undefined)} className={`rounded-lg px-3.5 py-3 text-[13px] leading-relaxed ${TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}
