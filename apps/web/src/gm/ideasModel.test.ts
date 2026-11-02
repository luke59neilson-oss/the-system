import { describe, expect, it } from 'vitest';
import type { CampaignState, Idea } from '@the-system/engine';
import { boardIdeas, ideaBatches, ideaLabel, parseTags, previewIdeas } from './ideasModel';

const idea = (id: string, over: Partial<Idea> = {}): Idea => ({
  id,
  text: `Idea ${id}`,
  kind: 'hook',
  tags: [],
  source: '',
  created: null,
  used: false,
  pinned: false,
  ...over,
});
const stateOf = (...ideas: Idea[]) =>
  ({
    ideas: Object.fromEntries(ideas.map((i) => [i.id, i])),
    ideaOrder: ideas.map((i) => i.id),
  }) as unknown as CampaignState;

describe('the Ideas board model (MW.3)', () => {
  it('orders pinned first, used last, and hides used until asked', () => {
    const s = stateOf(
      idea('a', { used: true }),
      idea('b'),
      idea('c', { pinned: true }),
      idea('d', { used: true, pinned: true }),
    );
    expect(boardIdeas(s, '', true).map((i) => i.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(boardIdeas(s, '', false).map((i) => i.id)).toEqual(['c', 'b']);
  });

  it('searches text, kind, tags and source', () => {
    const s = stateOf(
      idea('a', { text: 'The Marsh bell' }),
      idea('b', { tags: ['marsh'] }),
      idea('c', { source: 'a marsh walk' }),
      idea('d', { kind: 'twist' }),
    );
    expect(boardIdeas(s, ' MARSH ', true).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(boardIdeas(s, 'twist', true).map((i) => i.id)).toEqual(['d']);
  });

  it('previews an import: new, skipped, or the message for a wrong file', () => {
    const s = stateOf(idea('a'));
    const file = JSON.stringify({
      format: 'the-system-ideas',
      version: 1,
      ideas: [
        { id: 'a', text: 'Held' },
        { id: 'b', text: 'New' },
      ],
    });
    const p = previewIdeas(file, s);
    expect(p.ok && p.fresh.map((i) => i.id)).toEqual(['b']);
    expect(p.ok && p.skipped).toBe(1);
    expect(previewIdeas('{"format":"other"}', s)).toEqual({
      ok: false,
      error: 'This is not an ideas export file',
    });
    expect(previewIdeas('{"format":"the-system-ideas","version":2}', s).ok).toBe(false);
    const pasted = previewIdeas('One\n\nTwo\n\nOne', s);
    expect(pasted.ok && pasted.fresh.map((i) => i.text)).toEqual(['One', 'Two']);
  });

  it('splits a large import into batches a socket message can carry', () => {
    const big = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      text: 'x'.repeat(400),
      kind: 'other' as const,
      tags: [],
      source: '',
      created: null,
      used: false,
    }));
    const batches = ideaBatches(big, 1000);
    expect(batches.flat()).toHaveLength(5);
    expect(batches.length).toBeGreaterThan(1);
    expect(ideaBatches([])).toEqual([]);
    expect(ideaBatches(big.slice(0, 1), 10)).toHaveLength(1);
  });

  it('cuts labels and reads tags', () => {
    expect(ideaLabel({ text: `a\n${'b'.repeat(200)}` }).length).toBe(81);
    expect(parseTags(' river, ,sky,river ')).toEqual(['river', 'sky']);
  });
});
