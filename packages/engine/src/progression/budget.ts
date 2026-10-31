import {
  CharacterRuleError,
  type Character,
  type StatTrack,
  type TrackDistribution,
  type TrackDistributions,
} from '../character';
import type { GradeRules } from '../rules';
import { classSpread } from './xp';

/**
 * ME.1 (DESIGN §2 "Every track grants stats", §4): what one level of a track
 * grants. At a grade whose budget differs from a distribution's total, the
 * distribution is scaled to the budget (D301).
 */
export type { StatTrack, TrackDistribution, TrackDistributions } from '../character';

export const STAT_TRACKS: readonly StatTrack[] = ['class', 'profession', 'race'];

/** Points a distribution grants per level: its stats plus its free points. */
export function distributionTotal(d: TrackDistribution): number {
  return Object.values(d.stats).reduce((a, b) => a + b, 0) + d.free;
}

const isWhole = (n: number) => Number.isInteger(n) && n >= 0;

/** Checks a distribution's shape: known stats, whole points ≥ 0. Returns a cleaned copy. */
export function checkDistribution(
  d: TrackDistribution,
  statOrder: readonly string[],
): TrackDistribution {
  const stats: Record<string, number> = {};
  for (const [id, n] of Object.entries(d.stats)) {
    if (!statOrder.includes(id)) throw new CharacterRuleError(`Unknown stat "${id}"`);
    if (!isWhole(n)) throw new CharacterRuleError(`Points for ${id} must be a whole number ≥ 0`);
    if (n > 0) stats[id] = n;
  }
  if (!isWhole(d.free)) throw new CharacterRuleError('Free points must be a whole number ≥ 0');
  return { stats, free: d.free };
}

/**
 * Scales a distribution to `budget` points (largest remainder over the stats in
 * stat order, then the free points; ties to the earlier entry), so the result
 * always totals exactly `budget` and free points stay free. A distribution of
 * 0 points becomes all free points.
 */
export function scaleDistribution(
  d: TrackDistribution,
  budget: number,
  statOrder: readonly string[],
): TrackDistribution {
  if (!isWhole(budget)) throw new CharacterRuleError('Budget must be a whole number ≥ 0');
  const total = distributionTotal(d);
  if (total === budget) return d;
  if (total === 0) return { stats: {}, free: budget };
  const keys = [...statOrder.filter((id) => (d.stats[id] ?? 0) > 0), '\u0000free'];
  const weights = keys.map((k) => (k === '\u0000free' ? d.free : (d.stats[k] ?? 0)));
  const parts = weights.map((w) => Math.floor((budget * w) / total));
  let left = budget - parts.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, r: (budget * w) % total }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    parts[i] = (parts[i] as number) + 1;
    left--;
  }
  const stats: Record<string, number> = {};
  let free = 0;
  keys.forEach((k, i) => {
    const n = parts[i] as number;
    if (k === '\u0000free') free = n;
    else if (n > 0) stats[k] = n;
  });
  return { stats, free };
}

/** One level's grant on a track: stat points, free points, and the updated spread totals. */
export interface TrackGrant {
  readonly stats: Readonly<Record<string, number>>;
  readonly free: number;
  readonly classSpreadTotals: Readonly<Record<string, number>>;
}

/**
 * What one level of `track` grants at `grade` (which must have a trackBudget):
 * - class: the class distribution, or with none the class weights at the
 *   class budget (D35's cumulative split, no free points; DESIGN §2 "a starting
 *   class made before this rule");
 * - profession: the profession distribution; with none (or before the
 *   character has a profession, when the class grants the profession's share)
 *   the class's shape at the profession budget;
 * - race: the race distribution, or with none all free points (the starting
 *   Human race, DESIGN §2).
 */
export function trackGrant(
  character: Pick<Character, 'classWeights' | 'classSpreadTotals' | 'profession'> & {
    readonly distributions?: TrackDistributions | undefined;
  },
  grade: GradeRules,
  track: StatTrack,
  statOrder: readonly string[],
  totals: Readonly<Record<string, number>> = character.classSpreadTotals,
): TrackGrant {
  const budget = grade.trackBudget;
  if (!budget) throw new CharacterRuleError(`Grade ${grade.id} has no track budget`);
  const points = budget[track];
  const own = character.distributions?.[track];
  const usable = track === 'profession' && character.profession === null ? undefined : own;
  if (usable) {
    const d = scaleDistribution(usable, points, statOrder);
    return { stats: d.stats, free: d.free, classSpreadTotals: totals };
  }
  if (track === 'race') return { stats: {}, free: points, classSpreadTotals: totals };
  const cls = character.distributions?.class;
  if (cls) {
    const d = scaleDistribution(cls, points, statOrder);
    return { stats: d.stats, free: d.free, classSpreadTotals: totals };
  }
  if (points === 0) return { stats: {}, free: 0, classSpreadTotals: totals };
  const spread = classSpread(character.classWeights, totals, statOrder, points);
  const next: Record<string, number> = { ...totals };
  const stats: Record<string, number> = {};
  for (const [id, n] of Object.entries(spread)) {
    if (n === 0) continue;
    stats[id] = n;
    next[id] = (next[id] ?? 0) + n;
  }
  return { stats, free: 0, classSpreadTotals: next };
}
