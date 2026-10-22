import {
  CharacterRuleError,
  gradeIndexOf,
  isAtCap,
  raceLevel,
  type Character,
  type FreePointBatch,
} from '../character';
import type { GradeRules, RulesConfig } from '../rules';

/** XP tracks the GM awards to (DESIGN §5); race level is derived. */
export type XpTrack = 'class' | 'profession';

const isWhole = (n: number) => Number.isInteger(n) && n >= 0;

/** Largest split weight; keeps amount × weight exact in doubles (amounts are ≤ 1e8). */
export const MAX_WEIGHT = 1000;

/**
 * Splits an integer amount by integer weights with the largest-remainder
 * method: the parts always sum to `amount`. Ties go to the earlier entry.
 */
export function largestRemainderSplit(amount: number, weights: readonly number[]): number[] {
  if (!isWhole(amount)) throw new CharacterRuleError('Amount must be a whole number ≥ 0');
  if (weights.length === 0) throw new CharacterRuleError('Nothing to split between');
  if (!weights.every((w) => isWhole(w) && w <= MAX_WEIGHT)) {
    throw new CharacterRuleError(`Weights must be whole numbers from 0 to ${MAX_WEIGHT}`);
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) throw new CharacterRuleError('At least one weight must be above 0');
  const parts = weights.map((w) => Math.floor((amount * w) / total));
  const remainders = weights.map((w, i) => ({ i, r: (amount * w) % total }));
  let left = amount - parts.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (left === 0) break;
    parts[i] = (parts[i] as number) + 1;
    left--;
  }
  return parts;
}

/**
 * Replaces a character's class weights (evolution reshape, M1.10) and resets
 * the spread totals, so the new weights govern from here on instead of
 * paying back the old weights' history (D35).
 */
export function reshapeClassWeights(
  rules: RulesConfig,
  character: Character,
  weights: Readonly<Record<string, number>>,
): Character {
  const ids = rules.stats.list.map((s) => s.id);
  const next: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const id of ids) {
    next[id] = 0;
    totals[id] = 0;
  }
  for (const [id, w] of Object.entries(weights)) {
    if (!ids.includes(id)) throw new CharacterRuleError(`Unknown stat "${id}" in class weights`);
    if (!isWhole(w) || w > MAX_WEIGHT) {
      throw new CharacterRuleError(
        `Class weight for ${id} must be a whole number from 0 to ${MAX_WEIGHT}`,
      );
    }
    next[id] = w;
  }
  if (Object.values(next).every((w) => w === 0)) {
    throw new CharacterRuleError('Class weights must give at least one stat a weight above 0');
  }
  return { ...character, classWeights: next, classSpreadTotals: totals };
}

/**
 * Distributes `points` class-spread points by the class weights, cumulatively
 * (a "highest deficit" method, not per-level largest remainder; D35):
 * each point goes to the stat furthest below its weighted share of all spread
 * so far (ties to stat order). The level's points sum exactly, and over many
 * levels every stat stays within about one point of its exact share, so equal
 * weights don't always favour the first stats.
 */
export function classSpread(
  weights: Readonly<Record<string, number>>,
  totals: Readonly<Record<string, number>>,
  statOrder: readonly string[],
  points: number,
): Record<string, number> {
  if (!isWhole(points)) throw new CharacterRuleError('Spread points must be a whole number ≥ 0');
  const w = statOrder.map((id) => weights[id] ?? 0);
  const weightSum = w.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new CharacterRuleError('Class weights are all zero');
  const have = statOrder.map((id) => totals[id] ?? 0);
  let given = have.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const id of statOrder) out[id] = 0;
  for (let p = 0; p < points; p++) {
    given++;
    let best = -1;
    let bestDeficit = -Infinity;
    for (let i = 0; i < statOrder.length; i++) {
      const weight = w[i] as number;
      if (weight === 0) continue;
      // Integer deficit: weight × total − allocated × weightSum.
      const deficit = weight * given - (have[i] as number) * weightSum;
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = i;
      }
    }
    have[best] = (have[best] as number) + 1;
    const id = statOrder[best] as string;
    out[id] = (out[id] as number) + 1;
  }
  return out;
}

