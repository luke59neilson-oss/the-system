// MC.2 review M7: the co-DM panel says "ready" only for content that can apply.
import { describe, expect, it } from 'vitest';
import { readiness } from '../src/gm/CoDmPanel';
import { takesIncoming } from '../src/gm/ContentImport';

describe('co-DM readiness message', () => {
  it('is ready only when every entry can apply', () => {
    expect(readiness('Shop', { ok: true, errors: [], entries: [{ error: null }] })).toBe(
      'Shop ready: check it in Import content',
    );
  });
  it('a refused file says it broke the rules', () => {
    expect(readiness('Item', { ok: false, errors: [{}] })).toContain('broke the rules');
    expect(readiness('Item', undefined)).toContain('broke the rules');
  });
  it('counts entries that cannot apply', () => {
    expect(
      readiness('Item', { ok: true, errors: [], entries: [{ error: 'x' }, { error: null }] }),
    ).toBe('Item ready, but 1 entry cannot apply: check Import content');
    expect(
      readiness('Item', { ok: true, errors: [{}], entries: [{ error: 'x' }, { error: null }] }),
    ).toContain('2 entries cannot apply');
  });
  it('an empty file says so', () => {
    expect(readiness('Place', { ok: true, errors: [], entries: [] })).toContain('came back empty');
  });
});

describe('Import content takes a co-DM hand-over', () => {
  const gen = { text: '{}', name: 'co-DM shop', seq: 2, generated: true };
  it('waits while the window is loading or applying', () => {
    expect(takesIncoming(true, gen, 1)).toBe(false);
    expect(takesIncoming(false, gen, 1)).toBe(true);
  });
  it('takes each hand-over once', () => {
    expect(takesIncoming(false, gen, 2)).toBe(false);
    expect(takesIncoming(false, null, null)).toBe(false);
    expect(takesIncoming(false, gen, null)).toBe(true);
  });
});
