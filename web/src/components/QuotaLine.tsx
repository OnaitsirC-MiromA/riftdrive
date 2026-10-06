import { useQuota } from '../api/hooks';
import { formatBytes, formatTime } from '../lib/format';
import { s } from '../i18n/strings';

// "Cota de hoje: 288 GB restantes · renova às 04:00" — ou "Sem limite".
export function QuotaLine({ accountId, className = '' }: { accountId?: string; className?: string }) {
  const { data } = useQuota(accountId);
  if (!data) return null;
  return (
    <span className={`text-[13px] text-muted ${className}`}>
      {data.mode === 'unlimited' ? (
        s.quota.unlimited
      ) : (
        <>
          {s.quota.line('', '').split('  ')[0]}
          <span className="text-fg font-medium">{formatBytes(data.remainingBytes)}</span>
          {` restantes · renova às ${formatTime(data.resetAt)}`}
        </>
      )}
    </span>
  );
}
