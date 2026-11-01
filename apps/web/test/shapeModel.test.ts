import { describe, expect, it } from 'vitest';
import type { ShapeReferenceRow } from '@the-system/engine';
import {
  fitReference,
  rowLabel,
  rowsForStep,
  scaleShape,
  shapePercent,
} from '../src/gm/shapeModel';

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

const row = (over: Partial<ShapeReferenceRow>): ShapeReferenceRow => ({
  id: 'r',
  source: 'books',
  track: 'class',
  name: 'Archer',
  note: 'G · start · Jake Thayne',
  stats: { perception: 2, agility: 1, strength: 1 },
  free: 1,
  total: 5,
  ...over,
});

describe('the reference table (ME.4)', () => {
  const stats = [
    { id: 'strength', name: 'Strength' },
    { id: 'agility', name: 'Agility' },
    { id: 'perception', name: 'Perception' },
  ];

  it('shows each stat and free points as a percent of the total, in stat order', () => {
    expect(shapePercent(row({}), stats)).toEqual([
      { label: 'Strength', percent: 20 },
      { label: 'Agility', percent: 20 },
      { label: 'Perception', percent: 40 },
      { label: 'Free', percent: 20 },
    ]);
    expect(shapePercent(row({ stats: {}, free: 0, total: 0 }), stats)).toEqual([]);
  });

  it("lists the step's own track first, campaign rows before the books'", () => {
    const ref = {
      books: [row({ id: 'b1' }), row({ id: 'b2', track: 'profession' })],
      campaign: [row({ id: 'c1', source: 'campaign', track: 'profession', note: 'Kim' })],
    };
    expect(rowsForStep(ref, 'profession').map((r) => r.id)).toEqual(['c1', 'b2', 'b1']);
    expect(rowsForStep(ref, 'class').map((r) => r.id)).toEqual(['b1', 'c1', 'b2']);
    expect(rowLabel(row({}))).toBe('Archer (class, books: G · start · Jake Thayne; 5/level)');
  });
});

describe('the reference cut to the campaign stats (ME.4 review)', () => {
  it('drops stats the rules lack, recounts the total, and drops empty rows', () => {
    const ref = {
      books: [
        row({ stats: { perception: 2, zeal: 3 }, free: 1, total: 6 }),
        row({ id: 'z', stats: { zeal: 4 }, free: 0, total: 4 }),
      ],
      campaign: [],
    };
    expect(fitReference(ref, ORDER).books).toEqual([
      row({ stats: { perception: 2 }, free: 1, total: 3 }),
    ]);
  });
  it('refuses a budget that is not a whole number', () => {
    expect(scaleShape(row({}), 2.5, ORDER)).toBeNull();
    expect(scaleShape(row({}), Number.NaN, ORDER)).toBeNull();
    expect(scaleShape(row({}), -1, ORDER)).toBeNull();
  });
});
