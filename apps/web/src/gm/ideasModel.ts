// MW.3 (DESIGN §11 "Story ideas"): the GM's Ideas board, without the UI.
import {
  newIdeas,
  parseIdeas,
  type Idea,
  type ImportedIdea,
  type CampaignState,
} from '@the-system/engine';

/** What a co-DM result says about the idea it used. */
export interface UsedIdea {
  readonly id: string;
  readonly text: string;
}

const LABEL_CHARS = 80;

/** An idea's text cut short enough for a one-line mention. */
export const ideaLabel = (idea: { readonly text: string }): string => {
  const one = idea.text.replace(/\s+/gu, ' ').trim();
  return one.length > LABEL_CHARS ? `${one.slice(0, LABEL_CHARS)}…` : one;
};

/** The board: pinned first, used last, otherwise in the order they came; filtered by the search. */
export function boardIdeas(state: CampaignState, query: string, showUsed: boolean): Idea[] {
  const q = query.trim().toLowerCase();
  const ideas = state.ideaOrder
    .map((id) => state.ideas[id])
    .filter((idea): idea is Idea => idea !== undefined)
    .filter((idea) => showUsed || !idea.used)
    .filter(
      (idea) =>
        q === '' ||
        [idea.text, idea.kind, idea.source, ...idea.tags].some((f) => f.toLowerCase().includes(q)),
    );
  const rank = (idea: Idea) => (idea.used ? 2 : idea.pinned ? 0 : 1);
  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => rank(a.idea) - rank(b.idea) || a.index - b.index)
    .map((row) => row.idea);
}

/** Tags as typed: split on commas, trimmed, no blanks or repeats. */
export const parseTags = (text: string): string[] => [
  ...new Set(
    text
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== ''),
  ),
];

export type IdeaImportPreview =
  | { readonly ok: false; readonly error: string }
  | { readonly ok: true; readonly fresh: readonly ImportedIdea[]; readonly skipped: number };

/** What importing this text would do; changes nothing. */
export function previewIdeas(text: string, state: CampaignState): IdeaImportPreview {
  const parsed = parseIdeas(text);
  if (!parsed.ok) return parsed;
  const fresh = newIdeas(parsed.ideas, new Set(state.ideaOrder));
  return { ok: true, fresh, skipped: parsed.ideas.length - fresh.length };
}

/** One socket message carries at most 1 MiB (server.ts), so a large import goes in batches. */
export const IDEA_BATCH_BYTES = 256 * 1024;

export function ideaBatches(
  ideas: readonly ImportedIdea[],
  limit: number = IDEA_BATCH_BYTES,
): ImportedIdea[][] {
  const batches: ImportedIdea[][] = [];
  let batch: ImportedIdea[] = [];
  let size = 0;
  for (const idea of ideas) {
    const bytes = new TextEncoder().encode(JSON.stringify(idea)).length;
    if (batch.length > 0 && size + bytes > limit) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(idea);
    size += bytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
