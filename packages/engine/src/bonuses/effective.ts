import type { RulesConfig } from '../rules';

/**
 * Titles and bonuses (ROADMAP M1.6 and MQ.14, DESIGN §4 and §7). A bonus
 * source (a title or an item) carries flat and/or percentage bonuses per stat.
 *
 * Documented order, per stat:
 *   1. base     — the character's own stat (class spread + free points)
 *   2. items    — Σ item flats, capped at `bonuses.itemCapOfBase` × base
 *                 (whole stat units, rounded down; null = no cap). Only a
 *                 positive total is capped: penalties always apply.
 *   3. flat     — base + capped item flats + Σ title flats
 *   4. percent  — the percentages are summed: Σ percent. Under
 *                 `bonuses.itemsFlatOnly` (L6) only titles' percentages count.
 *   5. cap      — that sum is capped at `bonuses.percentCapPerStat` (null =
 *                 no cap, L8), then applied once:
 *                 (base + Σ flat) × (1 + capped Σ percent)
 * The result is rounded half away from zero to whole stat units (tenths on
 * screen) and never drops below 0. Percentages never compound with each other.
 * The percent cap applies to the net sum, so a penalty offsets over-cap
 * stacking (+40% and −20% → +20%). A source id may appear once.
 * Example (DESIGN §4): base 100, items +30 (capped to +20), titles +10% and
 * +5% → (100 + 20) × 1.15 = 138.
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

/** What one source added to one stat (for the player's System text). */
export interface BonusContribution {
  readonly sourceId: string;
  readonly kind: BonusSource['kind'];
  readonly name: string;
  readonly flat: number;
  readonly percent: number;
}

export interface StatBreakdown {
  readonly base: number;
  /** Σ flat bonuses actually applied (item flats after their cap, plus title flats). */
  readonly flat: number;
  /** Σ item flat bonuses before the item cap. */
  readonly itemFlat: number;
  /** The item flats actually applied (after the item cap). */
  readonly itemFlatApplied: number;
  /** True when the item cap cut the item bonus. */
  readonly itemCapped: boolean;
  /** Σ percentage bonuses before the cap. */
  readonly percent: number;
  /** The percentage actually applied (after the cap). */
  readonly percentApplied: number;
  /** True when the percent cap cut the percentage. */
  readonly capped: boolean;
  /** Effective stat in stat units. */
  readonly value: number;
  /** Each source that touched this stat, in the order given. */
  readonly contributions: readonly BonusContribution[];
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
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) throw new BonusRuleError(`Bonus source "${source.id}" given twice`);
    seen.add(source.id);
    validateBonusSource(rules, source);
  }
  const { percentCapPerStat: cap, itemCapOfBase, itemsFlatOnly } = rules.bonuses;
  const out: Record<string, StatBreakdown> = {};
  for (const { id } of rules.stats.list) {
    const own = base[id];
    if (own === undefined || !Number.isSafeInteger(own)) {
      throw new BonusRuleError(`Stat "${id}" is missing or not a whole number`);
    }
    let itemFlat = 0;
    let otherFlat = 0;
    let percent = 0;
    const contributions: BonusContribution[] = [];
    for (const source of sources) {
      let f = 0;
      let p = 0;
      let touched = false;
      for (const b of source.bonuses) {
        if (b.stat !== id) continue;
        touched = true;
        f += b.flat ?? 0;
        p += b.percent ?? 0;
      }
      if (!touched) continue;
      // Items give flat bonuses only (L6): a stored item percentage is ignored.
      if (itemsFlatOnly && source.kind === 'item') p = 0;
      if (source.kind === 'item') itemFlat += f;
      else otherFlat += f;
      percent += p;
      contributions.push({
        sourceId: source.id,
        kind: source.kind,
        name: source.name,
        flat: f,
        percent: p,
      });
    }
    const itemCap =
      itemCapOfBase === null ? Infinity : Math.max(0, Math.floor(own * itemCapOfBase + 1e-9));
    const itemFlatApplied = Math.min(itemFlat, itemCap);
    const flat = itemFlatApplied + otherFlat;
    // Snap float noise (0.1 + 0.2 = 0.30000000000000004) to millionths.
    percent = Math.round(percent * 1e6) / 1e6;
    const percentApplied = Math.max(-1, cap === null ? percent : Math.min(cap, percent));
    const value = Math.max(0, roundHalfAway((own + flat) * (1 + percentApplied)));
    out[id] = {
      base: own,
      flat,
      itemFlat,
      itemFlatApplied,
      itemCapped: itemFlat > itemCap,
      percent,
      percentApplied,
      capped: cap !== null && percent > cap,
      value,
      contributions,
    };
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
