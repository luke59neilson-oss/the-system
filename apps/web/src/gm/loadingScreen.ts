import type { CampaignState, Command } from '@the-system/engine';

/** MC.4 (DESIGN §11 "Loading screen"): the default System-styled loading text. */
export const LOADING_TEXT = '[The System is constructing the area…]';

/** The pinned broadcast the GM sends to every character while content generates. */
export function loadingCommand(text: string): Command | null {
  const t = text.trim();
  if (t === '') return null;
  return { type: 'system.broadcast', text: t, characterIds: null, display: { mode: 'pinned' } };
}

/**
 * The id of the newest live (pinned, not removed) banner with this text, sent
 * after `since` broadcasts existed: the loading screen just sent. Null when
 * there is none.
 */
export function loadingBannerId(state: CampaignState, text: string, since: number): string | null {
  const t = text.trim();
  for (let i = state.broadcasts.length - 1; i >= since; i--) {
    const b = state.broadcasts[i];
    if (b && b.text === t && b.display?.mode === 'pinned' && !b.removed) return b.id;
  }
  return null;
}

/** Takes the loading screen down; null when it is already gone. */
export function clearLoadingCommand(state: CampaignState, id: string): Command | null {
  const b = state.broadcasts.find((x) => x.id === id);
  return b && b.display && !b.removed ? { type: 'broadcast.remove', id } : null;
}
