import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../src';

// ME.1 (DESIGN §4, L26/L27): every track grants stats. First failing test,
// committed at the hand-off; the field names are a proposal the next run may
// change (log the choice in DECISIONS.md).

const TABLE: Record<string, [number, number, number]> = {
  G: [8, 5, 5],
  F: [11, 7, 6],
  E: [16, 10, 10],
  D: [24, 15, 15],
  C: [36, 23, 22],
  B: [54, 33, 33],
  A: [80, 50, 50],
};

describe('per-grade track budgets (ME.1)', () => {
  it('match DESIGN §4 for class, profession and race', () => {
    for (const grade of DEFAULT_RULES.grades) {
      const want = TABLE[grade.id];
      expect(want, grade.id).toBeDefined();
      const budget = (grade as unknown as { trackBudget?: Record<string, number> }).trackBudget;
      expect(budget, grade.id).toEqual({ class: want![0], profession: want![1], race: want![2] });
    }
  });

  it('offers professions from the start', () => {
    expect(DEFAULT_RULES.tracks.professionUnlockGrade).toBe('G');
  });
});
