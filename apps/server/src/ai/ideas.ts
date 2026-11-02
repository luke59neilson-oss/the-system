// MW.3 (DESIGN §11 "Story ideas"): which of the GM's ideas a co-DM prompt
// carries, and how a result names the one it used. GM-only, like every prompt.
import { chooseIdeas, type CampaignState, type Idea } from '@the-system/engine';
import { sceneNpcs } from './sceneNpcs';

/** What the panel gets back about the idea a result used. */
export interface UsedIdea {
  readonly id: string;
  readonly text: string;
}

export const usedIdea = (idea: Idea | null): UsedIdea | null =>
  idea ? { id: idea.id, text: idea.text } : null;

/** The place, the NPCs in the scene and the words in play, for matching. */
export function ideasInPlay(
  state: CampaignState,
  context: { readonly kind?: string; readonly words?: string },
): readonly Idea[] {
  const place = state.currentRegion ? (state.regions[state.currentRegion]?.name ?? '') : '';
  const words = [
    place,
    ...sceneNpcs(state).map((n) => n.name),
    // Words of four letters or more, so "the" never counts as a connection.
    ...(context.words ?? '').split(/[^\p{L}\p{N}'’-]+/u).filter((w) => w.length >= 4),
  ];
  const ideas = state.ideaOrder
    .map((id) => state.ideas[id])
    .filter((idea): idea is Idea => idea !== undefined);
  return chooseIdeas(ideas, {
    ...(context.kind === undefined ? {} : { kind: context.kind }),
    words,
  });
}
