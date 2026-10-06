import { describe, expect, it } from 'vitest';
import { parseDriveId } from './links';

describe('parseDriveId', () => {
  it.each([
    ['https://drive.google.com/drive/folders/1AbC_dEf-GhI?usp=sharing', '1AbC_dEf-GhI'],
    ['https://drive.google.com/drive/u/0/folders/1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['https://drive.google.com/open?id=1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['https://drive.google.com/file/d/1AbC_dEf-GhI/view', '1AbC_dEf-GhI'],
    ['https://drive.google.com/drive/folders/1AbC_dEf-GhI#x', '1AbC_dEf-GhI'],
    ['https://docs.google.com/document/d/1AbC_dEf-GhI/edit', '1AbC_dEf-GhI'],
    ['1AbC_dEf-GhI', '1AbC_dEf-GhI'],
    ['  1AbC_dEf-GhI  ', '1AbC_dEf-GhI'],
  ])('%s → %s', (input, id) => expect(parseDriveId(input)).toBe(id));

  it('rejeita o que não é link do Drive', () => {
    expect(parseDriveId('')).toBeNull();
    expect(parseDriveId('https://example.com/folders/1AbC_dEf-GhI')).toBeNull();
    expect(parseDriveId('abc')).toBeNull();
    expect(parseDriveId('https://drive.google.com/drive/my-drive')).toBeNull();
  });
});
