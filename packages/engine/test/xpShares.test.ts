import { describe, expect, it } from 'vitest';
import {
  balancedShares,
  createCharacter,
  defaultRules,
  previewXpAward,
  previewXpShares,
  type Character,
} from '../src';
import { kit } from './helpers/events';

// M4.6: shares set by hand and the auto-balanced last share.

const rules = defaultRules();
const make = (id: string): Character =>
  createCharacter(rules, { id, name: id, className: 'Archer', classSkills: kit });
const characters = { a: make('a'), b: make('b'), c: make('c') };

describe('balancedShares (M4.6)', () => {
  it('splits evenly when nothing is typed, the remainder to the first', () => {
    expect(balancedShares(100, 3, new Map())).toEqual([34, 33, 33]);
  });
  it('keeps typed shares and balances the rest; the last share always balances', () => {
    expect(balancedShares(100, 3, new Map([[0, 50]]))).toEqual([50, 25, 25]);
    expect(
      balancedShares(
        100,
        3,
        new Map([
          [0, 50],
          [1, 10],
        ]),
      ),
    ).toEqual([50, 10, 40]);
    // A typed last share is ignored: it balances.
    expect(balancedShares(100, 2, new Map([[1, 90]]))).toEqual([50, 50]);
    expect(balancedShares(100, 2, new Map([[0, 100]]))).toEqual([100, 0]);
  });
  it('is null when typed shares exceed the amount; empty with no participants', () => {
    expect(
      balancedShares(
        100,
        3,
        new Map([
          [0, 60],
          [1, 50],
        ]),
      ),
    ).toBeNull();
    expect(balancedShares(100, 0, new Map())).toEqual([]);
  });
});

describe('previewXpShares (M4.6)', () => {
  it('matches the even preview when the shares are the even split', () => {
    const even = previewXpAward(rules, characters, 'class', {
      amount: 300,
      participants: [{ characterId: 'a' }, { characterId: 'b' }],
      enemyLevel: 3,
    });
    const manual = previewXpShares(rules, characters, 'class', {
      amount: 300,
      shares: even.map((r) => ({ characterId: r.characterId, share: r.share })),
      enemyLevel: 3,
    });
    expect(manual).toEqual(even);
  });
  it('shows level-ups and what is lost for an uneven split', () => {
    const rows = previewXpShares(rules, characters, 'class', {
      amount: 600,
      shares: [
        { characterId: 'a', share: 500 },
        { characterId: 'b', share: 100 },
      ],
    });
    expect(rows[0]).toMatchObject({ share: 500, gained: 500, lost: 100 });
    expect(rows[0]!.levelUps.filter((l) => l.track === 'class')).toHaveLength(4);
    expect(rows[1]).toMatchObject({ share: 100, lost: 0 });
  });
  it('refuses shares that do not sum, repeats, fractions and unknown characters', () => {
    const p =
      (shares: { characterId: string; share: number }[], amount = 100) =>
      () =>
        previewXpShares(rules, characters, 'class', { amount, shares });
    expect(p([{ characterId: 'a', share: 90 }])).toThrow('Shares sum to 90');
    expect(
      p([
        { characterId: 'a', share: 50 },
        { characterId: 'a', share: 50 },
      ]),
    ).toThrow('listed twice');
    expect(
      p([
        { characterId: 'a', share: 50.5 },
        { characterId: 'b', share: 49.5 },
      ]),
    ).toThrow('whole number');
    expect(p([{ characterId: 'ghost', share: 100 }])).toThrow('Unknown character');
  });
});