/** Grade rules for a character's current grade. */
export function currentGrade(rules: RulesConfig, character: Pick<Character, 'grade'>): GradeRules {
  return rules.grades[gradeIndexOf(rules, character.grade)] as GradeRules;
}

/** XP needed for one level, by the character's current grade (DESIGN §5). */
export function xpPerLevel(rules: RulesConfig, character: Pick<Character, 'grade'>): number {
  return currentGrade(rules, character).xpPerLevel;
}

/**
 * Above-level bonus fraction (DESIGN §5): per level the enemy is above the
 * character's race level, capped. 0 when the enemy is not above.
 */
export function aboveLevelBonus(
  rules: RulesConfig,
  characterLevel: number,
  enemyLevel: number,
): number {
  const diff = Math.max(0, enemyLevel - characterLevel);
  const { aboveLevelBonusPerLevel, aboveLevelBonusCap } = rules.xp;
  return Math.min(aboveLevelBonusCap, Number((aboveLevelBonusPerLevel * diff).toFixed(9)));
}

/**
 * XP factor for a target `enemyGrade` (DESIGN §5, MQ.10): 1 at the
 * character's grade or above; one grade below the first `gradeBelowFactors`
 * entry (⅓ by default), further below the next ones, the last entry for any
 * larger gap (0 by default). Unknown grades are refused.
 */
export function gradeGapXpFactor(
  rules: RulesConfig,
  characterGrade: string,
  enemyGrade: string | null | undefined,
): number {
  if (enemyGrade === null || enemyGrade === undefined) return 1;
  const enemy = rules.grades.findIndex((g) => g.id === enemyGrade);
  if (enemy < 0) throw new CharacterRuleError(`Unknown grade "${enemyGrade}"`);
  const gap = gradeIndexOf(rules, characterGrade) - enemy;
  const factors = rules.xp.gradeBelowFactors;
  if (gap <= 0 || factors.length === 0) return 1;
  return factors[Math.min(gap, factors.length) - 1] as number;
}

/**
 * The XP a share is worth to one character (DESIGN §5): the share scaled by
 * the grade-gap factor (floored), plus the above-level bonus on that.
 */
export function shareXp(
  rules: RulesConfig,
  character: Character,
  share: number,
  enemyLevel: number | null | undefined,
  enemyGrade?: string | null,
): number {
  const factor = gradeGapXpFactor(rules, character.grade, enemyGrade);
  const scaled = factor === 1 ? share : Math.floor(Number((share * factor).toFixed(9)));
  return scaled + shareBonus(rules, character, scaled, enemyLevel);
}

/** XP a typical session awards at a grade ("typical session ≈ 6 levels", DESIGN §5). */
export function typicalSessionXp(rules: RulesConfig, gradeId: string): number {
  const grade = rules.grades[gradeIndexOf(rules, gradeId)] as GradeRules;
  return rules.campaign.typicalLevelsPerSession * grade.xpPerLevel;
}

/** Whole above-level bonus XP on top of a share (floored, float noise removed). */
export function shareBonus(
  rules: RulesConfig,
  character: Character,
  share: number,
  enemyLevel: number | null | undefined,
): number {
  if (enemyLevel === null || enemyLevel === undefined) return 0;
  const fraction = aboveLevelBonus(rules, raceLevel(rules, character), enemyLevel);
  return Math.floor(Number((share * fraction).toFixed(9)));
}

export interface XpShare {
  readonly characterId: string;
  /** Part of the award (shares sum to the award). */
  readonly share: number;
  /** Above-level bonus on top of the share (whole XP, floored). */
  readonly bonus: number;
  /** XP the character gains: the share after the grade-gap factor, plus the bonus. */
  readonly gained: number;
}

