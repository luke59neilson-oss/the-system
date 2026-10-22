import { describe, expect, it } from 'vitest';
import {
  adjustedValues,
  clockComplete,
  contestChance,
  damageFactor,
  defaultRules,
  planGroup,
  walled,
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
const none = { ...rules, resolution: { ...rules.resolution, gradeGapMode: 'none' as const } };

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
    expect(contestChance(none, f, d)).toBe(0.5);
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

  it('10,000 rolls land within ±1.5% of independently computed odds for 1:1, 2:1, 3:1, 10:1 in every mode, same grade and across grades both ways (seed 20261111)', () => {
    const SEED = 20261111;
    const rng = seededRandom(SEED);
    const factor: Record<string, number> = { F: 3, D: 10, E: 5 };
    // Odds written out from DESIGN §7, not from contestChance.
    const odds = (mode: GradeGapMode, r: number, ga: string, gb: string): number => {
      let a = 10 * r;
      let b = 10;
      if (mode === 'multiplier') {
        a *= factor[ga] ?? 0;
        b *= factor[gb] ?? 0;
      }
      if (mode === 'lowerGradeFraction' && ga !== gb) {
        if ('GFEDCBA'.indexOf(ga) < 'GFEDCBA'.indexOf(gb)) a /= 3;
        else b /= 3;
      }
      return a / (a + b);
    };
    let cases = 0;
    for (const mode of MODES) {
      for (const ratio of [1, 2, 3, 10]) {
        for (const [ga, gb] of [
          ['E', 'E'],
          ['F', 'D'],
          ['D', 'F'],
        ] as const) {
          const a = { value: 10 * ratio, grade: ga };
          const b = { value: 10, grade: gb };
          const expected = odds(mode, ratio, ga, gb);
          expect(contestChance(rules, a, b, mode)).toBeCloseTo(expected, 12);
          let wins = 0;
          for (let i = 0; i < 10_000; i++) if (rollContest(rules, a, b, rng, mode).success) wins++;
          expect(
            Math.abs(wins / 10_000 - expected),
            `seed ${SEED}, ${mode} ${ratio}:1 ${ga} vs ${gb}`,
          ).toBeLessThan(0.015);
          cases++;
        }
      }
    }
    expect(cases).toBe(36);
    // Pinned literals for the plain ratios.
    const e = (v: number) => ({ value: v, grade: 'E' });
    expect([1, 2, 3, 10].map((r) => contestChance(rules, e(10 * r), e(10), 'none'))).toEqual([
      0.5,
      2 / 3,
      0.75,
      10 / 11,
    ]);
  });
});

