import { describe, expect, it } from 'vitest';
import {
  appDie,
  contestChance,
  d20Modifiers,
  d20MeetsTarget,
  d20WinChance,
  damageFactor,
  defaultRules,
  rollD20Contest,
  rollModifier,
  rollsModeOf,
  settleD20Contest,
  type DieRoll,
} from '../src';

// MK.1, DESIGN §7 "Dice": d20 + modifier.

const rules = defaultRules();
const side = (value: number, grade = 'G') => ({ value, grade });
const typed = (die: number): DieRoll => ({ die, how: 'typed' });

describe('roll modifier (MK.1)', () => {
  it.each([
    [1, -10],
    [5, -3],
    [10, 0],
    [20, 3],
    [30, 5],
    [80, 9],
    [2900, 25],
  ])('stat %d gives %d', (stat, mod) => {
    expect(rollModifier(rules, stat)).toBe(mod);
  });

  it('counts a stat below 1 as 1', () => {
    expect(rollModifier(rules, 0)).toBe(-10);
    expect(rollModifier(rules, 0.4)).toBe(-10);
  });

  it('takes its numbers from the rules config', () => {
    const r = defaultRules();
    const custom = {
      ...r,
      resolution: {
        ...r.resolution,
        d20: { modifierPerDoubling: 4, baseStat: 20, minStat: 5, gradeGapPenalty: 7 },
      },
    };
    expect(rollModifier(custom, 40)).toBe(4);
    expect(rollModifier(custom, 1)).toBe(-8); // counted as 5: 4 × log2(¼)
  });

  it('a campaign with no rolls setting rolls app odds', () => {
    const resolution: Record<string, unknown> = { ...rules.resolution };
    delete resolution['rolls'];
    expect(rollsModeOf({ ...rules, resolution } as typeof rules)).toBe('odds');
    expect(rollsModeOf(rules)).toBe('odds');
    expect(rollsModeOf({ ...rules, resolution: { ...rules.resolution, rolls: 'd20' } })).toBe(
      'd20',
    );
  });
});

describe('d20 odds stay near the ratio odds (MK.1)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('ratio %d:1 is within 5 points', (ratio) => {
    for (const base of [10, 30, 100]) {
      const mods = d20Modifiers(rules, side(base * ratio), side(base), 'gradeWalls');
      expect(mods).not.toBeNull();
      const d20 = d20WinChance(mods!.modA, mods!.modB, 'a');
      const odds = contestChance(rules, side(base * ratio), side(base), 'gradeWalls');
      expect(Math.abs(d20 - odds)).toBeLessThanOrEqual(0.05);
    }
  });

  it('meets beats: an even match gives the attacker 52.5% (ML.3, DESIGN §7)', () => {
    expect(d20WinChance(4, 4, 'a')).toBe(0.525);
    expect(d20WinChance(4, 4, 'b')).toBe(0.475);
    // A attacking at +9 against B defending, and B attacking the other way round, add to 1.
    expect(d20WinChance(9, 0, 'a') + d20WinChance(0, 9, 'b')).toBeCloseTo(1, 12);
    expect(d20WinChance(25, 0, 'a')).toBe(1);
    expect(d20WinChance(0, 19, 'a')).toBe(1 / 400);
    // DESIGN §7: twice the stat (+3) ≈ 66% against app odds' 67%; three times (+5) ≈ 74% vs 75%.
    expect(d20WinChance(3, 0, 'a')).toBe(0.66);
    expect(d20WinChance(5, 0, 'a')).toBe(0.7375);
  });

  it('contests shared before ML.3 rolled ties again: their odds keep that rule', () => {
    expect(d20WinChance(4, 4)).toBe(0.5);
    expect(d20WinChance(9, 0) + d20WinChance(0, 9)).toBeCloseTo(1, 12);
  });

  it('against a set target, meeting it succeeds', () => {
    expect(d20MeetsTarget(15, 15)).toBe(true);
    expect(d20MeetsTarget(16, 15)).toBe(true);
    expect(d20MeetsTarget(14, 15)).toBe(false);
  });
});

