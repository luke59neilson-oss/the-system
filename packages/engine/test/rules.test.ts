import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  RULES_CONFIG_VERSION,
  defaultRules,
  gradeIndexForLevel,
  migrateRulesConfig,
  parseRulesConfig,
  selectionLevels,
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
    const perGrade = selectionLevels(defaultRules());
    expect(perGrade.map((g) => g.grade)).toEqual(['G', 'F', 'E', 'D', 'C', 'B', 'A']);
    expect(perGrade.flatMap((g) => g.levels)).toHaveLength(29);
    expect(perGrade.flatMap((g) => g.levels.slice(-1))).toEqual([10, 45, 90, 140, 190, 240]);
    expect(perGrade[1]?.levels).toEqual([5, 10]);
  });

  it('stop selections at the level cap', () => {
    const raw = rawDefaults();
    raw.campaign.levelCap = 49;
    const result = parseRulesConfig(raw);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(selectionLevels(result.config).map((g) => g.grade)).toEqual(['G', 'F', 'E']);
  });

  it('map levels to grades', () => {
    const rules = defaultRules();
    expect(
      [0, 4, 5, 14, 15, 240, 999].map((l) => rules.grades[gradeIndexForLevel(rules, l)]?.id),
    ).toEqual(['G', 'G', 'F', 'F', 'E', 'A', 'A']);
  });
});

