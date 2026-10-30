import { describe, expect, it } from 'vitest';
import {
  referenceMeta,
  referenceUrl,
  safeSource,
  type ReferenceRow,
} from '../src/gm/referenceModel';

// MU.6: the GM's Reference view.
describe('reference view model (MU.6)', () => {
  it('builds the GM route query', () => {
    expect(referenceUrl({ q: '', list: '', godTied: true })).toBe('/api/gm/reference');
    expect(referenceUrl({ q: '  iron boar ', list: 'creatures', godTied: false })).toBe(
      '/api/gm/reference?q=iron+boar&list=creatures&godTied=0',
    );
    expect(referenceUrl({ q: 'x'.repeat(300), list: '', godTied: true }).length).toBeLessThan(230);
  });

  it('labels a row and links only web sources', () => {
    const row = { kind: 'armor', rarity: 'Rare', grade: '' } as ReferenceRow;
    expect(referenceMeta(row)).toBe('armor · Rare');
    expect(safeSource('https://system-codex.com/x')).toBe('https://system-codex.com/x');
    expect(safeSource('javascript:alert(1)')).toBeNull();
    expect(safeSource('')).toBeNull();
  });
});