describe('d20 contests (MK.1)', () => {
  it('records each die, how it was rolled, the modifiers and the totals', () => {
    const r = settleD20Contest(rules, side(20), side(10), 'gradeWalls', [
      { a: typed(8), b: { die: 12, how: 'app' } },
    ]);
    expect(r.d20).toEqual({
      modA: 3,
      modB: 0,
      rounds: [{ a: { die: 8, how: 'typed', total: 11 }, b: { die: 12, how: 'app', total: 12 } }],
      attacker: 'a',
    });
    expect(r).toMatchObject({ success: false, walled: false, roll: null, yours: 20, theirs: 10 });
    expect(r.chance).toBe(d20WinChance(3, 0, 'a'));
  });

  it('a tie goes to the attacker, on either side, with no re-roll (ML.3)', () => {
    let drawn = 0;
    const tie = (attacker: 'a' | 'b') =>
      rollD20Contest(
        rules,
        side(20),
        side(10),
        (s) => {
          drawn++;
          return typed(s === 'a' ? 10 : 13);
        },
        'gradeWalls',
        attacker,
      );
    const a = tie('a');
    expect(a.d20?.rounds).toEqual([
      { a: { die: 10, how: 'typed', total: 13 }, b: { die: 13, how: 'typed', total: 13 } },
    ]);
    expect(a.success).toBe(true);
    expect(tie('b').success).toBe(false);
    expect(drawn).toBe(4);
    expect(tie('b').d20?.attacker).toBe('b');
  });

  it('refuses a second round, an unknown attacker and bad dice', () => {
    const go = (dice: { a: DieRoll; b: DieRoll }[]) => () =>
      settleD20Contest(rules, side(10), side(10), 'gradeWalls', dice);
    expect(go([{ a: typed(5), b: typed(5) }])()).toMatchObject({ success: true });
    expect(
      go([
        { a: typed(5), b: typed(5) },
        { a: typed(7), b: typed(5) },
      ]),
    ).toThrow(/no re-roll/);
    expect(() =>
      settleD20Contest(
        rules,
        side(10),
        side(10),
        'gradeWalls',
        [{ a: typed(5), b: typed(5) }],
        'c' as 'a',
      ),
    ).toThrow(/side A or side B/);
    expect(go([{ a: typed(0), b: typed(5) }])).toThrow(/1–20/);
    expect(go([{ a: typed(21), b: typed(5) }])).toThrow(/1–20/);
    expect(go([{ a: typed(2.5), b: typed(5) }])).toThrow(/1–20/);
    expect(go([])).toThrow(/needs each side/);
  });

  it('one grade apart: −5 to the lower side, and its hits deal ⅓ damage', () => {
    const lowFirst = d20Modifiers(rules, side(80, 'E'), side(80, 'D'), 'gradeWalls');
    expect(lowFirst).toMatchObject({ modA: 9 - 5, modB: 9 });
    const highFirst = d20Modifiers(rules, side(80, 'D'), side(80, 'E'), 'gradeWalls');
    expect(highFirst).toMatchObject({ modA: 9, modB: 9 - 5 });
    expect(damageFactor(rules, 'E', 'D', 'gradeWalls')).toBeCloseTo(1 / 3, 12);
  });

  it('two or more grades apart: no roll, no dice drawn, the higher grade wins', () => {
    let drawn = 0;
    const r = rollD20Contest(
      rules,
      side(5000, 'F'),
      side(10, 'D'),
      () => {
        drawn++;
        return typed(20);
      },
      'gradeWalls',
    );
    expect(drawn).toBe(0);
    expect(r).toMatchObject({ walled: true, success: false, d20: null, roll: null, chance: 0 });
    expect(() =>
      settleD20Contest(rules, side(10, 'F'), side(10, 'D'), 'gradeWalls', [
        { a: typed(1), b: typed(2) },
      ]),
    ).toThrow(/grade wall/);
  });

  it('app dice cover 1–20 from the RNG', () => {
    expect(appDie(() => 0)).toEqual({ die: 1, how: 'app' });
    expect(appDie(() => 0.999999)).toEqual({ die: 20, how: 'app' });
    expect(() => appDie(() => 1)).toThrow();
  });
});
