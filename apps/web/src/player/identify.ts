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

/** A status line's name and level with any grade dropped: `[Canyon Stalker – lvl 7]` → `canyon stalker–lvl 7`. */
const statusKey = (line: string): string =>
  line
    .replace(/\(\s*[A-Za-z]\s*\)/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*[–-]\s*/gu, '–')
    .trim()
    .toLowerCase();

/**
 * The text under the header, without a first line that only restates it
 * (QF.62): tier texts written before MV.3 open with `[Canyon Stalker – lvl 7]`,
 * which repeated the header `[Canyon Stalker (F) – lvl 7]`. Null when nothing
 * is left (the screen then says it reveals nothing more).
 */
export function identifyBody(e: PlayerIdentify): string | null {
  if (e.text === null) return null;
  const header = identifyHeader(e);
  if (header === null) return e.text;
  const match = /^\s*(\[[^\]\n]*\])[ \t]*\n?/u.exec(e.text);
  if (!match?.[1] || statusKey(match[1]) !== statusKey(header)) return e.text;
  const rest = e.text.slice(match[0].length).trim();
  return rest === '' ? null : rest;
}