describe('invalid configs give readable errors', () => {
  it('names the path and problem for type errors', () => {
    const errors = errorsFor((raw) => {
      raw.grades[2].topLevel = 'fifty';
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^grades\[2\] \(E\)\.topLevel: .*number/i);
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
      /^pools\[0\] \(hp\)\.stat: unknown stat "luck"/,
    ],
    [
      'grade ceiling is an unknown rarity',
      (r: any) => (r.grades[0].rarityCeiling = 'shiny'),
      /^grades\[0\] \(G\)\.rarityCeiling: unknown rarity "shiny"/,
    ],
    [
      'grade tops are not increasing',
      (r: any) => (r.grades[3].topLevel = 40),
      /^grades\[3\] \(D\)\.topLevel: must be greater than the previous grade's \(49\)/,
    ],
    [
      'selection interval skips the grade',
      (r: any) => (r.grades[1].selectionInterval = 20),
      /^grades\[1\] \(F\)\.selectionInterval: no selection level falls inside levels 5-14/,
    ],
    [
      'level cap exceeds last grade',
      (r: any) => (r.campaign.levelCap = 300),
      /^campaign\.levelCap: must equal the top level of a grade/,
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
      /^stats\.list\[0\] \(Strength\)\.id: must be a camelCase identifier/,
    ],
    [
      'non-integer spread',
      (r: any) => (r.grades[0].classSpreadPerLevel = 4.5),
      /^grades\[0\] \(G\)\.classSpreadPerLevel: /,
    ],
  ])('%s', (_label, mutate, pattern) => {
    const errors = errorsFor(mutate);
    expect(
      errors.some((e) => pattern.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it.each([
    [
      'reserved rarity as a ceiling',
      (r: any) => (r.grades[6].rarityCeiling = 'divine'),
      /^grades\[6\] \(A\)\.rarityCeiling: rarity "divine" is reserved/,
    ],
    [
      'reserved rarity for the race skill',
      (r: any) => (r.skills.startingRaceSkill.rarity = 'divine'),
      /^skills\.startingRaceSkill\.rarity: rarity "divine" is reserved/,
    ],
    [
      'reserved rarity as merge minimum',
      (r: any) => (r.skills.merge.minRarity = 'divine'),
      /^skills\.merge\.minRarity: rarity "divine" is reserved/,
    ],
    [
      'reserved rarity mid-ladder',
      (r: any) => (r.skills.rarities[3].reserved = true),
      /^skills\.rarities: reserved rarities must come last/,
    ],
    [
      'ceiling going down',
      (r: any) => (r.grades[3].rarityCeiling = 'inferior'),
      /^grades\[3\] \(D\)\.rarityCeiling: grade D's ceiling must not be below grade E's \("epic"\)/,
    ],
    [
      'level cap inside a grade',
      (r: any) => (r.campaign.levelCap = 1),
      /^campaign\.levelCap: must equal the top level of a grade/,
    ],
    ['unknown top-level key', (r: any) => (r.bogus = 1), /^bogus: unknown setting/],
    ['typo key', (r: any) => (r.bonuses.percentCap = 0.3), /^bonuses\.percentCap: unknown setting/],
    [
      'missing value',
      (r: any) => delete r.grades[1].xpPerLevel,
      /^grades\[1\] \(F\)\.xpPerLevel: is required/,
    ],
    [
      'typical pace outside range',
      (r: any) => (r.campaign.typicalLevelsPerSession = 50),
      /^campaign\.typicalLevelsPerSession: must be within the range 4-8/,
    ],
    [
      'profession at first grade',
      (r: any) => (r.tracks.professionUnlockGrade = 'G'),
      /^tracks\.professionUnlockGrade: must be a grade reached by evolving/,
    ],
    [
      'inherited-name rarity without a mark cost',
      (r: any) => r.skills.rarities.splice(1, 0, { id: 'toString', name: 'X' }),
      /^skills\.markUpgrades: missing mark cost to upgrade from "toString"/,
    ],
    [
      'duplicate pool',
      (r: any) => r.pools.push({ ...r.pools[0] }),
      /^pools: duplicate pool id "hp"/,
    ],
    [
      'duplicate rarity',
      (r: any) => r.skills.rarities.splice(1, 0, { id: 'inferior', name: 'Again' }),
      /^skills\.rarities: duplicate rarity id "inferior"/,
    ],
    [
      'duplicate slot',
      (r: any) => r.economy.equipmentSlots.push({ ...r.economy.equipmentSlots[0] }),
      /^economy\.equipmentSlots: duplicate slot id "ring"/,
    ],
    [
      'transforms min over max',
      (r: any) => (r.skills.evolutionTransforms.min = 3),
      /^skills\.evolutionTransforms: min must not exceed max/,
    ],
    [
      'pace range reversed',
      (r: any) => (r.campaign.typicalLevelsPerSessionRange = [8, 4]),
      /^campaign\.typicalLevelsPerSessionRange: low must not exceed high/,
    ],
    ['zero starting stats', (r: any) => (r.stats.startingValue = 0), /^stats\.startingValue: /],
  ])('%s', (_label, mutate, pattern) => {
    const errors = errorsFor(mutate);
    expect(
      errors.some((e) => pattern.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('says "is required" for a missing literal setting', () => {
    expect(errorsFor((r) => delete r.xp.defaultSplit)).toEqual(['xp.defaultSplit: is required']);
  });

  it('rejects non-JSON input without throwing', () => {
    const circular: Record<string, unknown> = { configVersion: 1 };
    circular['self'] = circular;
    expect(parseRulesConfig(circular)).toEqual({
      ok: false,
      errors: ['(root): rules config is not plain JSON data'],
    });
    expect(parseRulesConfig({ configVersion: 1, big: BigInt(1) }).ok).toBe(false);
  });

  it('reports each duplicate once', () => {
    const errors = errorsFor((r) => {
      r.stats.list.push({ id: 'strength', name: 'A' }, { id: 'strength', name: 'B' });
    });
    expect(errors.filter((e) => e.includes('duplicate stat id'))).toHaveLength(1);
  });

  it('accepts grades defined above the level cap (adding S later)', () => {
    const raw = rawDefaults();
    raw.campaign.levelCap = 199;
    const result = parseRulesConfig(raw);
    expect(result.ok ? [] : result.errors).toEqual([]);
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
    expect(result).toMatchObject({ ok: true, raw: { configVersion: 3, renamed: 'x' } });
  });

  it('never mutates the caller and contains throwing migrations', () => {
    const input = { configVersion: 1, list: [1] };
    const mutating: Record<number, RulesMigration> = {
      1: (raw) => {
        (raw['list'] as number[]).push(2);
        return raw;
      },
    };
    expect(migrateRulesConfig(input, mutating, 2).ok).toBe(true);
    expect(input).toEqual({ configVersion: 1, list: [1] });

    const throwing: Record<number, RulesMigration> = {
      1: () => {
        throw new Error('grades missing');
      },
    };
    expect(parseRulesConfig(input, throwing, 2)).toEqual({
      ok: false,
      errors: ['configVersion: migration from version 1 failed: grades missing'],
    });
  });

  it('validates migrated configs end to end', () => {
    // Pretend v1 files named the currency field differently (a test-only migration).
    const v1 = rawDefaults();
    v1.configVersion = 1;
    v1.economy.currency = v1.economy.currencyName;
    delete v1.economy.currencyName;
    const migrations: Record<number, RulesMigration> = {
      1: (raw) => {
        const economy = raw['economy'] as Record<string, unknown>;
        const { currency, ...rest } = economy;
        return { ...raw, economy: { ...rest, currencyName: currency } };
      },
    };
    const migrated = migrateRulesConfig(v1, migrations, 2);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect((migrated.raw['economy'] as Record<string, unknown>)['currencyName']).toBe('Credits');
      expect(parseRulesConfig(migrated.raw).ok).toBe(true);
    }
    expect(parseRulesConfig(v1).ok).toBe(false); // unmigrated: unknown key + missing value
  });

  it('reports a gap in the migration chain', () => {
    expect(migrateRulesConfig({ configVersion: 1 }, {}, 2)).toEqual({
      ok: false,
      errors: ['configVersion: no migration from version 1 to 2'],
    });
  });
});
