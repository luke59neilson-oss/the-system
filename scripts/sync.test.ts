import { describe, expect, it } from 'vitest';
import { syncAction } from './sync.mjs';

// D332: `npm run sync` resets local main only when it held no unpushed work.
describe('npm run sync (LOOP §1.2)', () => {
  it('fast-forwards when it can', () => {
    expect(syncAction({ unpushed: 0, ffOk: true })).toBe('ff');
    expect(syncAction({ unpushed: 3, ffOk: true })).toBe('ff');
  });
  it('resets a stale main with no unpushed commits', () => {
    expect(syncAction({ unpushed: 0, ffOk: false })).toBe('reset');
  });
  it('never resets a main holding unpushed commits', () => {
    expect(syncAction({ unpushed: 1, ffOk: false })).toBe('refuse');
  });
});
