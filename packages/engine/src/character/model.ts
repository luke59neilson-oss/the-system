import type { RulesConfig } from '../rules';

/** Skill as held by a character (the full skill system arrives in M1.9). */
export interface CharacterSkill {
  name: string;
  rarity: string;
  kind: 'class' | 'profession' | 'race';
  nickname: string | null;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  className: string;
  /** null until the profession unlock at the E-grade evolution. */
  profession: string | null;
  classLevel: number;
  professionLevel: number;
  /** Index into rules.grades of the highest grade evolved into. */
  gradeIndex: number;
  /** Base stat values by stat id (before titles and items, M1.6/M1.7). */
  stats: Record<string, number>;
  /** Current pool values by pool id; maxima are derived. */
  pools: Record<string, number>;
  skills: CharacterSkill[];
}

export interface NewCharacter {
  id: string;
  name: string;
  className: string;
  race?: string;
  classSkills: readonly { name: string; rarity: string }[];
}

export class CharacterRuleError extends Error {}

/** Creates a level-0, G-grade character with full pools and Identify (DESIGN §2). */
export function createCharacter(rules: RulesConfig, input: NewCharacter): Character {
  if (input.name.trim() === '') throw new CharacterRuleError('Character name is required');
  const needed = rules.skills.startingClassSkillCount;
  if (input.classSkills.length !== needed) {
    throw new CharacterRuleError(
      `A starting class grants exactly ${needed} skills (got ${input.classSkills.length})`,
    );
  }
  const grantable = rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);
  for (const skill of input.classSkills) {
    if (!grantable.includes(skill.rarity)) {
      throw new CharacterRuleError(
        `Unknown or reserved rarity "${skill.rarity}" for ${skill.name}`,
      );
    }
  }
  const stats: Record<string, number> = {};
  for (const stat of rules.stats.list) stats[stat.id] = rules.stats.startingValue;

  const character: Character = {
    id: input.id,
    name: input.name.trim(),
    race: input.race ?? 'Human',
    className: input.className,
    profession: null,
    classLevel: 0,
    professionLevel: 0,
    gradeIndex: 0,
    stats,
    pools: {},
    skills: [
      ...input.classSkills.map((s) => ({
        name: s.name,
        rarity: s.rarity,
        kind: 'class' as const,
        nickname: null,
      })),
      {
        name: rules.skills.startingRaceSkill.name,
        rarity: rules.skills.startingRaceSkill.rarity,
        kind: 'race',
        nickname: null,
      },
    ],
  };
  for (const pool of rules.pools)
    character.pools[pool.id] = poolMax(rules, character.stats, pool.id);
  return character;
}

/** Race level: class level before a profession, else floor(average) (DESIGN §2). */
export function raceLevel(
  character: Pick<Character, 'classLevel' | 'professionLevel' | 'profession'>,
): number {
  if (character.profession === null) return character.classLevel;
  return Math.floor((character.classLevel + character.professionLevel) / 2);
}

/** Highest level any track may reach in the character's current grade (4, 14, 49, ...). */
export function trackCap(rules: RulesConfig, gradeIndex: number): number {
  const grade = rules.grades[gradeIndex];
  if (!grade) throw new CharacterRuleError(`Unknown grade index ${gradeIndex}`);
  return Math.min(grade.topLevel, rules.campaign.levelCap);
}

/** True when the track is frozen at its grade cap (extra XP banks; DESIGN §2-3). */
export function isAtCap(rules: RulesConfig, gradeIndex: number, level: number): boolean {
  return level >= trackCap(rules, gradeIndex);
}

/** Pool maximum = multiplier × stat (DESIGN §2). */
export function poolMax(
  rules: RulesConfig,
  stats: Readonly<Record<string, number>>,
  poolId: string,
): number {
  const pool = rules.pools.find((p) => p.id === poolId);
  if (!pool) throw new CharacterRuleError(`Unknown pool "${poolId}"`);
  return pool.multiplier * (stats[pool.stat] ?? 0);
}

/** Display value in tenths: 10 → "1.0", 23 → "2.3" (DESIGN §2). Exact for integers. */
export function formatStat(rules: RulesConfig, value: number): string {
  const { displayDivisor, displayDecimals } = rules.stats;
  const scale = 10 ** displayDecimals;
  const scaled = Math.round((Math.abs(value) * scale) / displayDivisor);
  const whole = Math.floor(scaled / scale);
  const frac = String(scaled % scale).padStart(displayDecimals, '0');
  const sign = value < 0 && scaled !== 0 ? '-' : '';
  return displayDecimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
}

/** Index of the grade at which professions unlock. */
export function professionUnlockIndex(rules: RulesConfig): number {
  return rules.grades.findIndex((g) => g.id === rules.tracks.professionUnlockGrade);
}

/**
 * Grants a profession. Allowed from the unlock grade on; the profession starts
 * at the current class level ("the System credits what it already saw").
 */
export function grantProfession(
  rules: RulesConfig,
  character: Character,
  profession: string,
): Character {
  if (character.profession !== null)
    throw new CharacterRuleError('Character already has a profession');
  if (character.gradeIndex < professionUnlockIndex(rules)) {
    throw new CharacterRuleError(
      `Professions unlock at ${rules.tracks.professionUnlockGrade}-grade`,
    );
  }
  if (profession.trim() === '') throw new CharacterRuleError('Profession name is required');
  return { ...character, profession: profession.trim(), professionLevel: character.classLevel };
}
