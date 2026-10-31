import { describe, expect, it } from 'vitest';
import {
  QUICK_LORE_MAX,
  QUICK_LORE_NOTE_MAX,
  loreFor,
  loreForRequest,
  loreLines,
  loreTags,
} from '../src/ai/quickResponses';

describe('kept lore for a generation request (MD.3)', () => {
  const at = (h: number) => `2026-10-30T${String(h).padStart(2, '0')}:00:00Z`;
  const notes = [
    { kind: 'gm', tags: ['lore', 'place:The Crown'], body: 'The Crown hums.', updatedAt: at(9) },
    { kind: 'gm', tags: ['lore', 'npc:Old Tam'], body: 'Tam owes a debt.', updatedAt: at(10) },
    { kind: 'gm', tags: ['lore', 'npc:Sal'], body: 'Sal hates boats.', updatedAt: at(11) },
    { kind: 'gm', tags: ['npc:Old Tam'], body: 'Not lore.', updatedAt: at(12) },
    { kind: 'party', tags: ['lore', 'npc:Old Tam'], body: 'Party note.', updatedAt: at(13) },
  ];
  it('takes the place and every NPC the request names, newest first', () => {
    expect(loreForRequest(notes, 'The Crown', 'a stall for OLD TAM')).toEqual([
      'Tam owes a debt.',
      'The Crown hums.',
    ]);
    expect(loreForRequest(notes, null, 'an herbalist')).toEqual([]);
  });
  it('bounds the prompt lines', () => {
    const long = Array.from({ length: 50 }, () => 'x'.repeat(100));
    const lines = loreLines(long);
    expect(lines.length).toBeLessThan(50);
    expect(lines[0]).toBe(`- ${'x'.repeat(100)}`);
  });
  it('clips a note too long for the budget and keeps the rest (review M1, QF.50)', () => {
    const lines = loreLines(['y'.repeat(4000), 'Tam owes a debt.']);
    expect(lines).toEqual([`- ${'y'.repeat(QUICK_LORE_NOTE_MAX - 1)}…`, '- Tam owes a debt.']);
  });
  it('clips the last note to what is left of the budget (QF.50)', () => {
    const lines = loreLines(['a'.repeat(350), 'b'.repeat(350), 'c'.repeat(350), 'd'.repeat(350)]);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe(`- ${'d'.repeat(QUICK_LORE_MAX - 3 * 350 - 1)}…`);
  });
  it('skips a note that would be clipped to almost nothing, then keeps a short one (QF.50)', () => {
    const lines = loreLines(['a'.repeat(390), 'b'.repeat(390), 'c'.repeat(390), 'd'.repeat(390), 'Short.']);
    expect(lines.map((l) => l.slice(2, 3))).toEqual(['a', 'b', 'c', 'S']);
  });
  it('matches an NPC name only as a whole word (review M2)', () => {
    const short = [{ kind: 'gm', tags: ['lore', 'npc:Al'], body: 'Al lies.', updatedAt: at(9) }];
    expect(loreForRequest(short, null, 'also a tamper-proof chest')).toEqual([]);
    expect(loreForRequest(short, null, 'a rival for Al.')).toEqual(['Al lies.']);
    const accented = [
      { kind: 'gm', tags: ['lore', 'npc:Zoë'], body: 'Zoë sings.', updatedAt: at(9) },
    ];
    expect(loreForRequest(accented, null, 'a song for zoë')).toEqual(['Zoë sings.']);
  });
});

// MD.3 (DESIGN §11 "Keep"): kept lore for the NPC and place, newest first;
// only GM notes tagged lore; never a player's journal or a party note.
const note = (kind: string, tags: string[], body: string, updatedAt: string) => ({
  kind,
  tags,
  body,
  updatedAt,
});

describe('kept lore for a scene (MD.3)', () => {
  const notes = [
    note(
      'gm',
      ['lore', 'npc:Old Tam'],
      'Tam lost an eye to a pale hunter.',
      '2026-10-30T10:00:00Z',
    ),
    note('gm', ['lore', 'place:The Crown'], 'The Crown hums at dawn.', '2026-10-30T11:00:00Z'),
    note('gm', ['LORE', 'npc:old tam'], 'Tam owes the ferryman.', '2026-10-30T12:00:00Z'),
    note('gm', ['npc:Old Tam'], 'Not lore: a plain GM note.', '2026-10-30T13:00:00Z'),
    note('party', ['lore', 'npc:Old Tam'], 'A party note.', '2026-10-30T14:00:00Z'),
    note('journal', ['lore', 'npc:Old Tam'], 'A journal.', '2026-10-30T15:00:00Z'),
  ];
  it('matches the NPC and place, newest first, GM lore notes only', () => {
    expect(loreFor(notes, { npc: 'Old Tam', place: 'The Crown' })).toEqual([
      'Tam owes the ferryman.',
      'The Crown hums at dawn.',
      'Tam lost an eye to a pale hunter.',
    ]);
  });
  it('is empty with no NPC or place in the scene', () => {
    expect(loreFor(notes, { npc: null, place: null })).toEqual([]);
  });
});

describe('tags for a kept answer (MD.3)', () => {
  it('tags lore with the NPC, place and session it came from', () => {
    expect(loreTags({ npc: 'Old Tam', place: 'The Crown', session: 3 })).toEqual([
      'lore',
      'npc:Old Tam',
      'place:The Crown',
      'session:3',
    ]);
    expect(loreTags({ npc: null, place: null, session: null })).toEqual(['lore']);
  });
  it('a kept note is found again for its NPC', () => {
    const tags = loreTags({ npc: 'Sal', place: null, session: 1 });
    expect(
      loreFor([{ kind: 'gm', tags, body: 'Sal hates boats.', updatedAt: 'x' }], {
        npc: 'Sal',
        place: null,
      }),
    ).toEqual(['Sal hates boats.']);
  });
});
