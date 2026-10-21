import { describe, expect, it } from 'vitest';
import {
  adjustedValues,
  clockComplete,
  contestChance,
  defaultRules,
  execute,
  montageAvailable,
  newClock,
  projectForPlayer,
  rollContest,
  tickClock,
  type Campaign,
  type Command,
  type GradeGapMode,
} from '../src';
import { kit, rawRules, run, seededRandom, testContext } from './helpers/events';

const rules = defaultRules();
const MODES: readonly GradeGapMode[] = ['none', 'multiplier', 'lowerGradeFraction'];

describe('contest odds (DESIGN §7)', () => {
  it('ratio odds: yours ÷ (yours + theirs)', () => {
    const g = (value: number) => ({ value, grade: 'G' });
    expect(contestChance(rules, g(20), g(20), 'none')).toBe(0.5);
    expect(contestChance(rules, g(20), g(10), 'none')).toBeCloseTo(2 / 3, 12);
    expect(contestChance(rules, g(30), g(10), 'none')).toBe(0.75);
    expect(contestChance(rules, g(100), g(10), 'none')).toBeCloseTo(10 / 11, 12);
    expect(contestChance(rules, g(0), g(10), 'none')).toBe(0);
    expect(contestChance(rules, g(0), g(0), 'none')).toBe(0.5);
  });

  it('grade-gap modes', () => {
    const f = { value: 10, grade: 'F' };
    const d = { value: 10, grade: 'D' };
    expect(adjustedValues(rules, f, d, 'none')).toEqual([10, 10]);
    expect(adjustedValues(rules, f, d, 'multiplier')).toEqual([30, 100]); // F×3, D×10
    expect(adjustedValues(rules, f, d, 'lowerGradeFraction')).toEqual([10 * (1 / 3), 10]);
    expect(adjustedValues(rules, d, f, 'lowerGradeFraction')).toEqual([10, 10 * (1 / 3)]);
    expect(adjustedValues(rules, f, f, 'lowerGradeFraction')).toEqual([10, 10]);
    expect(contestChance(rules, f, d, 'multiplier')).toBeCloseTo(30 / 130, 12);
    expect(contestChance(rules, f, d, 'lowerGradeFraction')).toBeCloseTo(0.25, 12);
    // The config's mode is the default.
    const multi = {
      ...rules,
      resolution: { ...rules.resolution, gradeGapMode: 'multiplier' as const },
    };
    expect(contestChance(multi, f, d)).toBeCloseTo(30 / 130, 12);
    expect(contestChance(rules, f, d)).toBe(0.5);
  });

  it('rejects bad inputs', () => {
    const g = (value: number) => ({ value, grade: 'G' });
    expect(() => contestChance(rules, g(-1), g(1))).toThrow(/≥ 0/);
    expect(() => contestChance(rules, g(Number.NaN), g(1))).toThrow(/≥ 0/);
    expect(() => contestChance(rules, { value: 1, grade: 'Z' }, g(1))).toThrow(/Unknown grade/);
    expect(() => rollContest(rules, g(1), g(1), () => 1)).toThrow(/\[0, 1\)/);
    expect(() => rollContest(rules, g(1), g(1), () => -0.1)).toThrow(/\[0, 1\)/);
    expect(() => contestChance(rules, g(1), g(1), 'bogus' as GradeGapMode)).toThrow(
      /Unknown grade-gap/,
    );
  });

  it('a roll wins when below the chance', () => {
    const g = (value: number) => ({ value, grade: 'G' });
    expect(rollContest(rules, g(30), g(10), () => 0.74).success).toBe(true);
    expect(rollContest(rules, g(30), g(10), () => 0.75).success).toBe(false);
    expect(rollContest(rules, g(0), g(10), () => 0).success).toBe(false);
  });

  it('10,000 rolls land within ±2% of the odds for 1:1, 2:1, 3:1, 10:1 in every mode (seed 20261111)', () => {
    const SEED = 20261111;
    const rng = seededRandom(SEED);
    for (const mode of MODES) {
      for (const [ratio, grades] of [
        [1, ['E', 'E']],
        [2, ['E', 'E']],
        [3, ['F', 'D']],
        [10, ['D', 'F']],
      ] as const) {
        const a = { value: 10 * ratio, grade: grades[0] };
        const b = { value: 10, grade: grades[1] };
        const expected = contestChance(rules, a, b, mode);
        let wins = 0;
        for (let i = 0; i < 10_000; i++) if (rollContest(rules, a, b, rng, mode).success) wins++;
        expect(Math.abs(wins / 10_000 - expected), `seed ${SEED}, ${mode} ${ratio}:1`).toBeLessThan(
          0.02,
        );
      }
    }
  });
});

