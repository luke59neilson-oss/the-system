// MW.3 (DESIGN §11 "Story ideas"): which unused ideas a co-DM prompt carries.

/** At most this many ideas go into one prompt, and each is cut to this length. */
export const IDEAS_IN_PROMPT = 3;
export const IDEA_PROMPT_CHARS = 300;

export interface ChoosableIdea {
  readonly id: string;
  readonly text: string;
  readonly kind: string;
  readonly tags: readonly string[];
  readonly used: boolean;
  readonly pinned: boolean;
}

export interface IdeaContext {
  /** What is being generated, when that matches an idea kind (npc, place...). */
  readonly kind?: string;
  /** The current place and NPC names, and any other words in play. */
  readonly words: readonly string[];
}

/**
 * The most relevant unused ideas: a matching kind, tags or text naming the
 * place or NPCs in play, then pinned ones. An idea with no connection at all
 * and no pin is left out. Ties keep the board's order, so the choice is stable.
 */
export function chooseIdeas<T extends ChoosableIdea>(
  ideas: readonly T[],
  context: IdeaContext,
  max: number = IDEAS_IN_PROMPT,
): readonly T[] {
  const words = context.words.map((w) => w.trim().toLowerCase()).filter((w) => w !== '');
  const score = (idea: T): number => {
    const text = idea.text.toLowerCase();
    const tags = idea.tags.map((t) => t.toLowerCase());
    let points = 0;
    if (context.kind !== undefined && idea.kind === context.kind) points += 2;
    for (const word of words) {
      if (tags.includes(word)) points += 3;
      else if (text.includes(word)) points += 2;
    }
    return points + (idea.pinned ? 1 : 0);
  };
  return ideas
    .filter((idea) => !idea.used)
    .map((idea, index) => ({ idea, index, points: score(idea) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .slice(0, Math.max(0, max))
    .map((row) => row.idea);
}
