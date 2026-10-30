import { describe, expect, it } from 'vitest';
import { createCharacter, defaultRules, levelsWorth, xpContext, type Character } from '../src';
import { kit } from './helpers/events';

// MU.3 (DESIGN §5 "XP award box"): each participant's grade, levels, XP now
// and per level, XP to the next level, and what an award is worth in levels.

const rules = defaultRules();
const fresh = (): Character =>
  createCharacter(rules, { id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit });

describe('xpContext', () => {
  it('a fresh G-grade character: 0 of 100, 100 to the next level', () => {
    expect(xpContext(rules, fresh())).toEqual({
      grade: 'G',
      classLevel: 0,
      professionLevel: null,
      raceLevel: 0,
      perLevel: 100,
      xp: { class: 0, profession: null },
      toNext: { class: 100, profession: null },
    });
  });

  it('a capped track has nothing to the next level (null)', () => {
    const c: Character = { ...fresh(), classLevel: 4, xp: { class: 0, profession: 0 } };
    expect(xpContext(rules, c).toNext.class).toBeNull();
  });
});

describe('levelsWorth', () => {
  it('counts whole and part levels on the awarded track', () => {
    expect(levelsWorth(rules, fresh(), 'class', 250)).toBeCloseTo(2.5);
  });

  it('stops at the grade cap when XP is lost (no profession)', () => {
    expect(levelsWorth(rules, fresh(), 'class', 10_000)).toBe(4);
  });

  it('starts from the XP already earned', () => {
    const c: Character = { ...fresh(), xp: { class: 50, profession: 0 } };
    expect(levelsWorth(rules, c, 'class', 100)).toBeCloseTo(1);
  });
});
