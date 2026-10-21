import { describe, expect, it } from 'vitest';
import {
  BonusRuleError,
  defaultRules,
  effectiveStats,
  statBreakdown,
  type BonusSource,
  type RulesConfig,
} from '../src';

// M1.6 Titles and bonuses: base → flat → percent → cap (DESIGN §4: +25% per stat).

const rules = defaultRules();
const base = (overrides: Record<string, number> = {}): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of rules.stats.list) out[s.id] = 10;
  return { ...out, ...overrides };
};
const title = (name: string, bonuses: BonusSource['bonuses']): BonusSource => ({
  id: `title-${name}`,
  kind: 'title',
  name,
  bonuses,
});

describe('effective stats', () => {
  it('with no sources equals the base for every rules stat', () => {
    const stats = base({ strength: 23 });
    expect(effectiveStats(rules, stats, [])).toEqual(stats);
    expect(Object.keys(effectiveStats(rules, stats, []))).toHaveLength(9);
  });

  it('adds flat bonuses from every source', () => {
    const out = effectiveStats(rules, base(), [
      title('Forerunner', [{ stat: 'strength', flat: 5 }]),
      title('Rapid Spread', [
        { stat: 'strength', flat: 3 },
        { stat: 'agility', flat: 2 },
      ]),
    ]);
    expect(out['strength']).toBe(18);
    expect(out['agility']).toBe(12);
    expect(out['vitality']).toBe(10);
  });

  it('sums percentages (no compounding) and applies them after flats', () => {
    const b = statBreakdown(rules, base({ perception: 100 }), [
      title('A', [{ stat: 'perception', flat: 20, percent: 0.1 }]),
      title('B', [{ stat: 'perception', percent: 0.1 }]),
    ])['perception'];
    // (100 + 20) × 1.2 = 144; compounding would give 145.2, percent-first 140.
    expect(b).toEqual({
      base: 100,
      flat: 20,
      percent: 0.2,
      percentApplied: 0.2,
      capped: false,
      value: 144,
    });
  });

  it('caps the summed percentage at the rules cap (+25%)', () => {
    const b = statBreakdown(rules, base({ wisdom: 200 }), [
      title('A', [{ stat: 'wisdom', percent: 0.15 }]),
      title('B', [{ stat: 'wisdom', percent: 0.15 }]),
      title('C', [{ stat: 'wisdom', flat: 40 }]),
    ])['wisdom'];
    expect(b?.percent).toBe(0.3);
    expect(b?.percentApplied).toBe(0.25);
    expect(b?.capped).toBe(true);
    expect(b?.value).toBe(300); // (200 + 40) × 1.25
  });

  it('exactly at the cap is not "capped"', () => {
    const b = statBreakdown(rules, base(), [title('A', [{ stat: 'wisdom', percent: 0.25 }])]);
    expect(b['wisdom']?.capped).toBe(false);
    expect(b['wisdom']?.percentApplied).toBe(0.25);
  });

  it('the cap is read from the rules config', () => {
    const loose: RulesConfig = { ...rules, bonuses: { percentCapPerStat: 0.5 } };
    const sources = [title('A', [{ stat: 'strength', percent: 0.4 }])];
    expect(effectiveStats(rules, base({ strength: 100 }), sources)['strength']).toBe(125);
    expect(effectiveStats(loose, base({ strength: 100 }), sources)['strength']).toBe(140);
  });

  it('does not let float noise move a value (0.1 + 0.2 = 0.3)', () => {
    const b = statBreakdown(rules, base({ agility: 10 }), [
      title('A', [{ stat: 'agility', percent: 0.1 }]),
      title('B', [{ stat: 'agility', percent: 0.2 }]),
    ])['agility'];
    expect(b?.percent).toBe(0.3);
    expect(b?.value).toBe(13);
  });

  it('rounds half away from zero to whole stat units', () => {
    // 10 × 1.05 = 10.5 → 11; 30 × 1.05 = 31.5 → 32; 10 × 1.04 = 10.4 → 10.
    const s = (percent: number, v: number) =>
      effectiveStats(rules, base({ toughness: v }), [title('A', [{ stat: 'toughness', percent }])])[
        'toughness'
      ];
    expect(s(0.05, 10)).toBe(11);
    expect(s(0.05, 30)).toBe(32);
    expect(s(0.04, 10)).toBe(10);
  });

  it('penalties lower the stat but never below 0, and are not capped', () => {
    const out = effectiveStats(rules, base({ endurance: 10 }), [
      title('Cursed', [
        { stat: 'endurance', flat: -15 },
        { stat: 'willpower', percent: -0.5 },
      ]),
    ]);
    expect(out['endurance']).toBe(0);
    expect(out['willpower']).toBe(5);
  });

  it('works the same for items as for titles', () => {
    const ring: BonusSource = {
      id: 'item-ring',
      kind: 'item',
      name: 'Ring of Vigor',
      bonuses: [{ stat: 'vitality', flat: 10, percent: 0.1 }],
    };
    expect(effectiveStats(rules, base(), [ring])['vitality']).toBe(22);
  });

  it('is pure: inputs are not changed and order of sources does not matter', () => {
    const stats = base({ strength: 37 });
    const a = title('A', [{ stat: 'strength', flat: 3, percent: 0.2 }]);
    const b = title('B', [{ stat: 'strength', flat: -1, percent: 0.1 }]);
    const snapshot = JSON.stringify([stats, a, b]);
    expect(effectiveStats(rules, stats, [a, b])).toEqual(effectiveStats(rules, stats, [b, a]));
    expect(JSON.stringify([stats, a, b])).toBe(snapshot);
  });

  it('matches a fixed-seed brute-force reference over random stacks', () => {
    const seed = 20261106;
    let state = seed;
    const rand = () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
    for (let i = 0; i < 500; i++) {
      const own = Math.floor(rand() * 2000);
      const count = Math.floor(rand() * 5);
      const sources: BonusSource[] = [];
      let flat = 0;
      let pctHundredths = 0;
      for (let j = 0; j < count; j++) {
        const f = Math.floor(rand() * 41) - 10;
        const p = Math.floor(rand() * 21) - 5; // −5% … +15%
        flat += f;
        pctHundredths += p;
        sources.push(title(`T${j}`, [{ stat: 'strength', flat: f, percent: p / 100 }]));
      }
      const applied = Math.min(25, pctHundredths);
      const exact = ((own + flat) * (100 + applied)) / 100;
      const expected = Math.max(0, Math.sign(exact) * Math.round(Math.abs(exact)));
      const got = effectiveStats(rules, base({ strength: own }), sources)['strength'];
      expect(got, `seed ${seed} case ${i}`).toBe(expected);
    }
  });
});

describe('bonus validation', () => {
  it.each([
    [[{ stat: 'luck', flat: 1 }], /Unknown stat "luck"/],
    [[{ stat: 'strength' }], /neither flat nor percent/],
    [[{ stat: 'strength', flat: 1.5 }], /whole number/],
    [[{ stat: 'strength', flat: Number.NaN }], /whole number/],
    [[{ stat: 'strength', percent: Number.POSITIVE_INFINITY }], /above -100%/],
    [[{ stat: 'strength', percent: -1 }], /above -100%/],
  ])('rejects %j', (bonuses, message) => {
    expect(() => effectiveStats(rules, base(), [title('Bad', bonuses)])).toThrow(BonusRuleError);
    expect(() => effectiveStats(rules, base(), [title('Bad', bonuses)])).toThrow(message);
  });

  it('rejects a missing or non-numeric base stat', () => {
    const stats = base();
    delete stats['wisdom'];
    expect(() => effectiveStats(rules, stats, [])).toThrow(/Stat "wisdom" is missing/);
    expect(() => effectiveStats(rules, base({ wisdom: Number.NaN }), [])).toThrow(BonusRuleError);
  });
});