describe('progress clocks and montage (DESIGN §7)', () => {
  it('fills on successes, counts failures, stops at full', () => {
    let c = newClock('k', ' Climb the Spout ', 4, '2026-10-21T00:00:00.000Z');
    expect(c).toMatchObject({ name: 'Climb the Spout', filled: 0, failures: 0 });
    c = tickClock(c, 'success', 3);
    c = tickClock(c, 'failure');
    expect(c).toMatchObject({ filled: 3, failures: 1 });
    expect(() => tickClock(c, 'success', 2)).toThrow(/only 1 segment left/);
    expect(() => tickClock(c, 'failure', 2)).toThrow(/counts once/);
    c = tickClock(c, 'success');
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

describe('grade walls (MQ.5, DESIGN §7, D115)', () => {
  const side = (value: number, grade: string) => ({ value, grade });

  it('is the default mode for new campaigns', () => {
    expect(rules.resolution.gradeGapMode).toBe('gradeWalls');
  });

  it('same grade: plain ratio odds', () => {
    expect(contestChance(rules, side(30, 'E'), side(10, 'E'))).toBe(0.75);
    expect(adjustedValues(rules, side(30, 'E'), side(10, 'E'))).toEqual([30, 10]);
  });

  it('one grade apart: the lower side counts ×⅓, either way round', () => {
    expect(adjustedValues(rules, side(30, 'E'), side(10, 'D'))).toEqual([10, 10]);
    expect(adjustedValues(rules, side(10, 'D'), side(30, 'E'))).toEqual([10, 10]);
    expect(contestChance(rules, side(30, 'E'), side(10, 'D'))).toBeCloseTo(0.5, 12);
    expect(contestChance(rules, side(60, 'F'), side(10, 'E'))).toBeCloseTo(2 / 3, 12);
    expect(walled(rules, side(1, 'E'), side(1, 'D'))).toBe(false);
  });

  it('peak E against a fresh D wins about 24% of single rolls (20,000 rolls, seed 20261022)', () => {
    // DESIGN §4 check values: 614 total stats at level 49 (peak E); a fresh D
    // at level 50 has one more D level, +18 (§4), averaged over nine stats.
    const SEED = 20261022;
    const peakE = side(614 / 9, 'E');
    const freshD = side((614 + 18) / 9, 'D');
    const expected = 614 / 3 / (614 / 3 + 632);
    expect(contestChance(rules, peakE, freshD)).toBeCloseTo(expected, 12);
    const rng = seededRandom(SEED);
    let wins = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (rollContest(rules, peakE, freshD, rng).success) wins++;
    expect(Math.abs(wins / n - 0.24), `seed ${SEED}: ${wins}/${n}`).toBeLessThan(0.02);
  });

  it('two or more grades apart: no roll, the higher grade succeeds, the RNG is untouched', () => {
    let draws = 0;
    const rng = () => {
      draws++;
      return 0;
    };
    for (const [low, high] of [
      ['G', 'E'],
      ['F', 'D'],
      ['E', 'A'],
    ] as const) {
      // Even a huge lower-grade value cannot win.
      const up = rollContest(rules, side(10_000, low), side(1, high), rng);
      expect(up).toEqual({ yours: 0, theirs: 1, chance: 0, roll: null, success: false });
      const down = rollContest(rules, side(1, high), side(10_000, low), rng);
      expect(down).toMatchObject({ chance: 1, roll: null, success: true });
      expect(contestChance(rules, side(10_000, low), side(1, high))).toBe(0);
      expect(walled(rules, side(1, low), side(1, high))).toBe(true);
    }
    // A higher grade with 0 in the stat still succeeds.
    expect(rollContest(rules, side(0, 'C'), side(50, 'E'), rng).success).toBe(true);
    expect(draws).toBe(0);
    // Other modes still roll across the same gap.
    expect(walled(rules, side(1, 'G'), side(1, 'E'), 'lowerGradeFraction')).toBe(false);
    expect(rollContest(rules, side(1, 'G'), side(1, 'E'), rng, 'none').roll).toBe(0);
    expect(draws).toBe(1);
  });

  it('damage: ⅓ from one grade below, none from two or more below, full otherwise', () => {
    expect(damageFactor(rules, 'E', 'E')).toBe(1);
    expect(damageFactor(rules, 'D', 'E')).toBe(1);
    expect(damageFactor(rules, 'A', 'G')).toBe(1);
    expect(damageFactor(rules, 'E', 'D')).toBeCloseTo(1 / 3, 12);
    expect(damageFactor(rules, 'G', 'F')).toBeCloseTo(1 / 3, 12);
    expect(damageFactor(rules, 'F', 'D')).toBe(0);
    expect(damageFactor(rules, 'G', 'A')).toBe(0);
    // Other modes never scale damage.
    for (const mode of MODES) expect(damageFactor(rules, 'G', 'A', mode)).toBe(1);
  });

  it('no strength in numbers across grades: only same-or-higher grades pool', () => {
    const opp = side(50, 'D');
    const party = [
      { ...side(40, 'D'), id: 'd' },
      { ...side(40, 'C'), id: 'c' },
      { ...side(60, 'E'), id: 'e1' },
      { ...side(60, 'E'), id: 'e2' },
      { ...side(900, 'F'), id: 'f' },
      { ...side(900, 'G'), id: 'g' },
    ];
    const plan = planGroup(rules, party, opp);
    expect(plan.pooled.map((m) => m.id)).toEqual(['d', 'c']);
    expect(plan.alone.map((m) => m.id)).toEqual(['e1', 'e2']);
    expect(plan.powerless.map((m) => m.id)).toEqual(['f', 'g']);
    // A thousand G-grades are nothing to an A-grade.
    const horde = Array.from({ length: 1000 }, () => side(100, 'G'));
    const vsA = planGroup(rules, horde, side(1, 'A'));
    expect(vsA.pooled).toHaveLength(0);
    expect(vsA.alone).toHaveLength(0);
    expect(vsA.powerless).toHaveLength(1000);
    // Other modes pool everyone.
    for (const mode of MODES) expect(planGroup(rules, party, opp, mode).pooled).toHaveLength(6);
    expect(() => planGroup(rules, [side(-1, 'D')], opp)).toThrow(/≥ 0/);
  });
});
