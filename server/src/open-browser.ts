import { spawn } from 'node:child_process';

export interface OpenCommand {
  command: string;
  args: string[];
}

/**
 * Como pedir ao sistema que abra uma URL no navegador padrão.
 *
 * Feito à mão em vez de usar o pacote `open` porque ele carrega um script
 * auxiliar pelo caminho da própria pasta — e esse caminho deixa de existir
 * quando o app vira um arquivo só. São três comandos; a dependência não pagava
 * o preço de impedir o empacotamento.
 */
export function openCommand(platform: NodeJS.Platform, url: string): OpenCommand | null {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  // `start` é comando interno do cmd.exe, não um executável. E o "" é o título
  // da janela: sem ele o cmd trata a URL como título e não abre nada.
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'linux') return { command: 'xdg-open', args: [url] };
  return null;
}

/**
 * Abre a URL, em silêncio se não der.
 *
 * Falhar aqui não é motivo para nada: o endereço já está impresso no terminal, e
 * derrubar o app porque o navegador não abriu seria absurdo.
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const c = openCommand(platform, url);
  if (!c) return;
  try {
    const p = spawn(c.command, c.args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    // sem navegador, sem problema
  }
}
