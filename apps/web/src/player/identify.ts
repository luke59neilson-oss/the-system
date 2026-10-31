import type { PlayerBestiary, PlayerIdentify } from '@the-system/engine';

/**
 * Identify helpers (ROADMAP M3.9, DESIGN §7 "Identify"). Pure.
 *
 * The server sends only the entities the GM marked identified for this
 * character (MV.3), each with the result decided then, so the screen only picks.
 */

/** Every bestiary entry, in category order. */
export const bestiaryEntries = (b: PlayerBestiary): PlayerIdentify[] =>
  b.categories.flatMap((g) => g.entries);

/** What the result panel shows for the entity the player chose. */
export type IdentifyResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'shown'; readonly entry: PlayerIdentify }
  /** The chosen entity is no longer known (GM undo): say so instead of going blank. */
  | { readonly kind: 'gone'; readonly label: string };

export function identifyResult(
  known: readonly PlayerIdentify[],
  chosen: { readonly id: string; readonly label: string } | null,
): IdentifyResult {
  if (chosen === null) return { kind: 'none' };
  const entry = known.find((e) => e.id === chosen.id);
  return entry ? { kind: 'shown', entry } : { kind: 'gone', label: chosen.label };
}

/** The text when the entity has no Identify text yet. */
export const NOTHING_REVEALED = 'Your Identify reveals nothing more about it.';

/** What Identify shows for a target out of range (MQ.8, DESIGN §7). */
export const OUT_OF_RANGE = '[??? – lvl ???]';

/**
 * The status line above the text: `[??? – lvl ???]` out of range,
 * `[Pale hunter (F) – lvl 7]` when the GM gave a grade and level, else null.
 */
export function identifyHeader(e: PlayerIdentify): string | null {
  if (!e.inRange) return OUT_OF_RANGE;
  if (e.grade === null || e.level === null) return null;
  return `[${e.label} (${e.grade}) – lvl ${e.level}]`;
}
