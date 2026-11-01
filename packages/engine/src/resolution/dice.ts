import { CharacterRuleError } from '../character';
import type { RulesConfig } from '../rules';
import {
  adjustedValues,
  gradeGap,
  walled,
  type ContestResult,
  type ContestSide,
  type GradeGapMode,
} from './model';

/**
 * d20 + modifier rolls (ROADMAP MK.1, DESIGN §7 "Dice", L27). A campaign
 * setting (`resolution.rolls`) picks app odds (the default, and every campaign
 * made before MK) or d20: each side rolls a d20 and adds its roll modifier,
 * the higher total wins, a tie rolls again. The modifier is
 * round(3 × log2(stat ÷ 10)) on the stat with its bonuses, a stat below 1
 * counted as 1 (all numbers from `resolution.d20`). Grade walls hold: one
 * grade apart the lower side takes −5 to its modifier (and ⅓ damage, as in
 * odds mode); two or more apart there is no roll. Pure: dice come from the
 * caller (a typed die or the injected RNG).
 */

export type RollsMode = 'odds' | 'd20';

/** d20 numbers used when a campaign's rules carry none (made before MK). */
export const DEFAULT_D20 = {
  modifierPerDoubling: 3,
  baseStat: 10,
  minStat: 1,
  gradeGapPenalty: 5,
} as const;

export const D20_SIDES = 20;

export type D20Settings = { readonly [K in keyof typeof DEFAULT_D20]: number };

export const rollsModeOf = (rules: RulesConfig): RollsMode => rules.resolution.rolls ?? 'odds';

export const d20Settings = (rules: RulesConfig): D20Settings => rules.resolution.d20 ?? DEFAULT_D20;

/** The roll modifier for a stat value (with bonuses): round(k × log2(max(stat, min) ÷ base)). */
export function rollModifier(rules: RulesConfig, stat: number): number {
  if (!Number.isFinite(stat)) throw new CharacterRuleError(`A stat must be a number (got ${stat})`);
  const s = d20Settings(rules);
  const value = Math.max(stat, s.minStat);
  // toFixed guards float noise at exact doublings (log2(8) = 2.9999…).
  return Math.round(Number((s.modifierPerDoubling * Math.log2(value / s.baseStat)).toFixed(9)));
}

/** How a die was rolled: typed from a real d20, or rolled by the app. */
export type DieHow = 'typed' | 'app';

export interface DieRoll {
  readonly die: number;
  readonly how: DieHow;
}

/** One round of a d20 contest: both dice and both totals. */
export interface D20Round {
  readonly a: DieRoll & { readonly total: number };
  readonly b: DieRoll & { readonly total: number };
}

/** The dice of a d20 contest: each side's modifier and every round (all but the last tied). */
export interface D20Record {
  readonly modA: number;
  readonly modB: number;
  readonly rounds: readonly D20Round[];
}

export interface D20ContestResult extends ContestResult {
  /** Null when a grade wall settled it with no roll. */
  readonly d20: D20Record | null;
}

/** The most rounds one contest records (ties are 5% at equal modifiers). */
export const MAX_D20_ROUNDS = 50;

/**
 * Both sides' modifiers (null when a grade wall settles the contest). In
 * "gradeWalls" mode the stats count as they are and the lower side takes the
 * one-grade penalty; in the other modes the modifier is taken from the
 * mode-adjusted value.
 */
export function d20Modifiers(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): { yours: number; theirs: number; modA: number; modB: number } | null {
  if (walled(rules, a, b, mode)) return null;
  if (mode === 'gradeWalls') {
    adjustedValues(rules, a, b, mode); // validates both sides
    let modA = rollModifier(rules, a.value);
    let modB = rollModifier(rules, b.value);
    const gap = gradeGap(rules, a.grade, b.grade);
    const penalty = d20Settings(rules).gradeGapPenalty;
    if (gap === 1) modA -= penalty;
    if (gap === -1) modB -= penalty;
    return { yours: a.value, theirs: b.value, modA, modB };
  }
  const [yours, theirs] = adjustedValues(rules, a, b, mode);
  return { yours, theirs, modA: rollModifier(rules, yours), modB: rollModifier(rules, theirs) };
}

