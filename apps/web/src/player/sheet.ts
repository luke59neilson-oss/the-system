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

/** A config id made safe for a CSS class name (letters, digits, hyphens). */
export function cssToken(id: string): string {
  return id.replace(/[^a-z0-9-]/giu, '');
}

/** ` theme-<token>` for a grade metal theme token, or '' (M8.1 builds the full themes). */
export function themeClass(theme: string | null | undefined): string {
  const token = cssToken(theme ?? '');
  return token ? ` theme-${token}` : '';
}

/** Pool fill for the bar, clamped to 0–100 (0 when the maximum is 0). */
export function poolPercent(current: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(100, Math.max(0, (100 * current) / max));
}
