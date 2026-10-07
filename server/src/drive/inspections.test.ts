import { describe, expect, it } from 'vitest';
import { InspectionCache, InspectProgress } from './inspections';
import type { InspectResult } from './inspect';

const result = (over: Partial<InspectResult> = {}): InspectResult => ({
  folderId: 'f',
  name: 'Curso',
  owner: null,
  path: 'rift',
  readerAccountId: 'a',
  readerEmail: 'a@x.com',
  destAccountId: 'a',
  destEmail: 'a@x.com',
  totals: { files: 1, bytes: 1 },
  blocked: { count: 0, bytes: 0, sample: [] },
  native: { count: 0 },
  copyableBytes: 1,
  destConflict: null,
  quota: { fits: true } as unknown as InspectResult['quota'],
  shareRequestText: null,
  ...over,
});
const tree = { files: [], folders: [], totalBytes: 0 };

describe('InspectionCache.update', () => {
  it('troca o resultado mantendo o id e a árvore; id desconhecido devolve false', () => {
    const c = new InspectionCache();
    const id = c.put(result(), tree);
    expect(c.update(id, result({ destConflict: { existingFolderId: 'x' } }))).toBe(true);
    expect(c.get(id)).toMatchObject({ result: { destConflict: { existingFolderId: 'x' } }, tree });
    expect(c.update('nope', result())).toBe(false);
  });
});

describe('InspectProgress', () => {
  it('registra, consulta, limpa e esquece tokens velhos', () => {
    let now = 1_000;
    const p = new InspectProgress(60_000, () => now);
    expect(p.get('t')).toBeNull();
    p.set('t', 12);
    p.set('t', 40);
    expect(p.get('t')).toBe(40);
    p.clear('t');
    expect(p.get('t')).toBeNull();
    p.set('u', 5);
    now += 60_001;
    expect(p.get('u')).toBeNull();
  });
});
