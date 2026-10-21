import type { RulesConfig } from '../rules';

/**
 * Titles and bonuses (ROADMAP M1.6, DESIGN §4 and §7). A bonus source (a
 * title now; items from M1.7) carries flat and/or percentage bonuses per stat.
 *
 * Documented order, per stat:
 *   1. base     — the character's own stat (class spread + free points)
 *   2. flat     — every flat bonus is added: base + Σ flat
 *   3. percent  — the percentages are summed: Σ percent
 *   4. cap      — that sum is capped at `bonuses.percentCapPerStat` (+25%),
 *                 then applied once: (base + Σ flat) × (1 + capped Σ percent)
 * The result is rounded half away from zero to whole stat units (tenths on
 * screen) and never drops below 0. Percentages never compound with each other.
 */

/** One stat's bonus from one source. `flat` is in stat units (10 = 1.0 on screen). */
export interface StatBonus {
  readonly stat: string;
  readonly flat?: number;
  /** Fraction: 0.1 = +10%. Negative values are penalties. */
  readonly percent?: number;
}

export interface BonusSource {
  readonly id: string;
  readonly kind: 'title' | 'item';
  readonly name: string;
  readonly bonuses: readonly StatBonus[];
}

export interface StatBreakdown {
  readonly base: number;
  /** Σ flat bonuses. */
  readonly flat: number;
  /** Σ percentage bonuses before the cap. */
  readonly percent: number;
  /** The percentage actually applied (after the cap). */
  readonly percentApplied: number;
  /** True when the cap cut the percentage. */
  readonly capped: boolean;
  /** Effective stat in stat units. */
  readonly value: number;
}

export class BonusRuleError extends Error {}

/** Rounds half away from zero, ignoring float noise (2.4999999 → 2.5 → 3). */
function roundHalfAway(x: number): number {
  const clean = Number(x.toPrecision(12));
  return Math.sign(clean) * Math.round(Math.abs(clean));
}

/** Checks one source against the rules: known stats, finite numbers, whole flats. */
export function validateBonusSource(rules: RulesConfig, source: BonusSource): void {
  const known = new Set(rules.stats.list.map((s) => s.id));
  for (const b of source.bonuses) {
    const where = `${source.kind} "${source.name}"`;
    if (!known.has(b.stat)) throw new BonusRuleError(`Unknown stat "${b.stat}" on ${where}`);
    if (b.flat === undefined && b.percent === undefined) {
      throw new BonusRuleError(`Bonus on ${b.stat} for ${where} has neither flat nor percent`);
    }
    if (b.flat !== undefined && !Number.isSafeInteger(b.flat)) {
      throw new BonusRuleError(`Flat bonus on ${b.stat} for ${where} must be a whole number`);
    }
    if (b.percent !== undefined && (!Number.isFinite(b.percent) || b.percent <= -1)) {
      throw new BonusRuleError(`Percent bonus on ${b.stat} for ${where} must be above -100%`);
    }
  }
}

/** Per-stat breakdown of base → flat → percent → cap for every rules stat. */
export function statBreakdown(
  rules: RulesConfig,
  base: Readonly<Record<string, number>>,
  sources: readonly BonusSource[],
): Record<string, StatBreakdown> {
  for (const source of sources) validateBonusSource(rules, source);
  const cap = rules.bonuses.percentCapPerStat;
  const out: Record<string, StatBreakdown> = {};
  for (const { id } of rules.stats.list) {
    const own = base[id];
    if (own === undefined || !Number.isFinite(own)) {
      throw new BonusRuleError(`Stat "${id}" is missing or not a number`);
    }
    let flat = 0;
    let percent = 0;
    for (const source of sources) {
      for (const b of source.bonuses) {
        if (b.stat !== id) continue;
        flat += b.flat ?? 0;
        percent += b.percent ?? 0;
      }
    }
    // Snap float noise (0.1 + 0.2 = 0.30000000000000004) to millionths.
    percent = Math.round(percent * 1e6) / 1e6;
    const percentApplied = Math.max(-1, Math.min(cap, percent));
    const value = Math.max(0, roundHalfAway((own + flat) * (1 + percentApplied)));
    out[id] = { base: own, flat, percent, percentApplied, capped: percent > cap, value };
  }
  return out;
}

/** Effective stats (stat units) after every source's bonuses, in the documented order. */
export function effectiveStats(
  rules: RulesConfig,
  base: Readonly<Record<string, number>>,
  sources: readonly BonusSource[],
): Record<string, number> {
  const breakdown = statBreakdown(rules, base, sources);
  const out: Record<string, number> = {};
  for (const [id, b] of Object.entries(breakdown)) out[id] = b.value;
  return out;
}
