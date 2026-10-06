import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { SettingsRepo } from '../settings/repo';
import { QuotaService, dayKey, nextResetAt } from './quota';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();

describe('dia da cota', () => {
  it('antes da hora de renovação ainda é o dia anterior', () => {
    expect(dayKey(at(2026, 1, 10, 3), 4)).toBe('2026-01-09');
    expect(dayKey(at(2026, 1, 10, 5), 4)).toBe('2026-01-10');
    expect(dayKey(at(2026, 1, 10, 0), 0)).toBe('2026-01-10');
  });

  it('próxima renovação', () => {
    expect(nextResetAt(at(2026, 1, 10, 3), 4)).toBe(at(2026, 1, 10, 4));
    expect(nextResetAt(at(2026, 1, 10, 5), 4)).toBe(at(2026, 1, 11, 4));
  });
});

describe('QuotaService', () => {
  const mk = (now: number) => {
    const db = openDb(':memory:');
    const s = new SettingsRepo(db);
    return { db, s, q: new QuotaService(db, s, () => now) };
  };

  it('modo limite: soma, bloqueia e vira o dia', () => {
    const { db, s, q } = mk(at(2026, 1, 10, 5));
    s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 });
    expect(q.canSpend('a', 60)).toBe(true);
    q.record('a', 60);
    expect(q.canSpend('a', 50)).toBe(false);
    expect(q.canSpend('a', 40)).toBe(true);
    expect(q.evaluate('a', 50)).toMatchObject({ fits: false, mode: 'limit', usedBytes: 60, limitBytes: 100, remainingBytes: 40 });
    expect(q.evaluate('a', 50).resetAt).toBe(new Date(at(2026, 1, 11, 4)).toISOString());
    const later = new QuotaService(db, s, () => at(2026, 1, 11, 5));
    expect(later.used('a')).toBe(0);
  });

  it('arquivo maior que o limite inteiro passa quando o dia está zerado (senão nunca copiaria)', () => {
    const { s, q } = mk(at(2026, 1, 10, 5));
    s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 });
    expect(q.canSpend('a', 500)).toBe(true);
    q.record('a', 500);
    expect(q.canSpend('a', 1)).toBe(false);
  });

  it('sem limite sempre pode; evaluate informa', () => {
    const { s, q } = mk(at(2026, 1, 10, 5));
    s.setQuota({ mode: 'unlimited' });
    q.record('a', 10 ** 15);
    expect(q.canSpend('a', 1)).toBe(true);
    expect(q.evaluate('a', 1)).toMatchObject({ fits: true, mode: 'unlimited', limitBytes: null, remainingBytes: null, usedBytes: 10 ** 15 });
  });

  it('contas não se misturam', () => {
    const { s, q } = mk(at(2026, 1, 10, 5));
    s.setQuota({ mode: 'limit', limitBytes: 100, resetHour: 4 });
    q.record('a', 100);
    expect(q.canSpend('b', 100)).toBe(true);
  });
});
