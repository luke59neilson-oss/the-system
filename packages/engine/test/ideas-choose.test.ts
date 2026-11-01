import { describe, expect, it } from 'vitest';
import { chooseIdeas, type ChoosableIdea } from '../src/ideas/choose';

const idea = (id: string, over: Partial<ChoosableIdea> = {}): ChoosableIdea => ({
  id,
  text: `Idea ${id}`,
  kind: 'other',
  tags: [],
  used: false,
  pinned: false,
  ...over,
});
const ids = (list: readonly ChoosableIdea[]) => list.map((i) => i.id);

describe('choosing ideas for a prompt (MW.3)', () => {
  it('prefers tags, then a place named in the text, then kind, then a pin', () => {
    const board = [
      idea('pin', { pinned: true }),
      idea('kind', { kind: 'npc' }),
      idea('text', { text: 'A fire at Haven' }),
      idea('tag', { tags: ['Haven'] }),
      idea('none'),
    ];
    expect(ids(chooseIdeas(board, { kind: 'npc', words: ['haven'] }, 10))).toEqual([
      'tag',
      'kind',
      'text',
      'pin',
    ]);
  });
  it('never offers a used idea, and is bounded', () => {
    const board = [
      idea('a', { pinned: true, used: true }),
      ...['b', 'c', 'd', 'e'].map((id) => idea(id, { pinned: true })),
    ];
    expect(ids(chooseIdeas(board, { words: [] }))).toEqual(['b', 'c', 'd']);
    expect(chooseIdeas(board, { words: [] }, 0)).toEqual([]);
  });
  it('blank words match nothing', () => {
    expect(chooseIdeas([idea('a')], { words: ['  ', ''] })).toEqual([]);
  });
});
