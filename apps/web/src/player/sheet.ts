import type { PlayerRules } from '@the-system/engine';

/** Stat in tenths per the rules' display settings (DESIGN §2: 23 → 2.3). */
export function formatStatValue(rules: PlayerRules, value: number): string {
  return (value / rules.stats.displayDivisor).toFixed(rules.stats.displayDecimals);
}

/** Free points not yet assigned. */
export function unassignedPoints(
  batches: readonly { points: number; allocation: unknown }[],
): number {
  return batches.filter((b) => b.allocation === null).reduce((a, b) => a + b.points, 0);
}

export function rarityName(rules: PlayerRules, id: string): string {
  return rules.rarities.find((r) => r.id === id)?.name ?? id;
}
