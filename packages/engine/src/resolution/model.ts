import { CharacterRuleError, gradeIndexOf } from '../character';
import type { GradeRules, RulesConfig } from '../rules';

/**
 * Resolution and progress clocks (ROADMAP M1.11, DESIGN §7). Pure; the RNG is
 * injected (a function returning a number in [0, 1)).
 *
 * Contest: chance = yours ÷ (yours + theirs), after the grade-gap mode
 * (config `resolution.gradeGapMode`): "none" uses the values as they are;
 * "multiplier" multiplies each side by its grade's `gradeGapMultiplier`
 * (G×1, F×3, E×5, D×10, C×20, B×40, A×80); "lowerGradeFraction" multiplies
 * the lower-grade side by `resolution.lowerGradeFraction` (⅓) when the grades
 * differ; "gradeWalls" (the default, MQ.5, D115) treats a higher grade as a
 * different order of being: same grade plain odds, one grade apart the lower
 * side ×⅓, two or more apart no roll (the higher grade succeeds).
 */

export type GradeGapMode = RulesConfig['resolution']['gradeGapMode'];

/** One side of a contest: a stat value (in stat units, e.g. 23 = 2.3) and its grade id. */
export interface ContestSide {
  readonly value: number;
  readonly grade: string;
}

export interface ContestResult {
  /** Adjusted values after the grade-gap mode. */
  readonly yours: number;
  readonly theirs: number;
  /** Chance the first side wins, 0..1. */
  readonly chance: number;
  /** The roll drawn, 0..1 (wins when below `chance`); null when a grade wall decides it unrolled. */
  readonly roll: number | null;
  /** True when a grade wall settled it with no roll (two or more grades apart). */
  readonly walled: boolean;
  readonly success: boolean;
}

/** Grade steps from `a` up to `b` (negative when `a` is the higher grade). */
export function gradeGap(rules: RulesConfig, a: string, b: string): number {
  return gradeIndexOf(rules, b) - gradeIndexOf(rules, a);
}

/**
 * True when a grade wall settles the contest with no roll ("gradeWalls" mode,
 * DESIGN §7): the sides are two or more grades apart.
 */
export function walled(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): boolean {
  return mode === 'gradeWalls' && Math.abs(gradeGap(rules, a.grade, b.grade)) >= 2;
}

const grade = (rules: RulesConfig, id: string): GradeRules =>
  rules.grades[gradeIndexOf(rules, id)] as GradeRules;

function checkSide(side: ContestSide, label: string): void {
  if (!Number.isFinite(side.value) || side.value < 0) {
    throw new CharacterRuleError(`${label} must be a number ≥ 0 (got ${side.value})`);
  }
}

/** The two values after the grade-gap mode. */
export function adjustedValues(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): [number, number] {
  checkSide(a, 'Your value');
  checkSide(b, 'Their value');
  const ga = gradeIndexOf(rules, a.grade);
  const gb = gradeIndexOf(rules, b.grade);
  switch (mode) {
    case 'none':
      return [a.value, b.value];
    case 'multiplier':
      return [
        a.value * grade(rules, a.grade).gradeGapMultiplier,
        b.value * grade(rules, b.grade).gradeGapMultiplier,
      ];
    case 'lowerGradeFraction': {
      const f = rules.resolution.lowerGradeFraction;
      if (ga === gb) return [a.value, b.value];
      return ga < gb ? [a.value * f, b.value] : [a.value, b.value * f];
    }
    case 'gradeWalls': {
      // One grade apart: the lower side ×⅓. Two or more: the lower side
      // counts for nothing (and the contest is not rolled, see `walled`).
      const gap = gb - ga;
      if (gap === 0) return [a.value, b.value];
      const f = Math.abs(gap) === 1 ? rules.resolution.lowerGradeFraction : 0;
      return gap > 0 ? [a.value * f, b.value] : [a.value, b.value * f];
    }
    default:
      throw new CharacterRuleError(`Unknown grade-gap mode "${String(mode)}"`);
  }
}

/** Chance the first side wins: yours ÷ (yours + theirs); an even 0.5 when both are 0. */
export function contestChance(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): number {
  const [yours, theirs] = adjustedValues(rules, a, b, mode);
  if (walled(rules, a, b, mode)) return gradeGap(rules, a.grade, b.grade) < 0 ? 1 : 0;
  const total = yours + theirs;
  return total === 0 ? 0.5 : yours / total;
}

/** Rolls a contest with the injected RNG: success when the roll is below the chance. */
export function rollContest(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  rng: () => number,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): ContestResult {
  const [yours, theirs] = adjustedValues(rules, a, b, mode);
  if (walled(rules, a, b, mode)) {
    // No roll and no RNG draw: the higher grade simply succeeds.
    const win = gradeGap(rules, a.grade, b.grade) < 0;
    return { yours, theirs, chance: win ? 1 : 0, roll: null, walled: true, success: win };
  }
  const total = yours + theirs;
  const chance = total === 0 ? 0.5 : yours / total;
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new CharacterRuleError(`The RNG must return a number in [0, 1) (got ${roll})`);
  }
  return { yours, theirs, chance, roll, walled: false, success: roll < chance };
}

/**
 * Damage factor for a hit from `attacker` on `target` (DESIGN §7). In
 * "gradeWalls" mode a hit from one grade below deals ⅓ damage and from two or
 * more below none; same or higher grade deals full damage. Other modes do not
 * scale damage.
 */
