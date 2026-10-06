import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { GearIcon } from './icons';
import { useAccountActions, useAccounts } from '../api/hooks';
import { s } from '../i18n/strings';

// A casca de todas as telas depois da configuração: marca à esquerda, conta de
// destino padrão e engrenagem à direita, conteúdo centrado numa coluna só.
export function Shell({ children, maxWidth = 'max-w-2xl', right }: { children: ReactNode; maxWidth?: string; right?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-line">
        <Brand />
        <div className="flex items-center gap-2">
          {right ?? <AccountChip />}
          <Link to="/configuracoes" aria-label={s.nav.settings} title={s.nav.settings} className="p-2 rounded-md text-muted hover:text-fg hover:bg-white/[0.06]">
            <GearIcon />
          </Link>
        </div>
      </header>
      <main className={`mx-auto w-full ${maxWidth} px-4 sm:px-6 py-7 flex-1`}>{children}</main>
    </div>
  );
}

// Qual conta recebe as cópias. Trocar aqui troca o destino padrão.
export function AccountChip() {
  const { data: accounts } = useAccounts();
  const { setDefault } = useAccountActions();
  if (!accounts?.length) return null;
  const current = accounts.find((a) => a.isDefaultDest) ?? accounts[0];
  if (accounts.length === 1) {
    return (
      <span className={`text-[12px] px-2.5 py-1 rounded-md bg-white/[0.07] ${current.status === 'disconnected' ? 'text-amber' : 'text-muted'}`} title={current.email}>
        {current.email}
      </span>
    );
  }
  return (
    <select
      aria-label="Conta de destino padrão"
      value={current.id}
      onChange={(e) => setDefault.mutate(e.target.value)}
      className="text-[12px] px-2.5 py-1 rounded-md bg-white/[0.07] text-muted border-0 max-w-[220px]"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.email}
          {a.status === 'disconnected' ? ' (desconectada)' : ''}
        </option>
      ))}
    </select>
  );
}
