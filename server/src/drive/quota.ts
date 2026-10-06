import type { Db } from '../db';
import type { QuotaSettings, SettingsRepo } from '../settings/repo';

const pad = (n: number) => String(n).padStart(2, '0');

// O "dia" da cota vira na hora de renovação, não à meia-noite: às 03:00 com
// renovação às 04:00, ainda é o dia anterior. Hora local, como o usuário pensa.
export function dayKey(nowMs: number, resetHour: number): string {
  const d = new Date(nowMs - resetHour * 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nextResetAt(nowMs: number, resetHour: number): number {
  const d = new Date(nowMs);
  d.setHours(resetHour, 0, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export interface QuotaEvaluation {
  fits: boolean;
  mode: 'limit' | 'unlimited';
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
  resetAt: string;
}

/**
 * Contabilidade da cota diária por conta de destino.
 *
 * Modo limite: o app para antes do teto configurado e retoma na renovação.
 * Modo sem limite: nunca bloqueia aqui — quem corta é o Google, e o motor
 * trata o erro quando ele vier.
 */
export class QuotaService {
  constructor(
    readonly db: Db,
    private settingsRepo: SettingsRepo,
    private now: () => number = Date.now,
  ) {}

  settings(): QuotaSettings {
    return this.settingsRepo.quota();
  }

  used(accountId: string): number {
    const r = this.db
      .prepare('SELECT bytes FROM quota_usage WHERE account_id = ? AND day_key = ?')
      .get(accountId, dayKey(this.now(), this.settings().resetHour)) as { bytes: number } | undefined;
    return r?.bytes ?? 0;
  }

  canSpend(accountId: string, bytes: number): boolean {
    const s = this.settings();
    if (s.mode === 'unlimited') return true;
    const used = this.used(accountId);
    // Um arquivo maior que o limite inteiro nunca caberia; com o dia zerado,
    // deixa passar — senão ele ficaria preso para sempre.
    if (used === 0 && bytes > s.limitBytes) return true;
    return used + bytes <= s.limitBytes;
  }

  // Negativo devolve uma reserva não usada (o laço reserva antes de copiar).
  record(accountId: string, bytes: number): void {
    const key = dayKey(this.now(), this.settings().resetHour);
    this.db
      .prepare('INSERT INTO quota_usage(account_id, day_key, bytes) VALUES(?, ?, ?) ON CONFLICT(account_id, day_key) DO UPDATE SET bytes = bytes + excluded.bytes')
      .run(accountId, key, bytes);
    this.db.prepare('UPDATE quota_usage SET bytes = 0 WHERE account_id = ? AND day_key = ? AND bytes < 0').run(accountId, key);
  }

  evaluate(accountId: string, bytes: number): QuotaEvaluation {
    const s = this.settings();
    const usedBytes = this.used(accountId);
    const unlimited = s.mode === 'unlimited';
    return {
      fits: this.canSpend(accountId, bytes),
      mode: s.mode,
      usedBytes,
      limitBytes: unlimited ? null : s.limitBytes,
      remainingBytes: unlimited ? null : Math.max(0, s.limitBytes - usedBytes),
      resetAt: new Date(nextResetAt(this.now(), s.resetHour)).toISOString(),
    };
  }
}