export function damageFactor(
  rules: RulesConfig,
  attackerGrade: string,
  targetGrade: string,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): number {
  const gap = gradeGap(rules, attackerGrade, targetGrade);
  if (mode !== 'gradeWalls' || gap <= 0) return 1;
  return gap === 1 ? rules.resolution.lowerGradeFraction : 0;
}

/** How a group's members may act against one opponent (DESIGN §7). */
export interface GroupPlan<T extends ContestSide = ContestSide> {
  /** Members whose power adds up into one side. */
  readonly pooled: readonly T[];
  /** One grade below the opponent: each acts alone, at the reduced value. */
  readonly alone: readonly T[];
  /** Two or more grades below the opponent: they cannot touch it. */
  readonly powerless: readonly T[];
}

/**
 * No strength in numbers across grades (DESIGN §7, "gradeWalls" mode): only
 * members at or above the opponent's grade may pool their power; one grade
 * below, each acts alone; two or more below, they cannot affect it at all. In
 * the other modes every member pools. Against several opponents, plan once
 * per opponent. Combine the pooled members with `pooledSide`.
 */
export function planGroup<T extends ContestSide>(
  rules: RulesConfig,
  group: readonly T[],
  opponent: ContestSide,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): GroupPlan<T> {
  const pooled: T[] = [];
  const alone: T[] = [];
  const powerless: T[] = [];
  for (const m of group) {
    checkSide(m, 'A member’s value');
    const gap = gradeGap(rules, m.grade, opponent.grade);
    if (mode !== 'gradeWalls' || gap <= 0) pooled.push(m);
    else if (gap === 1) alone.push(m);
    else powerless.push(m);
  }
  return { pooled, alone, powerless };
}

/**
 * The pooled members as one contest side: their values summed, at the lowest
 * of their grades (a pooled side is only as high a grade as its weakest
 * member, so a higher-grade helper adds stat, not a grade wall). Null for an
 * empty pool.
 */
export function pooledSide(rules: RulesConfig, pooled: readonly ContestSide[]): ContestSide | null {
  let best: ContestSide | null = null;
  let value = 0;
  for (const m of pooled) {
    checkSide(m, 'A member’s value');
    value += m.value;
    if (best === null || gradeIndexOf(rules, m.grade) < gradeIndexOf(rules, best.grade)) best = m;
  }
  return best === null ? null : { value, grade: best.grade };
}

/** A progress clock with N segments (DESIGN §7). */
export interface Clock {
  readonly id: string;
  readonly name: string;
  readonly segments: number;
  /** Segments filled by successes (0..segments). */
  readonly filled: number;
  /** Failures logged against the clock (they do not fill it). */
  readonly failures: number;
  readonly createdAt: string;
}

export const MAX_CLOCK_SEGMENTS = 24;

/**
 * A montage the GM offers on a clock (M3.11, DESIGN §7): each listed player
 * gives a one-line focus, saved to the practice log as a "montage" entry.
 * `label` is what players see (the clock itself stays GM-only).
 */
export interface Montage {
  readonly id: string;
  readonly clockId: string;
  readonly label: string;
  readonly characterIds: readonly string[];
  /** Practice entry id of each character's focus, once given. */
  readonly focuses: Readonly<Record<string, string>>;
  readonly status: 'open' | 'closed';
  readonly offeredAt: string;
}

export function newClock(id: string, name: string, segments: number, at: string): Clock {
  if (!Number.isInteger(segments) || segments < 1 || segments > MAX_CLOCK_SEGMENTS) {
    throw new CharacterRuleError(`A clock has 1–${MAX_CLOCK_SEGMENTS} segments`);
  }
  return { id, name: name.trim(), segments, filled: 0, failures: 0, createdAt: at };
}

/**
 * Records progress: `amount` segments filled on a success (at most what is
 * left), or one failure. A full clock takes no more ticks.
 */
export function tickClock(clock: Clock, result: 'success' | 'failure', amount = 1): Clock {
  if (clock.filled >= clock.segments) {
    throw new CharacterRuleError(`[${clock.name}] is already complete`);
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new CharacterRuleError('Fill at least one segment');
  }
  if (result === 'failure') {
    if (amount !== 1) throw new CharacterRuleError('A failure counts once');
    return { ...clock, failures: clock.failures + 1 };
  }
  // Refused rather than clamped, so undoing an earlier tick never changes what
  // a later one filled (D31).
  const left = clock.segments - clock.filled;
  if (amount > left) {
    throw new CharacterRuleError(
      `[${clock.name}] has only ${left} segment${left === 1 ? '' : 's'} left`,
    );
  }
  return { ...clock, filled: clock.filled + amount };
}

export const clockComplete = (clock: Clock): boolean => clock.filled >= clock.segments;

/**
 * Montage eligibility (DESIGN §7): the clock is at least `montage.minClockFill`
 * full (half by default), not complete, and has no failures when
 * `montage.requireNoFailures` is set.
 */
export function montageAvailable(rules: RulesConfig, clock: Clock): boolean {
  if (clockComplete(clock)) return false;
  if (rules.montage.requireNoFailures && clock.failures > 0) return false;
  // Integer comparison avoids float noise: filled / segments >= minFill.
  return (
    clock.filled >= Math.ceil(Number((rules.montage.minClockFill * clock.segments).toFixed(9)))
  );
}
