import type { RulesConfig } from '../rules';

/** Bumped when the serialized character shape changes; M1.3 upcasts old states. */
export const CHARACTER_SCHEMA_VERSION = 1;

/** Skill as held by a character (the full skill system arrives in M1.9). */
export interface CharacterSkill {
  readonly name: string;
  readonly rarity: string;
  readonly kind: 'class' | 'profession' | 'race';
  readonly nickname: string | null;
}

/** One level-up's free points (DESIGN §4): assigned once, then locked (M1.5). */
export interface FreePointBatch {
  readonly raceLevel: number;
  readonly points: number;
  readonly allocation: Readonly<Record<string, number>> | null;
  readonly locked: boolean;
}

/** Plain, serializable, immutable character state. */
export interface Character {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly race: string;
  readonly className: string;
  /** null until the profession unlock at the E-grade evolution. */
  readonly profession: string | null;
  readonly classLevel: number;
  readonly professionLevel: number;
  /** Id of the highest grade evolved into (ids survive grade inserts; DESIGN §3). */
  readonly grade: string;
  /** XP held toward the next level per track; beyond the grade cap it banks (M1.4). */
  readonly xp: Readonly<{ class: number; profession: number }>;
  /** Base stat values by stat id (before titles and items, M1.6/M1.7). */
  readonly stats: Readonly<Record<string, number>>;
  /** Current pool values by pool id; maxima are derived. */
  readonly pools: Readonly<Record<string, number>>;
  readonly freePointBatches: readonly FreePointBatch[];
  readonly titles: readonly string[];
  readonly skills: readonly CharacterSkill[];
}

export interface NewCharacter {
  id: string;
  name: string;
  className: string;
  race?: string;
  classSkills: readonly { name: string; rarity: string }[];
}

export class CharacterRuleError extends Error {}

const required = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') throw new CharacterRuleError(`${label} is required`);
  return trimmed;
};

/** Index of a grade id in the rules; throws on unknown ids. */
export function gradeIndexOf(rules: RulesConfig, gradeId: string): number {
  const index = rules.grades.findIndex((g) => g.id === gradeId);
  if (index === -1) throw new CharacterRuleError(`Unknown grade "${gradeId}"`);
  return index;
}

/** Creates a level-0 character in the first grade with full pools and Identify (DESIGN §2). */
export function createCharacter(rules: RulesConfig, input: NewCharacter): Character {
  const id = required(input.id, 'Character id');
  const name = required(input.name, 'Character name');
  const className = required(input.className, 'Class name');
  const needed = rules.skills.startingClassSkillCount;
  if (input.classSkills.length !== needed) {
    throw new CharacterRuleError(
      `A starting class grants exactly ${needed} skills (got ${input.classSkills.length})`,
    );
  }
  const firstGrade = rules.grades[0];
  if (!firstGrade) throw new CharacterRuleError('Rules define no grades');
  const ladder = rules.skills.rarities.map((r) => r.id);
  const ceiling = ladder.indexOf(firstGrade.rarityCeiling);
  const raceSkill = rules.skills.startingRaceSkill;
  const names = new Set<string>([raceSkill.name.toLowerCase()]);
  const classSkills: CharacterSkill[] = input.classSkills.map((skill) => {
    const skillName = required(skill.name, 'Skill name');
    const rank = ladder.indexOf(skill.rarity);
    if (rank === -1 || rank > ceiling) {
      throw new CharacterRuleError(
        `${skillName}: rarity "${skill.rarity}" is not allowed at ${firstGrade.id}-grade (ceiling ${firstGrade.rarityCeiling})`,
      );
    }
    if (names.has(skillName.toLowerCase())) {
      throw new CharacterRuleError(`Duplicate skill "${skillName}"`);
    }
    names.add(skillName.toLowerCase());
    return { name: skillName, rarity: skill.rarity, kind: 'class', nickname: null };
  });

  const stats: Record<string, number> = {};
  for (const stat of rules.stats.list) stats[stat.id] = rules.stats.startingValue;
  const pools: Record<string, number> = {};
  for (const pool of rules.pools) pools[pool.id] = poolMax(rules, stats, pool.id);

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name,
    race: input.race === undefined ? rules.character.defaultRace : required(input.race, 'Race'),
    className,
    profession: null,
    classLevel: 0,
    professionLevel: 0,
    grade: firstGrade.id,
    xp: { class: 0, profession: 0 },
    stats,
    pools,
    freePointBatches: [],
    titles: [],
    skills: [
      ...classSkills,
      { name: raceSkill.name, rarity: raceSkill.rarity, kind: 'race', nickname: null },
    ],
  };
}