/** Exact chance that side A wins with d20 + modA against d20 + modB, ties rolled again. */
export function d20WinChance(modA: number, modB: number): number {
  let wins = 0;
  let ties = 0;
  for (let x = 1; x <= D20_SIDES; x++) {
    for (let y = 1; y <= D20_SIDES; y++) {
      const d = x + modA - (y + modB);
      if (d > 0) wins++;
      else if (d === 0) ties++;
    }
  }
  const decided = D20_SIDES * D20_SIDES - ties;
  return decided === 0 ? 0.5 : wins / decided;
}

function checkDie(roll: DieRoll, label: string): void {
  if (!Number.isInteger(roll.die) || roll.die < 1 || roll.die > D20_SIDES) {
    throw new CharacterRuleError(
      `${label} must be a whole number 1–${D20_SIDES} (got ${roll.die})`,
    );
  }
  if (roll.how !== 'typed' && roll.how !== 'app') {
    throw new CharacterRuleError(`${label}: say whether it was typed or rolled by the app`);
  }
}

/**
 * Settles a d20 contest from the dice rolled: every round but the last a tie,
 * the last decides. A walled contest takes no dice.
 */
export function settleD20Contest(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  mode: GradeGapMode,
  dice: readonly { readonly a: DieRoll; readonly b: DieRoll }[],
): D20ContestResult {
  const mods = d20Modifiers(rules, a, b, mode);
  if (mods === null) {
    if (dice.length > 0)
      throw new CharacterRuleError('A grade wall settles this contest; it has no roll');
    const [yours, theirs] = adjustedValues(rules, a, b, mode);
    const win = gradeGap(rules, a.grade, b.grade) < 0;
    return {
      yours,
      theirs,
      chance: win ? 1 : 0,
      roll: null,
      walled: true,
      success: win,
      d20: null,
    };
  }
  if (dice.length === 0) throw new CharacterRuleError('This contest needs each side’s d20');
  if (dice.length > MAX_D20_ROUNDS) throw new CharacterRuleError('Too many tied rounds');
  const { modA, modB } = mods;
  const rounds: D20Round[] = dice.map((r, i) => {
    checkDie(r.a, 'Your die');
    checkDie(r.b, 'Their die');
    const round = {
      a: { die: r.a.die, how: r.a.how, total: r.a.die + modA },
      b: { die: r.b.die, how: r.b.how, total: r.b.die + modB },
    };
    const tie = round.a.total === round.b.total;
    const last = i === dice.length - 1;
    if (tie && last) throw new CharacterRuleError('A tie rolls again');
    if (!tie && !last) throw new CharacterRuleError('Only a tie rolls again');
    return round;
  });
  const final = rounds[rounds.length - 1] as D20Round;
  return {
    yours: mods.yours,
    theirs: mods.theirs,
    chance: d20WinChance(modA, modB),
    roll: null,
    walled: false,
    success: final.a.total > final.b.total,
    d20: { modA, modB, rounds },
  };
}

/** An app-rolled d20 from an RNG returning [0, 1). */
export function appDie(rng: () => number): DieRoll {
  const r = rng();
  if (!Number.isFinite(r) || r < 0 || r >= 1) {
    throw new CharacterRuleError(`The RNG must return a number in [0, 1) (got ${r})`);
  }
  return { die: Math.floor(r * D20_SIDES) + 1, how: 'app' };
}

/**
 * Rolls a d20 contest: `die` gives each side's die per round (a typed die or
 * `appDie`), rolling again while tied. No dice are drawn when a grade wall
 * settles it.
 */
export function rollD20Contest(
  rules: RulesConfig,
  a: ContestSide,
  b: ContestSide,
  die: (side: 'a' | 'b', round: number) => DieRoll,
  mode: GradeGapMode = rules.resolution.gradeGapMode,
): D20ContestResult {
  const mods = d20Modifiers(rules, a, b, mode);
  if (mods === null) return settleD20Contest(rules, a, b, mode, []);
  const dice: { a: DieRoll; b: DieRoll }[] = [];
  for (let i = 0; i < MAX_D20_ROUNDS; i++) {
    const round = { a: die('a', i), b: die('b', i) };
    dice.push(round);
    if (round.a.die + mods.modA !== round.b.die + mods.modB) {
      return settleD20Contest(rules, a, b, mode, dice);
    }
  }
  throw new CharacterRuleError('Too many tied rounds');
}
