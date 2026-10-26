import type { CampaignState, Command } from '@the-system/engine';

/** MC.4 (DESIGN §11 "Loading screen"): the default System-styled loading text. */
export const LOADING_TEXT = '[The System is constructing the area…]';

/** The pinned broadcast the GM sends to every character while content generates. */
export function loadingCommand(text: string): Command | null {
  const t = text.trim();
  if (t === '') return null;
  return { type: 'system.broadcast', text: t, characterIds: null, display: { mode: 'pinned' } };
}

/** A loading screen the GM sent: its text and how many broadcasts existed before it. */
export interface SentLoading {
  text: string;
  since: number;
}

/**
 * MC.4 review round 2: loading screens to take down may not have reached the
 * state yet (a generation can fail before its banner arrives). For each, the
 * oldest pinned broadcast with its text sent after `since` and not already
 * claimed is its banner: a live one gets a `broadcast.remove`, one already
 * removed needs nothing, and one not there yet waits in `left`. `claimed`
 * holds banner ids already handled (removals sent but not yet in the state).
 */
export function settleEnding(
  state: CampaignState,
  ending: readonly SentLoading[],
  claimed: ReadonlySet<string>,
): { removals: string[]; left: SentLoading[] } {
  const taken = new Set(claimed);
  const removals: string[] = [];
  const left: SentLoading[] = [];
  for (const e of ending) {
    const t = e.text.trim();
    const b = state.broadcasts
      .slice(e.since)
      .find((x) => x.text === t && x.display?.mode === 'pinned' && !taken.has(x.id));
    if (!b) {
      left.push(e);
      continue;
    }
    taken.add(b.id);
    if (!b.removed) removals.push(b.id);
  }
  return { removals, left };
}