export interface SplitInput {
  amount: number;
  /** Participants in order; weights default to an even split. */
  participants: readonly { characterId: string; weight?: number | undefined }[];
  /** Enemy level for the optional above-level bonus; omit for none. */
  enemyLevel?: number | undefined;
  /** Enemy grade for the grade-gap factor (MQ.10); omit for none. */
  enemyGrade?: string | undefined;
}

/**
 * Splits an XP award between participants (largest remainder; the shares
 * always sum to the award) and adds each one's above-level bonus.
 */
export function splitXp(
  rules: RulesConfig,
  characters: Readonly<Record<string, Character>>,
  input: SplitInput,
): XpShare[] {
  const ids = input.participants.map((p) => p.characterId);
  if (new Set(ids).size !== ids.length)
    throw new CharacterRuleError('A participant is listed twice');
  const weights = input.participants.map((p) => p.weight ?? 1);
  const shares = largestRemainderSplit(input.amount, weights);
  return input.participants.map((p, i) => {
    const character = Object.prototype.hasOwnProperty.call(characters, p.characterId)
      ? characters[p.characterId]
      : undefined;
    if (!character) throw new CharacterRuleError(`Unknown character "${p.characterId}"`);
    const share = shares[i] as number;
    const gained = shareXp(rules, character, share, input.enemyLevel, input.enemyGrade);
    const factor = gradeGapXpFactor(rules, character.grade, input.enemyGrade);
    const scaled = factor === 1 ? share : Math.floor(Number((share * factor).toFixed(9)));
    return { characterId: p.characterId, share, bonus: gained - scaled, gained };
  });
}

export interface LevelUp {
  readonly track: XpTrack | 'race';
  readonly level: number;
}

export interface XpResult {
  readonly character: Character;
  readonly levelUps: readonly LevelUp[];
}

/**
 * Adds XP to a track and applies every level it pays for at the current
 * grade's curve. Class levels grant the class spread; each new race level
 * grants an unlocked free-point batch. At the grade cap, XP banks; call with
 * 0 after an evolution to spend the bank (DESIGN §2–§5).
 */
export function gainXp(
  rules: RulesConfig,
  character: Character,
  track: XpTrack,
  amount: number,
): XpResult {
  if (!isWhole(amount)) throw new CharacterRuleError('XP must be a whole number ≥ 0');
  if (track === 'profession' && character.profession === null) {
    throw new CharacterRuleError(`${character.name} has no profession`);
  }
  const grade = currentGrade(rules, character);
  const statOrder = rules.stats.list.map((s) => s.id);
  let xp = character.xp[track] + amount;
  let classLevel = character.classLevel;
  let professionLevel = character.professionLevel;
  const stats = { ...character.stats };
  const totals = { ...character.classSpreadTotals };
  const levelUps: LevelUp[] = [];
  const batches: FreePointBatch[] = [...character.freePointBatches];
  let race = raceLevel(rules, character);

  for (;;) {
    const level = track === 'class' ? classLevel : professionLevel;
    if (isAtCap(rules, character.grade, level) || xp < grade.xpPerLevel) break;
    xp -= grade.xpPerLevel;
    if (track === 'class') {
      classLevel++;
      levelUps.push({ track, level: classLevel });
      const spread = classSpread(
        character.classWeights,
        totals,
        statOrder,
        grade.classSpreadPerLevel,
      );
      for (const [id, points] of Object.entries(spread)) {
        stats[id] = (stats[id] ?? 0) + points;
        totals[id] = (totals[id] ?? 0) + points;
      }
    } else {
      professionLevel++;
      levelUps.push({ track, level: professionLevel });
    }
    const newRace = raceLevel(rules, {
      classLevel,
      professionLevel,
      profession: character.profession,
    });
    for (let r = race + 1; r <= newRace; r++) {
      levelUps.push({ track: 'race', level: r });
      batches.push({
        raceLevel: r,
        points: grade.freePointsPerRaceLevel,
        allocation: null,
        locked: false,
      });
    }
    race = Math.max(race, newRace);
  }

  return {
    character: {
      ...character,
      classLevel,
      professionLevel,
      xp: { ...character.xp, [track]: xp },
      stats,
      classSpreadTotals: totals,
      freePointBatches: batches,
    },
    levelUps,
  };
}