/** Race level: class level before a profession, else floor(average) (DESIGN §2). */
export function raceLevel(
  rules: RulesConfig,
  character: Pick<Character, 'classLevel' | 'professionLevel' | 'profession'>,
): number {
  if (character.profession === null) return character.classLevel;
  const average = (character.classLevel + character.professionLevel) / 2;
  switch (rules.tracks.raceLevelRounding) {
    case 'floor':
      return Math.floor(average);
  }
}

/** Highest level any track may reach in the given grade (4, 14, 49, ...). */
export function trackCap(rules: RulesConfig, gradeId: string): number {
  const grade = rules.grades[gradeIndexOf(rules, gradeId)];
  return Math.min(grade?.topLevel ?? 0, rules.campaign.levelCap);
}

/** True when the track is frozen at its grade cap (extra XP banks; DESIGN §2-3). */
export function isAtCap(rules: RulesConfig, gradeId: string, level: number): boolean {
  return level >= trackCap(rules, gradeId);
}

/**
 * Pool maximum = multiplier × stat (DESIGN §2), floored to whole points. Pass
 * effective stats once titles and items exist (M1.6/M1.7).
 */
export function poolMax(
  rules: RulesConfig,
  stats: Readonly<Record<string, number>>,
  poolId: string,
): number {
  const pool = rules.pools.find((p) => p.id === poolId);
  if (!pool) throw new CharacterRuleError(`Unknown pool "${poolId}"`);
  const value = stats[pool.stat];
  if (value === undefined || !Number.isFinite(value)) {
    throw new CharacterRuleError(`Stat "${pool.stat}" is missing or not a number`);
  }
  return Math.floor(pool.multiplier * value);
}

/** Current pools clamped to 0..max for the given stats (after a stat change or heal). */
export function clampPools(
  rules: RulesConfig,
  stats: Readonly<Record<string, number>>,
  pools: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pool of rules.pools) {
    const max = poolMax(rules, stats, pool.id);
    out[pool.id] = Math.min(max, Math.max(0, Math.floor(pools[pool.id] ?? max)));
  }
  return out;
}

/**
 * Display value in tenths: 10 → "1.0", 23 → "2.3" (DESIGN §2). Exact for
 * integer stats; fractional stats round half away from zero.
 */
export function formatStat(rules: RulesConfig, value: number): string {
  if (!Number.isFinite(value)) throw new CharacterRuleError(`Cannot display stat value ${value}`);
  const { displayDivisor, displayDecimals } = rules.stats;
  const scale = 10 ** displayDecimals;
  const scaled = Math.round(Number(((Math.abs(value) * scale) / displayDivisor).toPrecision(12)));
  const whole = Math.floor(scaled / scale);
  const frac = String(scaled % scale).padStart(displayDecimals, '0');
  const sign = value < 0 && scaled !== 0 ? '-' : '';
  return displayDecimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
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
  if (character.profession !== null) {
    throw new CharacterRuleError('Character already has a profession');
  }
  const unlock = gradeIndexOf(rules, rules.tracks.professionUnlockGrade);
  if (gradeIndexOf(rules, character.grade) < unlock) {
    throw new CharacterRuleError(
      `Professions unlock at ${rules.tracks.professionUnlockGrade}-grade`,
    );
  }
  return {
    ...character,
    profession: required(profession, 'Profession name'),
    professionLevel: character.classLevel,
    xp: { ...character.xp, profession: 0 },
  };
}
