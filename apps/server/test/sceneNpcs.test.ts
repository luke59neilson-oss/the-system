import { describe, expect, it } from 'vitest';
import type { CampaignState } from '@the-system/engine';
import { keeperName, sceneNpcs } from '../src/ai/sceneNpcs';

// QF.50: who can be the NPC in the scene.
describe('scene NPCs (QF.50)', () => {
  it('reads a keeper name from the GM text', () => {
    expect(keeperName('Old Brenna: half-blind, smells of resin.')).toBe('Old Brenna');
    expect(keeperName('Old Brenna, half-blind.')).toBe('Old Brenna');
    expect(keeperName('Sal - a herbalist')).toBe('Sal');
    expect(keeperName('Zoë (tall)')).toBe('Zoë');
    expect(keeperName('')).toBeNull();
    expect(keeperName('x'.repeat(80))).toBeNull();
  });
  it('keeps a title abbreviation and refuses a description (review M1)', () => {
    expect(keeperName('Dr. Vance, a surgeon')).toBe('Dr. Vance');
    expect(keeperName('Mr. Hale: pawnbroker')).toBe('Mr. Hale');
    expect(keeperName('Tam of the Ferry: old')).toBe('Tam of the Ferry');
    expect(keeperName('A half-blind woman who sells resin')).toBeNull();
    expect(keeperName('a grumpy dwarf')).toBeNull();
  });
  it('a note tagged npc counts only when its title reads as a name (review M2, M3)', () => {
    const notes = {
      a: note('a', 'Met the ferryman', 'Long session notes.', ['npc']),
      bb: note('bb', 'Session 3 prep', 'Prep.', ['npc']),
      ccc: note('ccc', 'Wren Holloway', 'Wren hides a lantern.', ['npc', 'lore']),
    };
    const npcs = sceneNpcs({ entities: {}, shops: {}, notes } as unknown as CampaignState);
    expect(npcs.map((n) => [n.name, n.notes])).toEqual([['Wren Holloway', '']]);
  });

  const note = (id: string, title: string, body: string, tags: string[], kind = 'gm') => ({
    id,
    kind,
    author: null,
    title,
    body,
    tags,
    shareable: false,
    createdAt: `2026-10-30T0${id.length}:00:00Z`,
    updatedAt: '2026-10-30T09:00:00Z',
  });
  const state = {
    entities: {
      tam: { id: 'tam', name: 'Old Tam', label: 'the ferryman', notes: 'Bestiary notes.' },
    },
    shops: {
      s1: { id: 's1', name: 'Resin Stall', keeper: 'Old Brenna: haggles.', regionId: null },
      s2: { id: 's2', name: 'Empty', keeper: '', regionId: null },
    },
    notes: {
      a: note('a', 'Tamsin Reed', 'Scout.', ['npc']),
      bb: note('bb', 'Tam', 'Owes a debt.', ['lore', 'npc:Old Tam']),
      ccc: note('ccc', 'Casper', 'Shifty.', ['npc:Casper']),
      dddd: note('dddd', 'Party', 'Party view.', ['npc:Pip'], 'party'),
    },
  } as unknown as CampaignState;

  it('lists bestiary NPCs, shop keepers and GM-note NPCs once each', () => {
    const npcs = sceneNpcs(state);
    expect(npcs.map((n) => [n.id, n.name])).toEqual([
      ['tam', 'Old Tam'],
      ['shop:s1', 'Old Brenna'],
      ['npc:tamsin reed', 'Tamsin Reed'],
      ['npc:casper', 'Casper'],
    ]);
    expect(npcs[0]?.names).toEqual(['Old Tam', 'the ferryman']);
    // Lore stays lore (loreFor), so it does not double as notes.
    expect(npcs[0]?.notes).toBe('Bestiary notes.');
    expect(npcs[1]?.notes).toBe('Keeper of Resin Stall. Old Brenna: haggles.');
    expect(npcs[2]?.notes).toBe('Scout.');
    expect(npcs[3]?.notes).toBe('Shifty.');
  });

  it('never takes a party or journal note', () => {
    expect(sceneNpcs(state).some((n) => n.name === 'Pip')).toBe(false);
  });
});
