import { useState } from 'react';
import { Button } from './Button';
import { CopyIcon } from './icons';
import { s } from '../i18n/strings';

// O empurrão para o caminho bom: um pedido pronto para o dono compartilhar a
// pasta com a conta de destino — aí a cópia vira pelo rift.
export function ShareRequest({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o texto abaixo:', text);
    }
  };
  return (
    <Button size="sm" onClick={copy} aria-live="polite">
      <CopyIcon width={14} height={14} />
      {copied ? s.analysis.copied : s.analysis.copyRequest}
    </Button>
  );
}
