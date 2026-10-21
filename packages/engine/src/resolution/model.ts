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
 * differ.
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
  /** The roll drawn, 0..1 (wins when below `chance`). */
  readonly roll: number;
  readonly success: boolean;
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
  const total = yours + theirs;
  const chance = total === 0 ? 0.5 : yours / total;
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new CharacterRuleError(`The RNG must return a number in [0, 1) (got ${roll})`);
  }
  return { yours, theirs, chance, roll, success: roll < chance };
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
