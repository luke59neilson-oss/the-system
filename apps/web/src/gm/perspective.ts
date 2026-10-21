/**
 * "View as" perspectives for the GM app (ROADMAP MS.3). Character views and
 * Table-view panes are real player clients loaded in frames from
 * `/play/<id>?pane=1`: they join without the GM key and only ever receive the
 * player projection, so what the GM sees is exactly what that player sees.
 */

export const MAX_TABLE_PANES = 4;

export type Perspective =
  { kind: 'gm' } | { kind: 'table' } | { kind: 'character'; characterId: string };

export interface PartyMember {
  id: string;
  name: string;
}

/** URL a player pane loads: the ordinary player screen in compact pane mode. */
export function paneUrl(characterId: string): string {
  return `/play/${encodeURIComponent(characterId)}?pane=1`;
}

/** True when this player page was opened as a pane inside the GM app. */
export function isPaneMode(search: string): boolean {
  return new URLSearchParams(search).get('pane') === '1';
}

/**
 * The perspective to show for the current party: a character view whose
 * character no longer exists (e.g. its creation was undone) falls back to GM.
 */
export function resolvePerspective(p: Perspective, party: readonly PartyMember[]): Perspective {
  if (p.kind === 'character' && !party.some((m) => m.id === p.characterId)) return { kind: 'gm' };
  return p;
}

/**
 * Characters shown as Table-view panes, in party order. `picked` is the GM's
 * choice (null = default: the first four); ids no longer in the party are
 * dropped and at most MAX_TABLE_PANES are kept.
 */
export function tablePanes(
  party: readonly PartyMember[],
  picked: readonly string[] | null,
): PartyMember[] {
  if (picked === null) return party.slice(0, MAX_TABLE_PANES);
  const chosen = new Set(picked);
  return party.filter((m) => chosen.has(m.id)).slice(0, MAX_TABLE_PANES);
}

/**
 * Toggles a character in the Table-view pick list. Adding a fifth is refused
 * (returns the list unchanged) so the GM always sees which four are shown.
 */
export function togglePane(
  party: readonly PartyMember[],
  picked: readonly string[] | null,
  id: string,
): string[] {
  const current = tablePanes(party, picked).map((m) => m.id);
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= MAX_TABLE_PANES) return current;
  const next = new Set([...current, id]);
  return party.filter((m) => next.has(m.id)).map((m) => m.id);
}

/**
 * The player home offers a link to the GM console only in a browser on the
 * host itself (the console still needs the GM key; this just saves typing).
 */
export function isHostBrowser(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
