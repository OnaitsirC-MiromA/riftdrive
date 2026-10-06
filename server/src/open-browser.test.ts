import { describe, expect, it } from 'vitest';
import { openCommand } from './open-browser';

describe('openCommand', () => {
  const url = 'http://localhost:7799';
  it('macOS usa open', () => expect(openCommand('darwin', url)).toEqual({ command: 'open', args: [url] }));
  it('Windows usa start pelo cmd, com título vazio', () =>
    expect(openCommand('win32', url)).toEqual({ command: 'cmd', args: ['/c', 'start', '', url] }));
  it('Linux usa xdg-open', () => expect(openCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] }));
  it('outro SO: não abre', () => expect(openCommand('freebsd', url)).toBeNull());
});
