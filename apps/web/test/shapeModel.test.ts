import { describe, expect, it } from 'vitest';
import { scaleShape } from '../src/gm/shapeModel';

const ORDER = ['strength', 'agility', 'perception'];

describe('Use this shape (ME.4)', () => {
  it('keeps the exact total at every budget', () => {
    const row = { stats: { perception: 2, agility: 1, strength: 1 }, free: 1 };
    for (let budget = 0; budget <= 200; budget++) {
      const s = scaleShape(row, budget, ORDER)!;
      const total = Object.values(s.stats).reduce((a, b) => a + b, 0) + s.free;
      expect(total, `budget ${budget}`).toBe(budget);
    }
    expect(scaleShape(row, 16, ORDER)).toEqual({
      stats: { strength: 3, agility: 3, perception: 7 },
      free: 3,
    });
  });

  it('scales a row of all free points and refuses a zero row', () => {
    expect(scaleShape({ stats: {}, free: 5 }, 10, ORDER)).toEqual({ stats: {}, free: 10 });
    expect(scaleShape({ stats: {}, free: 0 }, 10, ORDER)).toBeNull();
  });
});
