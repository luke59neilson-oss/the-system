import type { Character } from '../character';
import type { RulesConfig } from '../rules';

/** One Identify description, shown to viewers whose Identify is at least `minRarity` (DESIGN §7). */
export interface IdentifyTier {
  readonly minRarity: string;
  readonly text: string;
}

/**
 * The viewer's Identify rarity: the rarity of their race skill named like the
 * rules' starting race skill (case-insensitive), or null when they lack it.
 */
export function identifyRarity(
  rules: RulesConfig,
  character: Pick<Character, 'skills'>,
): string | null {
  const name = rules.skills.startingRaceSkill.name.toLowerCase();
  const skill = character.skills.find((s) => s.kind === 'race' && s.name.toLowerCase() === name);
  return skill ? skill.rarity : null;
}

/**
 * The single tier text the viewer unlocks: the highest tier whose minimum
 * rarity is at or below the viewer's Identify rarity. Returns null when no
 * tier is unlocked; tiers with rarities missing from the ladder never unlock.
 * Only this text may reach the player, never the full tier list.
 */
export function resolveIdentify(
  rules: RulesConfig,
  tiers: readonly IdentifyTier[],
  viewerRarity: string | null,
): string | null {
  if (viewerRarity === null) return null;
  const ladder = rules.skills.rarities.map((r) => r.id);
  const viewerRank = ladder.indexOf(viewerRarity);
  if (viewerRank === -1) return null;
  let best: { rank: number; text: string } | null = null;
  for (const tier of tiers) {
    const rank = ladder.indexOf(tier.minRarity);
    if (rank === -1 || rank > viewerRank) continue;
    if (best === null || rank > best.rank) best = { rank, text: tier.text };
  }
  return best ? best.text : null;
}