export interface AwardResult extends XpResult {
  /** XP that went to the other track because this one was at the grade's top (MQ.11). */
  readonly overflowed: number;
  /** XP with nowhere to go: both tracks at the top, or the class with no profession. */
  readonly lost: number;
}

/**
 * Applies awarded XP (MQ.11, DESIGN §2 "No banked XP; XP overflows"). With
 * `rules.xp.overflow` on, XP a track cannot use because it is at the grade's
 * top goes to the other track, and whatever neither can use is lost; nothing
 * is held. With it off (rules stored before MQ.11) XP banks at the top as
 * before, so older logs replay unchanged.
 */
export function awardXp(
  rules: RulesConfig,
  character: Character,
  track: XpTrack,
  amount: number,
): AwardResult {
  if (!rules.xp.overflow)
    return { ...gainXp(rules, character, track, amount), overflowed: 0, lost: 0 };
  const first = gainXp(rules, character, track, amount);
  let next = first.character;
  const levelUps = [...first.levelUps];
  const trackLevel = (c: Character, t: XpTrack) =>
    t === 'class' ? c.classLevel : c.professionLevel;
  let left = 0;
  if (isAtCap(rules, next.grade, trackLevel(next, track))) {
    left = next.xp[track];
    next = { ...next, xp: { ...next.xp, [track]: 0 } };
  }
  const other: XpTrack = track === 'class' ? 'profession' : 'class';
  let overflowed = 0;
  if (left > 0 && (other === 'class' || next.profession !== null)) {
    if (!isAtCap(rules, next.grade, trackLevel(next, other))) {
      overflowed = left;
      const second = gainXp(rules, next, other, left);
      next = second.character;
      levelUps.push(...second.levelUps);
      left = 0;
      if (isAtCap(rules, next.grade, trackLevel(next, other))) {
        left = next.xp[other];
        overflowed -= left;
        next = { ...next, xp: { ...next.xp, [other]: 0 } };
      }
    }
  }
  return { character: next, levelUps, overflowed, lost: left };
}

/** One participant's outcome in the GM's award preview (MQ.11). */
export interface XpPreview extends XpShare {
  readonly overflowed: number;
  readonly lost: number;
  readonly levelUps: readonly LevelUp[];
}

/**
 * What an award would do before the GM confirms it (MQ.11): each
 * participant's gain, what overflows to the other track and what is lost.
 */
export function previewXpAward(
  rules: RulesConfig,
  characters: Readonly<Record<string, Character>>,
  track: XpTrack,
  input: SplitInput,
): XpPreview[] {
  return splitXp(rules, characters, input).map((s) => {
    const character = characters[s.characterId] as Character;
    const r = awardXp(rules, character, track, s.gained);
    return { ...s, overflowed: r.overflowed, lost: r.lost, levelUps: r.levelUps };
  });
}

/** XP needed for `levels` more levels on a track at the current grade (the GM's pacing helper). */
export function xpForLevels(
  rules: RulesConfig,
  character: Character,
  track: XpTrack,
  levels: number,
): number {
  if (!isWhole(levels)) throw new CharacterRuleError('Levels must be a whole number ≥ 0');
  return Math.max(0, levels * xpPerLevel(rules, character) - character.xp[track]);
}

/** Sum of base stats plus unassigned free points: the DESIGN §4 check-value total. */
export function statBudgetTotal(character: Character): number {
  const stats = Object.values(character.stats).reduce((a, b) => a + b, 0);
  const unassigned = character.freePointBatches
    .filter((b) => b.allocation === null)
    .reduce((a, b) => a + b.points, 0);
  return stats + unassigned;
}
