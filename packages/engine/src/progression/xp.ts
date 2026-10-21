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

/**
 * Splits an integer amount by integer weights with the largest-remainder
 * method: the parts always sum to `amount`. Ties go to the earlier entry.
 */
export function largestRemainderSplit(amount: number, weights: readonly number[]): number[] {
  if (!isWhole(amount)) throw new CharacterRuleError('Amount must be a whole number ≥ 0');
  if (weights.length === 0) throw new CharacterRuleError('Nothing to split between');
  if (!weights.every(isWhole)) throw new CharacterRuleError('Weights must be whole numbers ≥ 0');
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
 * Distributes `points` class-spread points by the class weights, cumulatively:
 * each point goes to the stat furthest below its weighted share of all spread
 * so far (ties to stat order). The level's points sum exactly, and over many
 * levels every stat stays within one point of its exact share, so equal
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

export interface XpShare {
  readonly characterId: string;
  /** Part of the award (shares sum to the award). */
  readonly share: number;
  /** Above-level bonus on top of the share (whole XP, floored). */
  readonly bonus: number;
}

export interface SplitInput {
  amount: number;
  /** Participants in order; weights default to an even split. */
  participants: readonly { characterId: string; weight?: number | undefined }[];
  /** Enemy level for the optional above-level bonus; omit for none. */
  enemyLevel?: number | undefined;
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
    const fraction =
      input.enemyLevel === undefined
        ? 0
        : aboveLevelBonus(rules, raceLevel(rules, character), input.enemyLevel);
    return {
      characterId: p.characterId,
      share,
      bonus: Math.floor(Number((share * fraction).toFixed(9))),
    };
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
