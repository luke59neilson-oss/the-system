import { describe, expect, it } from 'vitest';
import type { PlayerRules } from '@the-system/engine';
import { allocationText, assignedBatches, nextBatch, spent, step } from '../src/player/freePoints';

const rules = {
  stats: {
    list: [
      { id: 'strength', name: 'Strength' },
      { id: 'agility', name: 'Agility' },
      { id: 'perception', name: 'Perception' },
    ],
    displayDivisor: 10,
    displayDecimals: 1,
  },
} as unknown as PlayerRules;

describe('free points (M3.4)', () => {
  it('offers the oldest unassigned batch', () => {
    const batches = [
      { raceLevel: 3, points: 2, allocation: null, locked: false },
      { raceLevel: 1, points: 2, allocation: { agility: 2 }, locked: true },
      { raceLevel: 2, points: 2, allocation: null, locked: false },
    ];
    expect(nextBatch(batches)?.raceLevel).toBe(2);
    expect(nextBatch([])).toBeNull();
    expect(assignedBatches(batches).map((b) => b.raceLevel)).toEqual([1]);
  });

  it('steps within 0 and the batch size, dropping zero entries', () => {
    let a = step({}, 'agility', 1, 2);
    a = step(a, 'agility', 1, 2);
    expect(a).toEqual({ agility: 2 });
    expect(step(a, 'strength', 1, 2)).toEqual({ agility: 2 });
    expect(step({}, 'strength', -1, 2)).toEqual({});
    expect(step({ agility: 1 }, 'agility', -1, 2)).toEqual({});
    expect(spent({ agility: 1, perception: 1 })).toBe(2);
  });

  it('describes an allocation in stat order', () => {
    expect(allocationText(rules, { perception: 1, agility: 2 })).toBe('+2 Agility, +1 Perception');
    expect(allocationText(rules, {})).toBe('nothing');
  });
});
