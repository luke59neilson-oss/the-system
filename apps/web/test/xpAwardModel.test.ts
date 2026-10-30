import { describe, expect, it } from 'vitest';
import type { XpContext } from '@the-system/engine';
import { formatLevels, xpContextText } from '../src/gm/xpAwardModel';

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
