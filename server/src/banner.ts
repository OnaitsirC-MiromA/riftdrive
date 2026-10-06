export interface BootState {
  version: string;
  dataDir: string;
  url: string;
  changedPort: boolean;
  requestedPort: number;
  openingBrowser: boolean;
  /** Já há OAuth client e pelo menos uma conta conectada. */
  configured: boolean;
}

/**
 * O que o app diz ao subir.
 *
 * É o primeiro contato de quem acabou de instalar, e cada linha tem de valer o
 * espaço: onde os dados moram, o que vem a seguir e para onde ir. Nada de log
 * de framework.
 */
export function bootMessage(s: BootState): string[] {
  const lines = [`RiftDrive ${s.version}`, `  dados em ${s.dataDir}`];
  if (!s.configured) {
    lines.push('', '  primeira vez: o navegador vai abrir no assistente de configuração do Google');
  }
  if (s.changedPort) {
    lines.push('', `  a porta ${s.requestedPort} estava ocupada, então o app subiu na seguinte`);
  }
  lines.push('', `  ${s.url}${s.openingBrowser ? '  (abrindo o navegador…)' : ''}`);
  return lines;
}
