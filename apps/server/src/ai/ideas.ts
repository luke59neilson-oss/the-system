// MW.3 (DESIGN §11 "Story ideas"): which of the GM's ideas a co-DM prompt
// carries, and how a result names the one it used. GM-only, like every prompt.
import { chooseIdeas, IDEAS_IN_PROMPT, type CampaignState, type Idea } from '@the-system/engine';
import { sceneNpcs } from './sceneNpcs';

/** What the panel gets back about the idea a result used. */
export interface UsedIdea {
  readonly id: string;
  readonly text: string;
}

export const usedIdea = (idea: Idea | null): UsedIdea | null =>
  idea ? { id: idea.id, text: idea.text } : null;

/** Everyday words that say nothing about what is in play. */
const COMMON_WORDS = new Set(
  (
    'about after again also back been before being came come could does down each even from ' +
    'give goes going good have here into just know like look make many more most much must ' +
    'need only other over said same should some something still such take tell than that ' +
    'their them then there these they thing think this those through under very want well ' +
    'were what when where which while will with would your yeah okay'
  ).split(' '),
);

/** The place, the NPCs in the scene and the words in play, for matching. */
export function ideasInPlay(
  state: CampaignState,
  context: { readonly kind?: string; readonly words?: string; readonly first?: string },
): readonly Idea[] {
  const place = state.currentRegion ? (state.regions[state.currentRegion]?.name ?? '') : '';
  const words = [
    place,
    ...sceneNpcs(state).map((n) => n.name),
    // Words of four letters or more, so "the" never counts as a connection.
    ...(context.words ?? '')
      .split(/[^\p{L}\p{N}'’-]+/u)
      .filter((w) => w.length >= 4 && !COMMON_WORDS.has(w.toLowerCase())),
  ];
  const ideas = state.ideaOrder
    .map((id) => state.ideas[id])
    .filter((idea): idea is Idea => idea !== undefined);
  const chosen = chooseIdeas(ideas, {
    ...(context.kind === undefined ? {} : { kind: context.kind }),
    words,
  });
  // The idea a chip was built on stays on offer when its generation is asked for.
  const first = context.first === undefined ? undefined : state.ideas[context.first];
  if (!first || first.used || chosen.includes(first)) return chosen;
  return [first, ...chosen].slice(0, Math.max(chosen.length, IDEAS_IN_PROMPT));
}
