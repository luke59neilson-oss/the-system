import type { IdentifyTier } from '../projection/identify';
import { raceLevel, type Character } from '../character';
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
  /**
   * Grade id and level (MQ.8, DESIGN §7 Identify range), both or neither;
   * null for things with no level (a place, an energy): no range check.
   */
  readonly grade: string | null;
  readonly level: number | null;
  /** M7.2 bestiary (GM-only): stat id → value, or null when not statted. */
  readonly stats: Readonly<Record<string, number>> | null;
  /** M7.2 bestiary (GM-only) notes. */
  readonly notes: string;
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

/**
 * Whether the viewer can Identify this entity (MQ.8, DESIGN §7): anything of
 * a lower grade always, nothing of a higher grade, the same grade only if its
 * level is at most `identify.sameGradeLevelRatio` × the viewer's race level.
 * Entities without a grade and level are always in range.
 */
export function identifyInRange(
  rules: RulesConfig,
  viewer: Character,
  entity: Pick<Entity, 'grade' | 'level'>,
): boolean {
  if (entity.grade === null || entity.level === null) return true;
  const order = rules.grades.map((g) => g.id);
  const mine = order.indexOf(viewer.grade);
  const theirs = order.indexOf(entity.grade);
  if (mine === -1 || theirs === -1) return false;
  if (theirs !== mine) return theirs < mine;
  return entity.level <= rules.identify.sameGradeLevelRatio * raceLevel(rules, viewer);
}

/** Why a grade and level pair is invalid, or null when it is fine. */
export function rankProblem(
  rules: RulesConfig,
  grade: string | null,
  level: number | null,
): string | null {
  if ((grade === null) !== (level === null)) return 'give both a grade and a level, or neither';
  if (grade !== null && !rules.grades.some((g) => g.id === grade))
    return `unknown grade "${grade}"`;
  if (level !== null && level > rules.campaign.levelCap)
    return `level must be at most ${rules.campaign.levelCap}`;
  return null;
}
