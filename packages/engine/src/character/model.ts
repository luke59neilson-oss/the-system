import type { PendingEvolution, SelectionRecord } from '../evolution/model';
import type { GradeRules, RulesConfig } from '../rules';

/** Bumped when the serialized character shape changes; M1.3 upcasts old states. */
export const CHARACTER_SCHEMA_VERSION = 7;

/** Skill as held by a character (the full skill system arrives in M1.9). */
export interface CharacterSkill {
  readonly name: string;
  readonly rarity: string;
  readonly kind: 'class' | 'profession' | 'race';
  readonly nickname: string | null;
  /** One-of-a-kind skill (DESIGN §6 "Unique is a tag"). */
  readonly unique: boolean;
  /** Mastery marks toward the next upgrade (banked at the grade ceiling; M1.9). */
  readonly marks: number;
  /** Sessions this skill earned a mark in (DESIGN §6: one per skill per session). */
  readonly markSessions: readonly string[];
  /** What the skill does, in the System's words (M3.5); null until the GM writes one. */
  readonly description: string | null;
  /** Flavour text shown under the description (M3.5); null for none. */
  readonly flavor: string | null;
  /**
   * The GM wrote this copy's text by hand (MQ.12): library edits no longer
   * reach it. Absent = false, so stored states keep their shape.
   */
  readonly textEdited?: true;
  /**
   * The rarity whose library entry this copy's text and effects follow, when
   * an evolution re-rated the skill (MR.1, DESIGN §6: same power, new label).
   * Absent = its own rarity; an upgrade or transform clears it.
   */
  readonly textRarity?: string;
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
  /**
   * Professions the GM has offered this character (MQ.6, DESIGN §2), in offer
   * order. They stay listed after one is taken; the list then locks.
   */
  readonly professionOffers: readonly string[];
  readonly classLevel: number;
  readonly professionLevel: number;
  /** Id of the highest grade evolved into (ids survive grade inserts; DESIGN §3). */
  readonly grade: string;
  /** XP held toward the next level per track; beyond the grade cap it banks (M1.4). */
  readonly xp: Readonly<{ class: number; profession: number }>;
  /** Class stat weights by stat id (integers); class spread follows them (DESIGN §4). */
  readonly classWeights: Readonly<Record<string, number>>;
  /** Class spread points received so far per stat; drives the cumulative split (M1.4). */
  readonly classSpreadTotals: Readonly<Record<string, number>>;
  /** Base stat values by stat id (before titles and items, M1.6/M1.7). */
  readonly stats: Readonly<Record<string, number>>;
  /** Current pool values by pool id; maxima are derived. */
  readonly pools: Readonly<Record<string, number>>;
  readonly freePointBatches: readonly FreePointBatch[];
  readonly titles: readonly string[];
  readonly skills: readonly CharacterSkill[];
  /** Merges done per grade id (DESIGN §6: max one per character per grade; M1.9). */
  readonly merges: Readonly<Record<string, number>>;
  /** Selection menus offered by class level, with the pick once chosen (M1.10). */
  readonly selections: readonly SelectionRecord[];
  /** Evolution the GM has released and the player has not chosen yet (M1.10). */
  readonly evolution: PendingEvolution | null;
  /**
   * Portrait image file name (`<sha256>.<ext>`, PORTRAIT_REF) the server keeps
   * beside the campaign, or null for the monogram (M4.4).
   */
  readonly portrait: string | null;
  /**
   * MQ.15 (L7): pool ids a falling maximum clamped while they were not full.
   * Such a pool is at its maximum but does not count as full, so a rising
   * maximum leaves it where it is. Absent when empty (older states unchanged).
   */
  readonly clampedPools?: readonly string[];
}

/** A stored portrait: the SHA-256 of the image bytes and its extension (M4.4). */
export const PORTRAIT_REF = /^[0-9a-f]{64}\.(png|jpg|webp)$/;

