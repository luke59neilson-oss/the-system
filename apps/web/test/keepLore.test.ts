import { describe, expect, it } from 'vitest';
import { generatedLore, keepTags, keepText, keepTitle, loreNotes } from '../src/gm/quickModel';

// MD.3 (DESIGN §11 "Keep"): the pure helpers behind Keep and the Lore view.
describe('Keep lore (MD.3)', () => {
  it('tags a kept answer with lore, the NPC, the place and the session', () => {
    expect(keepTags({ npc: 'Old Tam', place: 'The Crown', session: 2 })).toEqual([
      'lore',
      'npc:Old Tam',
      'place:The Crown',
      'session:2',
    ]);
    // Session 0 means no session is running.
    expect(keepTags({ npc: null, place: null, session: 0 })).toEqual(['lore']);
  });

  it('starts the editable text from the line and its beats', () => {
    expect(keepText({ say: 'Tam spits.', beats: ['a debt', 'the ferryman'] })).toBe(
      'Tam spits.\n- a debt\n- the ferryman',
    );
    expect(keepText({ say: null, beats: [] })).toBe('');
  });

  it('titles the note by the NPC, then the place', () => {
    expect(keepTitle({ npc: 'Sal', place: 'The Crown' })).toBe('Sal');
    expect(keepTitle({ npc: null, place: 'The Crown' })).toBe('The Crown');
    expect(keepTitle({ npc: null, place: null })).toBe('Lore');
  });

  it('starts Keep on a generated item from its names and descriptions', () => {
    const file = {
      format: 'the-system/content',
      version: 1,
      gmNotes: [{ title: 'Mira the herbalist', body: 'Owes the  ferryman.' }],
      items: [{ name: 'Bitterroot salve', description: 'Heals a little.' }, { name: 'Plain' }],
      shops: 'not a list',
    };
    expect(generatedLore(file)).toEqual({
      text: 'Mira the herbalist: Owes the ferryman.\nBitterroot salve: Heals a little.\nPlain',
      names: ['Mira the herbalist', 'Bitterroot salve', 'Plain'],
    });
    expect(generatedLore(null)).toEqual({ text: '', names: [] });
  });

  it('lists GM lore notes only, newest first', () => {
    const n = (id: string, kind: string, tags: string[], updatedAt: string) => ({
      id,
      kind,
      tags,
      updatedAt,
    });
    const out = loreNotes([
      n('a', 'gm', ['lore'], '2026-10-30T10:00:00Z'),
      n('b', 'gm', ['Lore', 'npc:Sal'], '2026-10-30T12:00:00Z'),
      n('c', 'gm', ['npc:Sal'], '2026-10-30T13:00:00Z'),
      n('d', 'party', ['lore'], '2026-10-30T14:00:00Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

// MD.3 review M3: the Lore view retags a note to another NPC or place.
describe('Lore view retagging (MD.3 review M3)', () => {
  it('reads the NPC and place a note is tagged to', async () => {
    const { loreScope } = await import('../src/gm/quickModel');
    expect(loreScope(['lore', 'NPC:Old Tam', 'place:The Crown', 'session:2'])).toEqual({
      npc: 'Old Tam',
      place: 'The Crown',
    });
    expect(loreScope(['lore'])).toEqual({ npc: '', place: '' });
  });

  it('replaces the NPC and place tags and keeps every other tag', async () => {
    const { retagLore } = await import('../src/gm/quickModel');
    expect(
      retagLore(['lore', 'npc:Old Tam', 'place:The Crown', 'session:2', 'debt'], {
        npc: ' Sal ',
        place: 'Rake Canyons',
      }),
    ).toEqual(['lore', 'npc:Sal', 'place:Rake Canyons', 'session:2', 'debt']);
    // Blank removes; the lore tag is never lost, even if missing.
    expect(retagLore(['npc:Sal', 'session:1'], { npc: '', place: '' })).toEqual([
      'lore',
      'session:1',
    ]);
    expect(retagLore(['Lore', 'PLACE:x'], { npc: 'A', place: '' })).toEqual(['Lore', 'npc:A']);
  });
});
