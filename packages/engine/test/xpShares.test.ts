import { describe, expect, it } from 'vitest';
import {
  balancedShares,
  createCharacter,
  defaultRules,
  previewXpAward,
  previewXpShares,
  typicalSessionAward,
  xpRoom,
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
  it('applies the grade-gap factor: one grade below gives a third, two or more none', () => {
    const f: Character = { ...make('f'), grade: 'F' };
    const e: Character = { ...make('e'), grade: 'E' };
    const rows = previewXpShares(rules, { f, e }, 'class', {
      amount: 600,
      shares: [
        { characterId: 'f', share: 300 },
        { characterId: 'e', share: 300 },
      ],
      enemyGrade: 'G',
    });
    expect(rows.map((r) => r.gained)).toEqual([100, 0]);
  });
  it('profession XP is refused without a profession, as the reducer refuses it; with one it levels', () => {
    expect(() =>
      previewXpShares(rules, { p: make('p') }, 'profession', {
        amount: 100,
        shares: [{ characterId: 'p', share: 100 }],
      }),
    ).toThrow('p has no profession');
    const crafter: Character = { ...make('q'), profession: 'Alchemist', professionLevel: 0 };
    const [up] = previewXpShares(rules, { q: crafter }, 'profession', {
      amount: 100,
      shares: [{ characterId: 'q', share: 100 }],
    });
    expect(up!.lost).toBe(0);
    expect(up!.levelUps.some((l) => l.track === 'profession' && l.level === 1)).toBe(true);
  });
});

describe('typical-session suggestion (M4.6)', () => {
  it('xpRoom is the XP left to the grade top on class plus profession', () => {
    // G top is level 4 at 100 XP per level.
    expect(xpRoom(rules, make('a'))).toBe(400);
    expect(xpRoom(rules, { ...make('a'), classLevel: 3, xp: { class: 40, profession: 0 } })).toBe(
      60,
    );
    expect(xpRoom(rules, { ...make('a'), classLevel: 4 })).toBe(0);
    const e: Character = {
      ...make('e'),
      grade: 'E',
      classLevel: 49,
      professionLevel: 47,
      profession: 'Alchemist',
    };
    expect(xpRoom(rules, e)).toBe(2 * 900);
    expect(xpRoom({ ...rules, xp: { ...rules.xp, overflow: false } }, make('a'))).toBe(Infinity);
  });
  it('suggests the typical session per head, capped by the least room, and loses nothing', () => {
    const fresh = [make('a'), make('b'), make('c')];
    // G typical is 6 × 100 = 600 each, but a fresh G character has 400 of room.
    const amount = typicalSessionAward(rules, 'G', fresh);
    expect(amount).toBe(1200);
    const rows = previewXpAward(rules, { a: fresh[0]!, b: fresh[1]!, c: fresh[2]! }, 'class', {
      amount,
      participants: fresh.map((c) => ({ characterId: c.id })),
    });
    expect(rows.every((r) => r.lost === 0)).toBe(true);
    const f: Character = { ...make('f'), grade: 'F', classLevel: 5 };
    expect(typicalSessionAward(rules, 'F', [f])).toBe(6 * 300);
  });
  it('ignores capped characters for the cap and is 0 when nobody has room', () => {
    const capped: Character = { ...make('x'), classLevel: 4 };
    expect(typicalSessionAward(rules, 'G', [capped, make('a')])).toBe(800);
    expect(typicalSessionAward(rules, 'G', [capped])).toBe(0);
    expect(typicalSessionAward(rules, 'G', [])).toBe(0);
  });
});
