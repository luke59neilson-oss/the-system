import { describe, expect, it } from 'vitest';
import type { PartyMember } from '@the-system/engine';
import {
  clampPercent,
  LOW_POOL_PERCENT,
  partyRows,
  poolLabel,
  shortPoolName,
} from '../src/player/party';

const rules = {
  pools: [
    { id: 'hp', name: 'Health Points (HP)' },
    { id: 'mp', name: 'Mana Points (MP)' },
    { id: 'stamina', name: 'Stamina' },
  ],
  grades: [
    { id: 'G', topLevel: 4, rarityCeiling: 'common', xpPerLevel: 100, theme: 'aluminum' },
    { id: 'E', topLevel: 49, rarityCeiling: 'rare', xpPerLevel: 300, theme: 'copper' },
  ],
};

const member = (over: Partial<PartyMember> = {}): PartyMember => ({
  id: 'm',
  name: 'Miranda',
  race: 'Human',
  className: 'Storm Ranger',
  profession: 'Cook',
  classLevel: 22,
  professionLevel: 18,
  raceLevel: 20,
  grade: 'E',
  pools: [
    { id: 'stamina', percent: 40 },
    { id: 'hp', percent: 100 },
    { id: 'mp', percent: 0 },
  ],
  ...over,
});

describe('party view helpers (M3.12)', () => {
  it('labels full, empty and partial bars', () => {
    expect(poolLabel(100)).toBe('Full');
    expect(poolLabel(0)).toBe('Empty');
    expect(poolLabel(62)).toBe('62%');
    expect(poolLabel(1)).toBe('1%');
    expect(poolLabel(99)).toBe('99%');
  });

  it('shortens pool names to their bracketed abbreviation', () => {
    expect(shortPoolName('Health Points (HP)')).toBe('HP');
    expect(shortPoolName('Mana Points (MP)')).toBe('MP');
    expect(shortPoolName('Stamina')).toBe('Stamina');
    expect(shortPoolName('Odd ()')).toBe('Odd ()');
    expect(shortPoolName('Spaced ( SP )')).toBe('SP');
  });

  it('clamps and rounds out-of-range percents', () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(41.6)).toBe(42);
  });

  it('orders pools by the rules config and keeps the grade theme', () => {
    const [row] = partyRows([member()], rules);
    expect(row?.theme).toBe('copper');
    expect(row?.pools.map((p) => [p.name, p.label])).toEqual([
      ['Health Points (HP)', 'Full'],
      ['Mana Points (MP)', 'Empty'],
      ['Stamina', '40%'],
    ]);
  });

  it('flags low bars but not empty or healthy ones', () => {
    const [row] = partyRows(
      [
        member({
          pools: [
            { id: 'hp', percent: LOW_POOL_PERCENT },
            { id: 'mp', percent: 0 },
            { id: 'stamina', percent: LOW_POOL_PERCENT + 1 },
          ],
        }),
      ],
      rules,
    );
    expect(row?.pools.map((p) => p.low)).toEqual([true, false, false]);
  });

  it('skips pools the member lacks and handles an unknown grade', () => {
    const [row] = partyRows(
      [member({ grade: 'Z', profession: null, pools: [{ id: 'hp', percent: 50 }] })],
      rules,
    );
    expect(row?.theme).toBeNull();
    expect(row?.profession).toBeNull();
    expect(row?.pools.map((p) => p.id)).toEqual(['hp']);
  });

  it('keeps the projection order and copies no extra fields', () => {
    const rows = partyRows([member({ id: 'a', name: 'A' }), member({ id: 'b', name: 'B' })], rules);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      [
        'classLevel',
        'className',
        'grade',
        'id',
        'name',
        'pools',
        'profession',
        'professionLevel',
        'race',
        'raceLevel',
        'theme',
      ].sort(),
    );
  });
});
