import { validateBonusSource, type BonusSource, type StatBonus } from '../bonuses';
import type { RulesConfig } from '../rules';

/**
 * The title library (ROADMAP M6.4, DESIGN §4 "Bonuses", §7 "Titles"). A title
 * carries System text and percentage bonuses (optionally flat stats), set by
 * the GM. Characters hold titles by name (D69); a held title whose name
 * matches a library entry (ignoring case) gives that entry's bonuses, so an
 * edit to the entry reaches every holder. Percentages from titles add up and
 * apply once (L6), with no cap by default (L8).
 */
export interface TitleDef {
  readonly id: string;
  readonly name: string;
  /** The System's text shown to the holder ("You have propagated…"). */
  readonly text: string;
  readonly bonuses: readonly StatBonus[];
}

export class TitleRuleError extends Error {}

/** How title names compare: trimmed, inner whitespace collapsed, any case. */
export const titleKey = (name: string) => name.trim().replace(/\s+/gu, ' ').toLowerCase();
const key = titleKey;

/** The library entry for a held title name, if any (case-insensitive). */
export function titleDefByName(
  library: Readonly<Record<string, TitleDef>>,
  order: readonly string[],
  name: string,
): TitleDef | undefined {
  const k = key(name);
  for (const id of order) {
    const def = Object.prototype.hasOwnProperty.call(library, id) ? library[id] : undefined;
    if (def && key(def.name) === k) return def;
  }
  return undefined;
}

/** Checks a definition: known stats, each listed once, valid numbers, a unique name. */
export function validateTitleDef(
  rules: RulesConfig,
  def: TitleDef,
  library: Readonly<Record<string, TitleDef>>,
  order: readonly string[],
): void {
  const clash = titleDefByName(library, order, def.name);
  if (clash && clash.id !== def.id) {
    throw new TitleRuleError(`The library already has [${clash.name}]`);
  }
  const seen = new Set<string>();
  for (const b of def.bonuses) {
    if (seen.has(b.stat)) throw new TitleRuleError(`Stat "${b.stat}" is listed twice`);
    seen.add(b.stat);
  }
  try {
    validateBonusSource(rules, titleSource(def));
  } catch (error) {
    throw new TitleRuleError(error instanceof Error ? error.message : String(error));
  }
}

export function titleSource(def: TitleDef): BonusSource {
  return { id: `title:${def.id}`, kind: 'title', name: def.name, bonuses: def.bonuses };
}

/** Bonus sources for the titles a character holds, in the order earned; unknown names give none. */
export function titleSources(
  library: Readonly<Record<string, TitleDef>>,
  order: readonly string[],
  titles: readonly string[],
): BonusSource[] {
  const out: BonusSource[] = [];
  const used = new Set<string>();
  for (const name of titles) {
    const def = titleDefByName(library, order, name);
    if (def && def.bonuses.length > 0 && !used.has(def.id)) {
      used.add(def.id);
      out.push(titleSource(def));
    }
  }
  return out;
}
