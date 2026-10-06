import path from 'node:path';
import os from 'node:os';

export interface AppConfig {
  port: number;
  bind: string;
  dataDir: string;
  dbPath: string;
  openBrowser: boolean;
}

/**
 * Onde ficam o banco (tokens, jobs, cota).
 *
 * Fora da pasta do programa, sempre: o executável é substituído inteiro a cada
 * atualização, e os dados precisam sobreviver a isso. Cada SO tem a sua
 * convenção para "dados de aplicativo", e é ela que backup e perfil do usuário
 * esperam encontrar.
 */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32' && env.APPDATA) return path.join(env.APPDATA, 'RiftDrive');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'RiftDrive');
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, 'riftdrive');
  return path.join(os.homedir(), '.local', 'share', 'riftdrive');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.RIFTDRIVE_DATA_DIR ?? defaultDataDir(env));
  return {
    // 7799, e não 7777: o Learnflix usa a 7777, e os dois convivem na mesma máquina.
    port: Number(env.PORT ?? 7799),
    bind: env.BIND ?? '127.0.0.1',
    dataDir,
    dbPath: path.join(dataDir, 'riftdrive.db'),
    openBrowser: env.OPEN_BROWSER === undefined ? true : env.OPEN_BROWSER === '1' || env.OPEN_BROWSER === 'true',
  };
}
