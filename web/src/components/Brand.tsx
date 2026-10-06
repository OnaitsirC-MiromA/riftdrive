import { Link } from 'react-router-dom';

// O portal: porta luminosa (ciano → violeta); a seta entra apagada e sai
// nítida do outro lado — "o arquivo aparece lá". Com `animated`, a seta
// atravessa (vira o loader do app); sob prefers-reduced-motion, fica parada.
export function PortalMark({ size = 24, animated = false, className = '' }: { size?: number; animated?: boolean; className?: string }) {
  const id = 'rift-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={`${animated ? 'rift-animated' : ''} ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset=".5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      <rect x="18" y="10" width="12" height="28" rx="6" fill={`url(#${id})`} opacity=".45" />
      <rect x="14" y="6" width="20" height="36" rx="10" stroke={`url(#${id})`} strokeWidth="2.4" />
      <g className="rift-arrow">
        <path d="M4 24h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".4" />
        <path d="M30 24h12M37.5 19.5 42 24l-4.5 4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function Brand({ size = 'md', to = '/' }: { size?: 'md' | 'lg'; to?: string | null }) {
  const lockup = (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-[-0.02em] ${size === 'lg' ? 'text-3xl' : 'text-[15px]'}`}>
      <PortalMark size={size === 'lg' ? 40 : 24} className="text-fg" />
      <span>
        Rift<span className="font-normal text-muted">Drive</span>
      </span>
    </span>
  );
  return to ? (
    <Link to={to} className="rounded-md hover:opacity-90" aria-label="RiftDrive — início">
      {lockup}
    </Link>
  ) : (
    lockup
  );
}
