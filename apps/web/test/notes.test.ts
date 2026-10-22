import { describe, expect, it } from 'vitest';
import type { PlayerNote } from '@the-system/engine';
import {
  MAX_TAGS,
  editedLabel,
  isOwnNote,
  noteLabel,
  noteTitle,
  parseInline,
  parseMarkdown,
  parseTags,
  tagProblem,
  visibleNotes,
} from '../src/player/notes';

const note = (over: Partial<PlayerNote>): PlayerNote => ({
  id: 'n',
  kind: 'journal',
  author: 'jake',
  title: '',
  body: '',
  tags: [],
  shareable: false,
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
  ...over,
});

describe('notes window helpers (M3.10)', () => {
  const notes = [
    note({ id: 'a', title: 'Day 1', body: 'Casper hides a key', tags: ['npc:Casper'] }),
    note({
      id: 'b',
      kind: 'party',
      author: null,
      body: 'Camp at the river',
      tags: ['region:river'],
      shareable: true,
      updatedAt: '2026-10-22T12:00:00.000Z',
    }),
    note({ id: 'c', kind: 'party', author: 'miranda', body: 'Casper owes us', shareable: true }),
  ];

  it('filters by kind, words and tag; newest change first', () => {
    expect(visibleNotes(notes, 'all', '', null).map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(visibleNotes(notes, 'journal', '', null).map((n) => n.id)).toEqual(['a']);
    expect(visibleNotes(notes, 'party', '', null).map((n) => n.id)).toEqual(['b', 'c']);
    expect(visibleNotes(notes, 'all', 'casper', null).map((n) => n.id)).toEqual(['c', 'a']);
    expect(visibleNotes(notes, 'all', '', 'NPC:casper').map((n) => n.id)).toEqual(['a']);
    expect(visibleNotes(notes, 'party', 'casper', null).map((n) => n.id)).toEqual(['c']);
    // Same timestamp: the later-created note first, whatever the ids.
    const tie = [note({ id: 'z' }), note({ id: 'a' }), note({ id: 'm' })];
    expect(visibleNotes(tie, 'all', '', null).map((n) => n.id)).toEqual(['m', 'a', 'z']);
  });

  it('parses comma-separated tags, dropping blanks and duplicates in any case', () => {
    expect(parseTags(' npc:Casper,, region:forest ,NPC:casper,  a  b ')).toEqual([
      'npc:Casper',
      'region:forest',
      'a b',
    ]);
    expect(parseTags('')).toEqual([]);
    expect(tagProblem(['x'])).toBeNull();
    expect(tagProblem(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toContain(
      'At most',
    );
    expect(tagProblem(['x'.repeat(61)])).toContain('characters');
  });

  it('labels notes and lets players change only their own', () => {
    const names = { miranda: 'Miranda', jake: 'Jake' };
    expect(noteLabel(notes[0] as PlayerNote, 'jake', names)).toBe('Journal · private');
    expect(noteLabel({ ...(notes[0] as PlayerNote), shareable: true }, 'jake', names)).toBe(
      'Journal · shared with the GM',
    );
    expect(noteLabel(notes[1] as PlayerNote, 'jake', names)).toBe('Party · by the GM');
    expect(noteLabel(notes[2] as PlayerNote, 'jake', names)).toBe('Party · by Miranda');
    expect(noteLabel(notes[2] as PlayerNote, 'miranda', names)).toBe('Party · by you');
    expect(noteLabel({ ...(notes[2] as PlayerNote), author: 'gone' }, 'jake', names)).toBe(
      'Party · by a former party member',
    );
    expect(isOwnNote(notes[2] as PlayerNote, 'miranda')).toBe(true);
    expect(isOwnNote(notes[1] as PlayerNote, 'jake')).toBe(false);
  });

  it('titles untitled notes from their first line', () => {
    expect(noteTitle({ title: 'Day 1', body: 'x' })).toBe('Day 1');
    expect(noteTitle({ title: ' ', body: '## **Camp** rules\nmore' })).toBe('Camp rules');
    expect(noteTitle({ title: '', body: 'x'.repeat(80) })).toHaveLength(60);
    expect(noteTitle({ title: '', body: '' })).toBe('Untitled');
  });

  it('shows the time for today and the date otherwise', () => {
    const now = new Date('2026-10-22T15:00:00');
    expect(editedLabel(new Date('2026-10-22T09:05:00').toISOString(), now)).toMatch(/9|09/);
    expect(editedLabel(new Date('2026-10-02T09:05:00').toISOString(), now)).toMatch(/2/);
    expect(editedLabel('nope', now)).toBe('');
  });
});

describe('Markdown subset', () => {
  it('parses headings, lists, quotes and paragraphs with line breaks', () => {
    expect(
      parseMarkdown('# Day 1\nWe met **Casper**.\nHe lied.\n\n- one\n- *two*\n1. first\n> quoted'),
    ).toEqual([
      { kind: 'heading', level: 1, inlines: [{ kind: 'text', text: 'Day 1' }] },
      {
        kind: 'paragraph',
        lines: [
          [
            { kind: 'text', text: 'We met ' },
            { kind: 'strong', text: 'Casper' },
            { kind: 'text', text: '.' },
          ],
          [{ kind: 'text', text: 'He lied.' }],
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'one' }], [{ kind: 'em', text: 'two' }]],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'first' }]] },
      { kind: 'quote', lines: [[{ kind: 'text', text: 'quoted' }]] },
    ]);
    expect(parseMarkdown('###### deep')[0]).toMatchObject({ kind: 'heading', level: 3 });
    expect(parseMarkdown('  \n\n')).toEqual([]);
  });

  it('keeps HTML, links and unmatched markers as plain text', () => {
    const html = '<img src=x onerror=alert(1)> [x](javascript:alert(1)) 2 * 3 snake_case_name';
    expect(parseInline(html)).toEqual([{ kind: 'text', text: html }]);
    expect(parseInline('`a*b*` and __b__ and _i_')).toEqual([
      { kind: 'code', text: 'a*b*' },
      { kind: 'text', text: ' and ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'i' },
    ]);
  });
});