export interface NewCharacter {
  id: string;
  name: string;
  className: string;
  race?: string | undefined;
  classSkills: readonly SkillGrant[];
  /** Stat weights of the starting class; equal weights when omitted. */
  classWeights?: Readonly<Record<string, number>> | undefined;
  /** Portrait file name (PORTRAIT_REF); none when omitted. */
  portrait?: string | null | undefined;
}

/** A skill as granted at creation: name and rarity, with optional System text (M3.5). */
export interface SkillGrant {
  readonly name: string;
  readonly rarity: string;
  readonly description?: string | undefined;
  readonly flavor?: string | undefined;
}

export class CharacterRuleError extends Error {}

/** Trimmed text, or null when absent or blank. */
export const textOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** A freshly granted skill: no nickname, not unique, no marks. */
export const newSkill = (
  name: string,
  rarity: string,
  kind: CharacterSkill['kind'],
  text: { description?: string | null | undefined; flavor?: string | null | undefined } = {},
): CharacterSkill => ({
  name,
  rarity,
  kind,
  nickname: null,
  unique: false,
  marks: 0,
  markSessions: [],
  description: textOrNull(text.description),
  flavor: textOrNull(text.flavor),
});

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
    return newSkill(skillName, skill.rarity, 'class', skill);
  });

  const statIds = rules.stats.list.map((s) => s.id);
  const classWeights: Record<string, number> = {};
  for (const statId of statIds) classWeights[statId] = input.classWeights ? 0 : 1;
  if (input.classWeights) {
    for (const [statId, weight] of Object.entries(input.classWeights)) {
      if (!statIds.includes(statId))
        throw new CharacterRuleError(`Unknown stat "${statId}" in class weights`);
      if (!Number.isInteger(weight) || weight < 0 || weight > 1000) {
        // Same bound as progression MAX_WEIGHT.
        throw new CharacterRuleError(
          `Class weight for ${statId} must be a whole number from 0 to 1000`,
        );
      }
      classWeights[statId] = weight;
    }
    if (Object.values(classWeights).every((w) => w === 0)) {
      throw new CharacterRuleError('Class weights must give at least one stat a weight above 0');
    }
  }
  const classSpreadTotals: Record<string, number> = {};
  for (const statId of statIds) classSpreadTotals[statId] = 0;

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
    professionOffers: [],
    classLevel: 0,
    professionLevel: 0,
    grade: firstGrade.id,
    xp: { class: 0, profession: 0 },
    classWeights,
    classSpreadTotals,
    stats,
    pools,
    freePointBatches: [],
    titles: [],
    skills: [...classSkills, newSkill(raceSkill.name, raceSkill.rarity, 'race')],
    merges: {},
    selections: [],
    evolution: null,
    portrait: input.portrait ?? null,
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
    default:
      throw new CharacterRuleError(
        `Unknown race level rounding "${String(rules.tracks.raceLevelRounding)}"`,
      );
  }
}

/** Highest level any track may reach in the given grade (4, 14, 49, ...). */
export function trackCap(rules: RulesConfig, gradeId: string): number {
  const grade = rules.grades[gradeIndexOf(rules, gradeId)];
  return Math.min((grade as GradeRules).topLevel, rules.campaign.levelCap);
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
  // Round away float noise (0.29 × 100 = 28.999…) before flooring.
  return Math.floor(Number((pool.multiplier * value).toFixed(9)));
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
    const current = pools[pool.id];
    const value = current === undefined || !Number.isFinite(current) ? max : Math.floor(current);
    out[pool.id] = Math.min(max, Math.max(0, value));
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

/**
 * The player takes one of their offered professions later (MQ.6, DESIGN §2):
 * only a profession the GM offered, only while the character has none. It
 * starts at the current class level like any granted profession.
 */
export function takeOfferedProfession(
  rules: RulesConfig,
  character: Character,
  profession: string,
): Character {
  if (character.profession !== null) {
    throw new CharacterRuleError(
      `${character.name} already has the profession [${character.profession}]`,
    );
  }
  if (!character.professionOffers.includes(profession)) {
    throw new CharacterRuleError(`"${profession}" is not one of your offered professions`);
  }
  return grantProfession(rules, character, profession);
}
