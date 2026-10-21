import { describe, expect, it } from 'vitest';
import {
  MAX_TABLE_PANES,
  isHostBrowser,
  isPaneMode,
  paneUrl,
  resolvePerspective,
  tablePanes,
  togglePane,
} from '../src/gm/perspective';

const party = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() }));

describe('paneUrl / isPaneMode', () => {
  it('loads the ordinary player screen in pane mode, with the id encoded', () => {
    expect(paneUrl('c-1')).toBe('/play/c-1?pane=1');
    expect(paneUrl('a/b?c')).toBe('/play/a%2Fb%3Fc?pane=1');
  });
  it('detects pane mode only from pane=1', () => {
    expect(isPaneMode('?pane=1')).toBe(true);
    expect(isPaneMode('?x=2&pane=1')).toBe(true);
    expect(isPaneMode('')).toBe(false);
    expect(isPaneMode('?pane=0')).toBe(false);
  });
});

describe('resolvePerspective', () => {
  it('keeps GM, table and existing character views', () => {
    expect(resolvePerspective({ kind: 'gm' }, party)).toEqual({ kind: 'gm' });
    expect(resolvePerspective({ kind: 'table' }, party)).toEqual({ kind: 'table' });
    expect(resolvePerspective({ kind: 'character', characterId: 'b' }, party)).toEqual({
      kind: 'character',
      characterId: 'b',
    });
  });
  it('falls back to GM when the viewed character is gone', () => {
    expect(resolvePerspective({ kind: 'character', characterId: 'zz' }, party)).toEqual({
      kind: 'gm',
    });
  });
});

describe('tablePanes', () => {
  it('defaults to the first four in party order', () => {
    expect(MAX_TABLE_PANES).toBe(4);
    expect(tablePanes(party, null).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(tablePanes(party.slice(0, 2), null).map((m) => m.id)).toEqual(['a', 'b']);
    expect(tablePanes([], null)).toEqual([]);
  });
  it('follows the pick in party order, dropping missing ids and capping at four', () => {
    expect(tablePanes(party, ['e', 'a']).map((m) => m.id)).toEqual(['a', 'e']);
    expect(tablePanes(party, ['gone', 'c']).map((m) => m.id)).toEqual(['c']);
    expect(tablePanes(party, ['a', 'b', 'c', 'd', 'e']).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(tablePanes(party, [])).toEqual([]);
  });
});

describe('togglePane', () => {
  it('removes a shown character and adds a hidden one in party order', () => {
    expect(togglePane(party, null, 'b')).toEqual(['a', 'c', 'd']);
    expect(togglePane(party, ['c'], 'a')).toEqual(['a', 'c']);
  });
  it('refuses a fifth pane', () => {
    expect(togglePane(party, null, 'e')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('isHostBrowser', () => {
  it('is true only for loopback host names', () => {
    expect(isHostBrowser('localhost')).toBe(true);
    expect(isHostBrowser('127.0.0.1')).toBe(true);
    expect(isHostBrowser('[::1]')).toBe(true);
    expect(isHostBrowser('192.168.1.5')).toBe(false);
    expect(isHostBrowser('gm-laptop.local')).toBe(false);
  });
});
