import { describe, expect, it } from 'vitest';
import { bootMessage } from './banner';

const base = {
  version: '0.1.0',
  dataDir: '/dados',
  url: 'http://localhost:7799',
  changedPort: false,
  requestedPort: 7799,
  openingBrowser: true,
  configured: true,
};

describe('bootMessage', () => {
  it('diz versão, pasta de dados e endereço', () => {
    const text = bootMessage(base).join('\n');
    expect(text).toContain('RiftDrive 0.1.0');
    expect(text).toContain('dados em /dados');
    expect(text).toContain('http://localhost:7799  (abrindo o navegador…)');
    expect(text).not.toContain('primeira vez');
  });

  it('avisa a primeira vez e a troca de porta', () => {
    const text = bootMessage({ ...base, configured: false, changedPort: true, openingBrowser: false }).join('\n');
    expect(text).toContain('primeira vez');
    expect(text).toContain('a porta 7799 estava ocupada');
    expect(text).not.toContain('abrindo o navegador');
  });
});
