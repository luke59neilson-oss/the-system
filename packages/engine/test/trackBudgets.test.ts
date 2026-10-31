import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, parseRulesConfig } from '../src';

// ME.1 (DESIGN §4, L26/L27): every track grants stats. Rules config shape
// (D300): an optional `trackBudget` per grade; rules stored before ME have none
// and keep their old numbers.

const TABLE: Record<string, [number, number, number]> = {
  G: [8, 5, 5],
  F: [11, 7, 6],
  E: [16, 10, 10],
  D: [24, 15, 15],
  C: [36, 23, 22],
  B: [54, 33, 33],
  A: [80, 50, 50],
};

function raw(): Record<string, any> {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

describe('per-grade track budgets (ME.1)', () => {
  it('match DESIGN §4 for class, profession and race', () => {
    for (const grade of DEFAULT_RULES.grades) {
      const want = TABLE[grade.id];
      expect(want, grade.id).toBeDefined();
      expect(grade.trackBudget, grade.id).toEqual({
        class: want![0],
        profession: want![1],
        race: want![2],
      });
    }
  });

  it('rules stored before ME (no track budgets) still parse, without budgets', () => {
    const r = raw();
    for (const g of r.grades) delete g.trackBudget;
    const result = parseRulesConfig(r);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.config.grades.every((g) => g.trackBudget === undefined)).toBe(true);
  });

  it('allows professions from the first grade once every grade has a budget', () => {
    const r = raw();
    r.tracks.professionUnlockGrade = 'G';
    expect(parseRulesConfig(r).ok).toBe(true);
  });

  // Hand-off: turns green when progression grants profession points and the
  // default moves to G (the 15 tests that assume E-grade professions move with it).
  it('offers professions from the start', () => {
    expect(DEFAULT_RULES.tracks.professionUnlockGrade).toBe('G');
  });
});
