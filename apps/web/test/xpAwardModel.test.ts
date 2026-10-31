import { describe, expect, it } from 'vitest';
import type { XpContext } from '@the-system/engine';
import { evenPercents, formatLevels, percentShares, xpContextText } from '../src/gm/xpAwardModel';

const base: XpContext = {
  grade: 'G',
  classLevel: 3,
  professionLevel: null,
  raceLevel: 1,
  perLevel: 100,
  xp: { class: 90, profession: null },
  toNext: { class: 10, profession: null },
};

describe('award box context (MU.3)', () => {
  it('class only', () => {
    expect(xpContextText(base)).toBe('G-grade · Class 3 · 90/100 XP, 10 to next');
  });
  it('with a profession, at a higher grade with thousands', () => {
    expect(
      xpContextText({
        ...base,
        grade: 'D',
        professionLevel: 2,
        perLevel: 2700,
        xp: { class: 1200, profession: 40 },
        toNext: { class: 1500, profession: 2660 },
      }),
    ).toBe(
      'D-grade · Class 3 · 1,200/2,700 XP, 1,500 to next · Profession 2 · 40/2,700, 2,660 to next',
    );
  });
  it('a capped track shows no fraction', () => {
    expect(
      xpContextText({
        ...base,
        classLevel: 9,
        professionLevel: 4,
        xp: { class: 0, profession: 30 },
        toNext: { class: null, profession: 70 },
      }),
    ).toBe('G-grade · Class 9 · at the grade’s top · Profession 4 · 30/100, 70 to next');
  });
});

describe('formatLevels (MU.3)', () => {
  it.each([
    [1.5, '1.5 levels'],
    [1, '1 level'],
    [0.96, '1 level'],
    [0, '0 levels'],
    [0.04, 'under 0.1 levels'],
    [6.04, '6 levels'],
  ])('%s → %s', (v, text) => expect(formatLevels(v)).toBe(text));
});

describe('XP shares by percent (MV.2)', () => {
  it('starts even, whole and summing to 100, for 1–8 participants', () => {
    expect(evenPercents(3)).toEqual([34, 33, 33]);
    expect(evenPercents(4)).toEqual([25, 25, 25, 25]);
    expect(evenPercents(0)).toEqual([]);
    for (let n = 1; n <= 8; n += 1) {
      const p = evenPercents(n);
      expect(p).toHaveLength(n);
      expect(p.reduce((a, b) => a + b, 0)).toBe(100);
      expect(Math.max(...p) - Math.min(...p)).toBeLessThanOrEqual(1);
    }
  });

  it('rounds so shares sum to the total exactly', () => {
    expect(percentShares(1000, [33, 33, 34])).toEqual([330, 330, 340]);
    expect(percentShares(1000, [40, 20, 20, 20])).toEqual([400, 200, 200, 200]);
    expect(percentShares(10, [34, 33, 33])).toEqual([4, 3, 3]);
    expect(percentShares(7, [50, 50])).toEqual([4, 3]);
    for (const amount of [1, 7, 99, 101, 1000, 12345]) {
      for (let n = 1; n <= 8; n += 1) {
        const s = percentShares(amount, evenPercents(n)) ?? [];
        expect(s.reduce((a, b) => a + b, 0)).toBe(amount);
      }
    }
  });

  it('blocks totals of 99 and 101, fractions and out-of-range values', () => {
    expect(percentShares(1000, [33, 33, 33])).toBeNull();
    expect(percentShares(1000, [34, 34, 33])).toBeNull();
    expect(percentShares(1000, [50.5, 49.5])).toBeNull();
    expect(percentShares(1000, [-10, 110])).toBeNull();
    expect(percentShares(1000, [])).toBeNull();
  });
});
