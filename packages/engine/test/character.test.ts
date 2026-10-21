import { describe, expect, it } from 'vitest';
import {
  CharacterRuleError,
  createCharacter,
  defaultRules,
  formatStat,
  grantProfession,
  isAtCap,
  poolMax,
  raceLevel,
  trackCap,
  type Character,
} from '../src';

const rules = defaultRules();
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];
const fresh = (): Character =>
  createCharacter(rules, { id: 'c1', name: 'Jake', className: 'Archer', classSkills: kit });

describe('createCharacter', () => {
  it('starts every stat at 10, level 0, G-grade, no profession', () => {
    const c = fresh();
    expect(Object.keys(c.stats)).toHaveLength(9);
    expect(Object.values(c.stats).every((v) => v === 10)).toBe(true);
    expect([c.classLevel, c.professionLevel, c.gradeIndex, c.profession]).toEqual([0, 0, 0, null]);
    expect(c.race).toBe('Human');
  });

  it('adds Identify (Common) as a race skill after the 3 class skills', () => {
    const c = fresh();
    expect(c.skills.map((s) => [s.name, s.rarity, s.kind])).toEqual([
      ['Basic Archery', 'inferior', 'class'],
      ['Basic Stealth', 'inferior', 'class'],
      ['Archer’s Eye', 'common', 'class'],
      ['Identify', 'common', 'race'],
    ]);
  });

  it('starts with full pools: 100 HP / MP / Stamina', () => {
    expect(fresh().pools).toEqual({ hp: 100, mp: 100, stamina: 100 });
  });

  it('rejects a wrong number of class skills, bad rarities and blank names', () => {
    const base = { id: 'c', name: 'X', className: 'Archer' };
    expect(() => createCharacter(rules, { ...base, classSkills: kit.slice(0, 2) })).toThrow(
      /exactly 3 skills \(got 2\)/,
    );
    expect(() =>
      createCharacter(rules, {
        ...base,
        classSkills: [...kit.slice(0, 2), { name: 'God', rarity: 'divine' }],
      }),
    ).toThrow(CharacterRuleError);
    expect(() => createCharacter(rules, { ...base, name: '  ', classSkills: kit })).toThrow(/name/);
  });
});

describe('tracks and grades (DESIGN §2)', () => {
  it('race level equals class level before a profession', () => {
    expect(raceLevel({ classLevel: 12, professionLevel: 0, profession: null })).toBe(12);
  });

  it('race level is the floored average once a profession exists', () => {
    expect(raceLevel({ classLevel: 30, professionLevel: 10, profession: 'Alchemist' })).toBe(20);
    expect(raceLevel({ classLevel: 31, professionLevel: 10, profession: 'Alchemist' })).toBe(20);
  });

  it('caps tracks at the top of the current grade: 4/14/49/99/149/199/240', () => {
    expect(rules.grades.map((_, i) => trackCap(rules, i))).toEqual([4, 14, 49, 99, 149, 199, 240]);
    expect(isAtCap(rules, 0, 3)).toBe(false);
    expect(isAtCap(rules, 0, 4)).toBe(true);
    expect(isAtCap(rules, 1, 4)).toBe(false);
    expect(() => trackCap(rules, 7)).toThrow(/Unknown grade/);
  });

  it('never caps above the campaign level cap', () => {
    const capped = { ...rules, campaign: { ...rules.campaign, levelCap: 99 } };
    expect(trackCap(capped, 6)).toBe(99);
  });

  it('grants professions only from E-grade, starting at the class level', () => {
    const c = { ...fresh(), classLevel: 15, gradeIndex: 1 };
    expect(() => grantProfession(rules, c, 'Alchemist')).toThrow(/unlock at E-grade/);
    const e = grantProfession(rules, { ...c, gradeIndex: 2 }, ' Alchemist ');
    expect([e.profession, e.professionLevel, raceLevel(e)]).toEqual(['Alchemist', 15, 15]);
    expect(() => grantProfession(rules, e, 'Smith')).toThrow(/already/);
    expect(() => grantProfession(rules, { ...c, gradeIndex: 2 }, ' ')).toThrow(/required/);
  });
});

describe('derived pools and display', () => {
  it('derives pools as 10 × Vitality / Wisdom / Endurance', () => {
    const stats = { ...fresh().stats, vitality: 40, wisdom: 21, endurance: 20 };
    expect([
      poolMax(rules, stats, 'hp'),
      poolMax(rules, stats, 'mp'),
      poolMax(rules, stats, 'stamina'),
    ]).toEqual([400, 210, 200]);
    expect(() => poolMax(rules, stats, 'luck')).toThrow(/Unknown pool/);
  });

  it('formats stats in tenths', () => {
    expect([10, 23, 0, 7, 100, 7324, 1, -15].map((v) => formatStat(rules, v))).toEqual([
      '1.0',
      '2.3',
      '0.0',
      '0.7',
      '10.0',
      '732.4',
      '0.1',
      '-1.5',
    ]);
  });

  it('honours other display settings', () => {
    const whole = { ...rules, stats: { ...rules.stats, displayDecimals: 0 } };
    expect(formatStat(whole, 23)).toBe('2');
    const hundredths = {
      ...rules,
      stats: { ...rules.stats, displayDivisor: 100, displayDecimals: 2 },
    };
    expect(formatStat(hundredths, 5)).toBe('0.05');
  });
});