describe('progress clocks and montage (DESIGN §7)', () => {
  it('fills on successes, counts failures, stops at full', () => {
    let c = newClock('k', ' Climb the Spout ', 4, '2026-10-21T00:00:00.000Z');
    expect(c).toMatchObject({ name: 'Climb the Spout', filled: 0, failures: 0 });
    c = tickClock(c, 'success', 3);
    c = tickClock(c, 'failure');
    expect(c).toMatchObject({ filled: 3, failures: 1 });
    c = tickClock(c, 'success', 5);
    expect(c.filled).toBe(4);
    expect(clockComplete(c)).toBe(true);
    expect(() => tickClock(c, 'success')).toThrow(/already complete/);
    expect(() => newClock('k', 'x', 0, '')).toThrow(/1–24/);
    expect(() => newClock('k', 'x', 25, '')).toThrow(/1–24/);
    expect(() => tickClock(newClock('k', 'x', 4, ''), 'success', 0)).toThrow(/at least one/);
  });

  it('montage: half full, no failures, not complete', () => {
    const at = (filled: number, failures = 0, segments = 6) => ({
      ...newClock('k', 'x', segments, ''),
      filled,
      failures,
    });
    expect(montageAvailable(rules, at(2))).toBe(false);
    expect(montageAvailable(rules, at(3))).toBe(true);
    expect(montageAvailable(rules, at(5))).toBe(true);
    expect(montageAvailable(rules, at(6))).toBe(false); // complete
    expect(montageAvailable(rules, at(4, 1))).toBe(false); // a failure
    expect(montageAvailable(rules, at(2, 0, 5))).toBe(false); // 2/5 < half
    expect(montageAvailable(rules, at(3, 0, 5))).toBe(true);
    const lenient = { ...rules, montage: { minClockFill: 0.5, requireNoFailures: false } };
    expect(montageAvailable(lenient, at(4, 1))).toBe(true);
  });

  const ctx = testContext('c');
  const base = (): Campaign =>
    run(
      [
        { type: 'campaign.create', name: 'Clocks', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      ctx,
    );
  const ok = (c: Campaign, command: Command, context = ctx) => {
    const r = execute(c, command, context);
    if (!r.ok) throw new Error(r.error);
    return r.campaign;
  };
  const reject = (c: Campaign, command: Command, context = ctx) => {
    const r = execute(c, command, context);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error;
  };

  it('clock events: create, tick, remove, undo; GM only; not sent to players', () => {
    let c = ok(base(), {
      type: 'clock.create',
      clockId: 'spout',
      name: 'Canary Climb',
      segments: 4,
    });
    c = ok(c, { type: 'clock.tick', clockId: 'spout', result: 'success', amount: 2 });
    expect(c.state?.clocks['spout']).toMatchObject({ filled: 2, failures: 0 });
    expect(montageAvailable(rules, c.state?.clocks['spout'] ?? newClock('x', 'x', 1, ''))).toBe(
      true,
    );
    c = ok(c, { type: 'clock.tick', clockId: 'spout', result: 'failure' });
    expect(c.state?.clocks['spout']?.failures).toBe(1);
    c = ok(c, { type: 'event.undo', eventId: c.events.at(-1)?.id ?? '' });
    expect(c.state?.clocks['spout']?.failures).toBe(0);
    expect(
      reject(c, { type: 'clock.create', clockId: 'spout', name: 'Again', segments: 4 }),
    ).toMatch(/already exists/);
    expect(reject(c, { type: 'clock.create', name: 'Bad', segments: 30 })).toMatch(/segments/);
    expect(reject(c, { type: 'clock.tick', clockId: 'nope', result: 'success' })).toMatch(
      /unknown clock/,
    );
    expect(
      reject(
        c,
        { type: 'clock.tick', clockId: 'spout', result: 'success' },
        {
          ...ctx,
          actor: { role: 'player', characterId: 'jake' },
        },
      ),
    ).toMatch(/only the GM/);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(JSON.stringify(projectForPlayer(state, 'jake'))).not.toContain('Canary Climb');
    c = ok(c, { type: 'clock.tick', clockId: 'spout', result: 'success', amount: 2 });
    expect(reject(c, { type: 'clock.tick', clockId: 'spout', result: 'success' })).toMatch(
      /complete/,
    );
    // Undoing the creation while ticks stand is refused.
    expect(reject(c, { type: 'event.undo', eventId: c.events[2]?.id ?? '' })).toMatch(
      /unknown clock/,
    );
    c = ok(c, { type: 'clock.remove', clockId: 'spout' });
    expect(c.state?.clocks).toEqual({});
    expect(c.state?.clockOrder).toEqual([]);
    expect(reject(c, { type: 'clock.remove', clockId: 'spout' })).toMatch(/unknown clock/);
  });
});
