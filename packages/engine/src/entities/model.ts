import type { IdentifyTier } from '../projection/identify';
import type { RulesConfig } from '../rules';

/**
 * Something players can Identify (M3.9, DESIGN §7): a creature, NPC, item or
 * place with one description per minimum Identify rarity. Players see only
 * the entities they know, by `label`, and only the best tier their own
 * Identify rarity unlocks; `name` and the other tiers stay with the GM.
 * The bestiary (M7.2) builds on this.
 */
export interface Entity {
  readonly id: string;
  /** The GM's own name (GM-only). */
  readonly name: string;
  /** What players call it in their Identify list. */
  readonly label: string;
  /** Tier texts, in the order the GM gave them. */
  readonly tiers: readonly IdentifyTier[];
  /** Character ids that know it, in reveal order. */
  readonly knownBy: readonly string[];
  readonly createdAt: string;
}

/** Why a tier list is invalid for these rules, or null when it is fine. */
export function tierProblem(rules: RulesConfig, tiers: readonly IdentifyTier[]): string | null {
  const ladder = rules.skills.rarities.map((r) => r.id);
  const seen = new Set<string>();
  for (const tier of tiers) {
    if (!ladder.includes(tier.minRarity)) return `unknown rarity "${tier.minRarity}"`;
    if (seen.has(tier.minRarity)) return `two tiers for rarity "${tier.minRarity}"`;
    seen.add(tier.minRarity);
  }
  return null;
}
