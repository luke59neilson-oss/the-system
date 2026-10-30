import { describe, expect, it } from 'vitest';
import { loreFor } from '../src/ai/quickResponses';

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
