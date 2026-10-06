import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { defaultDataDir, loadConfig } from './config';

describe('config', () => {
  it('pasta de dados por SO', () => {
    expect(defaultDataDir({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'win32')).toBe(
      path.join('C:\\Users\\x\\AppData\\Roaming', 'RiftDrive'),
    );
    expect(defaultDataDir({}, 'darwin')).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'RiftDrive'));
    expect(defaultDataDir({ XDG_DATA_HOME: '/tmp/xdg' }, 'linux')).toBe(path.join('/tmp/xdg', 'riftdrive'));
    expect(defaultDataDir({}, 'linux')).toBe(path.join(os.homedir(), '.local', 'share', 'riftdrive'));
  });

  it('RIFTDRIVE_DATA_DIR e porta', () => {
    const c = loadConfig({ RIFTDRIVE_DATA_DIR: '/tmp/rd', PORT: '8123' });
    expect(c.dataDir).toBe(path.resolve('/tmp/rd'));
    expect(c.dbPath).toBe(path.join(path.resolve('/tmp/rd'), 'riftdrive.db'));
    expect(c.port).toBe(8123);
    expect(c.bind).toBe('127.0.0.1');
    expect(c.openBrowser).toBe(true);
  });

  it('padrões: porta 7799 e navegador aberto', () => {
    const c = loadConfig({});
    expect(c.port).toBe(7799);
    expect(c.openBrowser).toBe(true);
  });

  it('OPEN_BROWSER=0 desliga', () => {
    expect(loadConfig({ OPEN_BROWSER: '0' }).openBrowser).toBe(false);
  });
});
