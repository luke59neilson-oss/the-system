import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  RULES_CONFIG_VERSION,
  defaultRules,
  migrateRulesConfig,
  parseRulesConfig,
  type RulesMigration,
} from '../src';

/** A deep-cloned, mutable copy of the defaults for building invalid configs. */
function rawDefaults(): Record<string, any> {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function errorsFor(mutate: (raw: Record<string, any>) => void): string[] {
  const raw = rawDefaults();
  mutate(raw);
  const result = parseRulesConfig(raw);
  if (result.ok) throw new Error('expected the config to be rejected');
  return result.errors;
}

describe('default rules', () => {
  it('parse', () => {
    const result = parseRulesConfig(rawDefaults());
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('match the snapshot', () => {
    expect(defaultRules()).toMatchSnapshot();
  });

  it('return a fresh object each time', () => {
    const a = defaultRules();
    a.campaign.levelCap = 1;
    expect(defaultRules().campaign.levelCap).toBe(240);
  });

  it('carry the DESIGN grade table', () => {
    const rules = defaultRules();
    expect(rules.grades.map((g) => [g.id, g.topLevel, g.rarityCeiling, g.theme])).toEqual([
      ['G', 4, 'rare', 'aluminum'],
      ['F', 14, 'rare', 'bronze'],
      ['E', 49, 'epic', 'copper'],
      ['D', 99, 'ancient', 'silver'],
      ['C', 149, 'legendary', 'gold'],
      ['B', 199, 'legendary', 'platinum'],
      ['A', 240, 'mythical', 'diamond'],
    ]);
    expect(rules.stats.list).toHaveLength(9);
    expect(rules.economy.equipmentSlots.reduce((n, s) => n + s.count, 0)).toBe(12);
    expect(rules.skills.rarities.find((r) => r.id === 'divine')?.reserved).toBe(true);
    expect(rules.skills.rarities.find((r) => r.id === 'common')?.reserved).toBe(false);
  });

  it('reproduce the DESIGN §4 stat-budget check values', () => {
    const rules = defaultRules();
    const start = rules.stats.list.length * rules.stats.startingValue;
    const totals = new Map<number, number>();
    let total = start;
    let previousTop = 0;
    for (const grade of rules.grades) {
      for (let level = previousTop + 1; level <= grade.topLevel; level++) {
        total += grade.classSpreadPerLevel + grade.freePointsPerRaceLevel;
        totals.set(level, total);
      }
      previousTop = grade.topLevel;
    }
    expect(start).toBe(90);
    expect([14, 49, 99, 149, 199, 240].map((l) => totals.get(l))).toEqual([
      194, 614, 1514, 2864, 4864, 7324,
    ]);
  });

  it('yield 29 selections with capstones at 10/45/90/140/190/240 (DESIGN §3)', () => {
    const rules = defaultRules();
    const selections: number[] = [];
    const capstones: number[] = [];
    let previousTop = 0;
    for (const grade of rules.grades) {
      const inGrade: number[] = [];
      if (grade.selectionInterval !== null) {
        for (let l = previousTop + 1; l <= grade.topLevel; l++) {
          if (l % grade.selectionInterval === 0) inGrade.push(l);
        }
      }
      selections.push(...inGrade);
      if (inGrade.length > 0) capstones.push(inGrade.at(-1) as number);
      previousTop = grade.topLevel;
    }
    expect(selections).toHaveLength(29);
    expect(capstones).toEqual([10, 45, 90, 140, 190, 240]);
  });
});

describe('invalid configs give readable errors', () => {
  it('names the path and problem for type errors', () => {
    const errors = errorsFor((raw) => {
      raw.grades[2].topLevel = 'fifty';
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^grades\[2\]\.topLevel: .*number/i);
  });

  it('reports missing sections', () => {
    expect(errorsFor((raw) => delete raw.xp)[0]).toMatch(/^xp: /);
  });

  it('reports several problems at once', () => {
    const errors = errorsFor((raw) => {
      raw.stats.startingValue = -1;
      raw.economy.currencyName = '';
    });
    expect(errors.some((e) => e.startsWith('stats.startingValue:'))).toBe(true);
    expect(errors.some((e) => e.startsWith('economy.currencyName:'))).toBe(true);
  });

  it.each([
    [
      'pool references an unknown stat',
      (r: any) => (r.pools[0].stat = 'luck'),
      /^pools\[0\]\.stat: unknown stat "luck"/,
    ],
    [
      'grade ceiling is an unknown rarity',
      (r: any) => (r.grades[0].rarityCeiling = 'shiny'),
      /^grades\[0\]\.rarityCeiling: unknown rarity "shiny"/,
    ],
    [
      'grade tops are not increasing',
      (r: any) => (r.grades[3].topLevel = 40),
      /^grades\[3\]\.topLevel: must be greater than the previous grade's \(49\)/,
    ],
    [
      'selection interval skips the grade',
      (r: any) => (r.grades[1].selectionInterval = 20),
      /^grades\[1\]\.selectionInterval: no selection level falls inside levels 5-14/,
    ],
    [
      'level cap exceeds last grade',
      (r: any) => (r.campaign.levelCap = 300),
      /^campaign\.levelCap: exceeds the last grade's top level \(240\)/,
    ],
    [
      'profession grade unknown',
      (r: any) => (r.tracks.professionUnlockGrade = 'Z'),
      /^tracks\.professionUnlockGrade: unknown grade "Z"/,
    ],
    [
      'evolution gate invalid',
      (r: any) => (r.tracks.evolutionGate = 'profession'),
      /^tracks\.evolutionGate: /,
    ],
    [
      'grade-gap mode invalid',
      (r: any) => (r.resolution.gradeGapMode = 'chaos'),
      /^resolution\.gradeGapMode: /,
    ],
    [
      'mark cost missing',
      (r: any) => delete r.skills.markUpgrades.epic,
      /^skills\.markUpgrades: missing mark cost to upgrade from "epic"/,
    ],
    [
      'mark cost for a non-upgradable rarity',
      (r: any) => (r.skills.markUpgrades.mythical = 20),
      /^skills\.markUpgrades\.mythical: "mythical" is not an upgradable rarity/,
    ],
    [
      'duplicate stat',
      (r: any) => r.stats.list.push({ id: 'strength', name: 'Again' }),
      /^stats\.list: duplicate stat id "strength"/,
    ],
    ['duplicate grade', (r: any) => (r.grades[1].id = 'G'), /^grades: duplicate grade id "G"/],
    [
      'menu min over max',
      (r: any) => (r.skills.menuSize.min = 5),
      /^skills\.menuSize: min must not exceed max/,
    ],
    [
      'stability initial out of range',
      (r: any) => (r.stability.initial = 150),
      /^stability\.initial: must be between min and max/,
    ],
    [
      'merge min rarity unknown',
      (r: any) => (r.skills.merge.minRarity = 'meh'),
      /^skills\.merge\.minRarity: unknown rarity "meh"/,
    ],
    [
      'bad id format',
      (r: any) => (r.stats.list[0].id = 'Strength'),
      /^stats\.list\[0\]\.id: must be a camelCase identifier/,
    ],
    [
      'non-integer spread',
      (r: any) => (r.grades[0].classSpreadPerLevel = 4.5),
      /^grades\[0\]\.classSpreadPerLevel: /,
    ],
  ])('%s', (_label, mutate, pattern) => {
    const errors = errorsFor(mutate);
    expect(
      errors.some((e) => pattern.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('rejects non-objects and bad versions without throwing', () => {
    for (const raw of [null, 42, 'rules', []]) {
      const result = parseRulesConfig(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['(root): rules config must be an object']);
    }
    const noVersion = rawDefaults();
    delete noVersion.configVersion;
    expect(parseRulesConfig(noVersion)).toEqual({
      ok: false,
      errors: ['configVersion: must be a positive integer'],
    });
  });

  it('refuses configs from a newer app', () => {
    const raw = rawDefaults();
    raw.configVersion = RULES_CONFIG_VERSION + 1;
    const result = parseRulesConfig(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/newer than this app supports/);
  });
});

describe('migration hook', () => {
  it('is a no-op at the current version', () => {
    const raw = rawDefaults();
    expect(migrateRulesConfig(raw)).toEqual({ ok: true, raw });
  });

  it('applies migrations in order and stamps each version', () => {
    const calls: number[] = [];
    const migrations: Record<number, RulesMigration> = {
      1: (raw) => (calls.push(1), { ...raw, renamed: raw['old'] }),
      2: (raw) => (calls.push(2), { ...raw, old: undefined }),
    };
    const result = migrateRulesConfig({ configVersion: 1, old: 'x' }, migrations, 3);
    expect(calls).toEqual([1, 2]);
    expect(result).toEqual({ ok: true, raw: { configVersion: 3, renamed: 'x', old: undefined } });
  });

  it('reports a gap in the migration chain', () => {
    expect(migrateRulesConfig({ configVersion: 1 }, {}, 2)).toEqual({
      ok: false,
      errors: ['configVersion: no migration from version 1 to 2'],
    });
  });
});
