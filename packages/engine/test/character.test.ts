import { describe, expect, it } from 'vitest';
import {
  CharacterRuleError,
  clampPools,
  createCharacter,
  defaultRules,
  formatStat,
  gradeIndexOf,
  grantProfession,
  isAtCap,
  parseRulesConfig,
  poolMax,
  raceLevel,
  trackCap,
  DEFAULT_RULES,
  STARTER_CLASSES,
  type Character,
  type RulesConfig,
} from '../src';

const rules = defaultRules();
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];
const base = { id: 'c1', name: 'Jake', className: 'Archer' };
const fresh = (): Character => createCharacter(rules, { ...base, classSkills: kit });

function customRules(mutate: (raw: Record<string, any>) => void): RulesConfig {
  const raw = JSON.parse(JSON.stringify(DEFAULT_RULES));
  mutate(raw);
  const result = parseRulesConfig(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.config;
}

describe('createCharacter', () => {
  it('starts every stat at 10, level 0, G-grade, no profession, empty progress', () => {
    const c = fresh();
    expect(Object.keys(c.stats)).toHaveLength(9);
    expect(Object.values(c.stats).every((v) => v === 10)).toBe(true);
    expect([c.classLevel, c.professionLevel, c.grade, c.profession]).toEqual([0, 0, 'G', null]);
    expect([c.race, c.xp, c.freePointBatches, c.titles]).toEqual([
      'Human',
      { class: 0, profession: 0 },
      [],
      [],
    ]);
    expect(c.schemaVersion).toBe(3);
    expect(Object.values(c.classWeights)).toEqual(Array(9).fill(1));
    expect(Object.values(c.classSpreadTotals)).toEqual(Array(9).fill(0));
  });

  it('adds Identify (Common) as a race skill after the 3 class skills', () => {
    expect(fresh().skills.map((s) => [s.name, s.rarity, s.kind])).toEqual([
      ['Basic Archery', 'inferior', 'class'],
      ['Basic Stealth', 'inferior', 'class'],
      ['Archer’s Eye', 'common', 'class'],
      ['Identify', 'common', 'race'],
    ]);
  });

  it('starts with full pools: 100 HP / MP / Stamina', () => {
    expect(fresh().pools).toEqual({ hp: 100, mp: 100, stamina: 100 });
  });

  it('accepts an explicit race', () => {
    expect(createCharacter(rules, { ...base, race: 'Elf', classSkills: kit }).race).toBe('Elf');
  });

  it('takes every number from the rules config', () => {
    const custom = customRules((r) => {
      r.stats.startingValue = 12;
      r.pools[0].multiplier = 5;
      r.skills.startingClassSkillCount = 2;
      r.skills.startingRaceSkill = { name: 'Analyze', rarity: 'uncommon' };
      r.character.defaultRace = 'Dwarf';
    });
    const c = createCharacter(custom, { ...base, classSkills: kit.slice(0, 2) });
    expect([c.stats['strength'], c.pools['hp'], c.pools['mp'], c.race]).toEqual([
      12,
      60,
      120,
      'Dwarf',
    ]);
    expect(c.skills.map((s) => s.name)).toEqual(['Basic Archery', 'Basic Stealth', 'Analyze']);
    expect(() => createCharacter(custom, { ...base, classSkills: kit })).toThrow(
      /exactly 2 skills/,
    );
  });

  it('rejects bad starting kits and blank fields', () => {
    const withSkill = (name: string, rarity: string) => [...kit.slice(0, 2), { name, rarity }];
    const cases: [Parameters<typeof createCharacter>[1], RegExp][] = [
      [{ ...base, classSkills: kit.slice(0, 2) }, /exactly 3 skills \(got 2\)/],
      [{ ...base, classSkills: withSkill('God', 'divine') }, /not allowed at G-grade/],
      [{ ...base, classSkills: withSkill('Big', 'mythical') }, /ceiling rare/],
      [{ ...base, classSkills: withSkill('Basic Archery', 'common') }, /Duplicate skill/],
      [{ ...base, classSkills: withSkill('identify', 'common') }, /Duplicate skill/],
      [{ ...base, classSkills: withSkill(' ', 'common') }, /Skill name is required/],
      [{ ...base, name: '  ', classSkills: kit }, /Character name is required/],
      [{ ...base, id: '', classSkills: kit }, /Character id is required/],
      [{ ...base, className: '', classSkills: kit }, /Class name is required/],
      [{ ...base, race: ' ', classSkills: kit }, /Race is required/],
    ];
    for (const [input, pattern] of cases) {
      expect(() => createCharacter(rules, input)).toThrow(pattern);
    }
    expect(() => createCharacter(rules, cases[1]![0])).toThrow(CharacterRuleError);
  });

  it('does not alias its input and survives a JSON round trip', () => {
    const skills = kit.map((s) => ({ ...s }));
    const c = createCharacter(rules, { ...base, classSkills: skills });
    skills[0]!.name = 'Changed';
    expect(c.skills[0]?.name).toBe('Basic Archery');
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe('tracks and grades (DESIGN §2)', () => {
  it('race level equals class level before a profession', () => {
    expect(raceLevel(rules, { classLevel: 12, professionLevel: 0, profession: null })).toBe(12);
  });

  it('race level is the floored average once a profession exists', () => {
    const at = (classLevel: number, professionLevel: number) =>
      raceLevel(rules, { classLevel, professionLevel, profession: 'Alchemist' });
    expect([at(30, 10), at(31, 10), at(10, 31), at(15, 15)]).toEqual([20, 20, 20, 15]);
  });

  it('caps tracks at the top of the current grade: 4/14/49/99/149/199/240', () => {
    expect(rules.grades.map((g) => trackCap(rules, g.id))).toEqual([4, 14, 49, 99, 149, 199, 240]);
    expect(isAtCap(rules, 'G', 3)).toBe(false);
    expect(isAtCap(rules, 'G', 4)).toBe(true);
    expect(isAtCap(rules, 'F', 4)).toBe(false);
    expect(() => trackCap(rules, 'S')).toThrow(/Unknown grade "S"/);
    expect(gradeIndexOf(rules, 'E')).toBe(2);
  });

  it('never caps above the campaign level cap', () => {
    const capped = customRules((r) => (r.campaign.levelCap = 99));
    expect(trackCap(capped, 'A')).toBe(99);
  });

  it('grants professions only from E-grade, starting at the class level, without mutation', () => {
    const f: Character = { ...fresh(), classLevel: 15, grade: 'F' };
    expect(() => grantProfession(rules, f, 'Alchemist')).toThrow(/unlock at E-grade/);
    const before: Character = { ...f, grade: 'E', xp: { class: 40, profession: 0 } };
    const snapshot = JSON.stringify(before);
    const e = grantProfession(rules, before, ' Alchemist ');
    expect([e.profession, e.professionLevel, raceLevel(rules, e), e.xp]).toEqual([
      'Alchemist',
      15,
      15,
      { class: 40, profession: 0 },
    ]);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(() => grantProfession(rules, e, 'Smith')).toThrow(/already/);
    expect(() => grantProfession(rules, before, ' ')).toThrow(/required/);
  });
});

describe('derived pools and display', () => {
  const stats = { ...fresh().stats, vitality: 40, wisdom: 21, endurance: 20 };

  it('derives pools as 10 × Vitality / Wisdom / Endurance', () => {
    expect(['hp', 'mp', 'stamina'].map((p) => poolMax(rules, stats, p))).toEqual([400, 210, 200]);
    expect(() => poolMax(rules, stats, 'luck')).toThrow(/Unknown pool/);
    expect(() => poolMax(rules, { wisdom: 1 }, 'hp')).toThrow(/"vitality" is missing/);
    expect(poolMax(rules, { ...stats, vitality: 12.34 }, 'hp')).toBe(123);
    expect(
      poolMax(
        customRules((r) => (r.pools[0].multiplier = 100)),
        { vitality: 0.29 },
        'hp',
      ),
    ).toBe(29);
  });

  it('clamps current pools to 0..max', () => {
    expect(clampPools(rules, stats, { hp: 999, mp: -5 })).toEqual({ hp: 400, mp: 0, stamina: 200 });
    expect(clampPools(rules, stats, { hp: 12.9, mp: 3, stamina: 7 })).toEqual({
      hp: 12,
      mp: 3,
      stamina: 7,
    });
  });

  it('treats non-finite current pools as full', () => {
    expect(clampPools(rules, stats, { hp: Number.NaN, mp: Infinity })).toEqual({
      hp: 400,
      mp: 210,
      stamina: 200,
    });
  });

  it('formats stats in tenths', () => {
    expect(
      [10, 23, 0, 7, 100, 7324, 1, -15, -0.4, 25.5, 10.05].map((v) => formatStat(rules, v)),
    ).toEqual(['1.0', '2.3', '0.0', '0.7', '10.0', '732.4', '0.1', '-1.5', '0.0', '2.6', '1.0']);
    expect(() => formatStat(rules, Number.NaN)).toThrow(/Cannot display/);
    expect(() => formatStat(rules, Infinity)).toThrow(/Cannot display/);
  });

  it('honours other display settings', () => {
    const whole = customRules((r) => (r.stats.displayDecimals = 0));
    expect(formatStat(whole, 23)).toBe('2');
    const hundredths = customRules((r) => {
      r.stats.displayDivisor = 100;
      r.stats.displayDecimals = 2;
    });
    expect(formatStat(hundredths, 5)).toBe('0.05');
  });
});

describe('starter classes', () => {
  it('each creates a valid G-grade character under the default rules', () => {
    expect(STARTER_CLASSES.length).toBeGreaterThan(0);
    for (const starter of STARTER_CLASSES) {
      const character = createCharacter(rules, {
        id: starter.id,
        name: 'Test',
        className: starter.name,
        classSkills: starter.skills,
        classWeights: starter.weights,
      });
      expect(character.skills.map((s) => s.name)).toEqual(
        expect.arrayContaining(starter.skills.map((s) => s.name)),
      );
      expect(Object.keys(starter.weights).sort()).toEqual(rules.stats.list.map((s) => s.id).sort());
    }
  });
});
