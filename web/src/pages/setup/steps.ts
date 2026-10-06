// Os quatro passos no Google Cloud, com o link direto de cada um. O quinto
// (colar o ID e o segredo) acontece no próprio app.
export const CLOUD_STEPS = [
  { key: 'project', url: 'https://console.cloud.google.com/projectcreate' },
  { key: 'api', url: 'https://console.cloud.google.com/apis/library/drive.googleapis.com' },
  { key: 'consent', url: 'https://console.cloud.google.com/auth/audience' },
  { key: 'credential', url: 'https://console.cloud.google.com/apis/credentials/oauthclient' },
] as const;

export type StepKey = (typeof CLOUD_STEPS)[number]['key'];

const STORAGE_KEY = 'riftdrive.setup.steps';

export function loadDoneSteps(): Set<StepKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as StepKey[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDoneSteps(done: Set<StepKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    /* sem localStorage, sem memória — segue funcionando */
  }
}
