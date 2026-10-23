import { describe, expect, it } from 'vitest';
import type { ItemDef } from '@the-system/engine';
import {
  adjustCommand,
  emptyItemDraft,
  itemDraftOf,
  itemSaveCommand,
  libraryItems,
  parseBonuses,
} from '../src/gm/itemLibraryModel';

// M6.1 item library form helpers (DESIGN §4, §7: items give flat bonuses only).

const stats = [{ id: 'strength' }, { id: 'agility' }, { id: 'vitality' }];
const rarities = [
  { id: 'common', name: 'Common' },
  { id: 'rare', name: 'Rare' },
];
const charm: ItemDef = {
  id: 'charm',
  name: 'Bone Charm',
  rarity: 'common',
  description: 'A knuckle on a cord.',
  slot: 'necklace',
  bonuses: [
    { stat: 'strength', flat: 2 },
    { stat: 'vitality', flat: 5 },
  ],
};

describe('item library model (M6.1)', () => {
  it('a new item defines name, rarity, slot and flat bonuses in stat order', () => {
    const draft = {
      ...emptyItemDraft(rarities),
      name: '  Gale Boots ',
      slot: 'boots',
      bonuses: { vitality: '3', agility: '+4', strength: '0' },
    };
    expect(itemSaveCommand(draft, null, stats)).toEqual({
      type: 'item.define',
      name: 'Gale Boots',
      rarity: 'common',
      description: '',
      slot: 'boots',
      bonuses: [
        { stat: 'agility', flat: 4 },
        { stat: 'vitality', flat: 3 },
      ],
    });
  });

  it('refuses a blank name or a bonus that is not a whole number', () => {
    expect(itemSaveCommand(emptyItemDraft(rarities), null, stats)).toBeNull();
    const draft = { ...emptyItemDraft(rarities), name: 'X', bonuses: { agility: '1.5' } };
    expect(parseBonuses(draft, stats)).toBeNull();
    expect(itemSaveCommand(draft, null, stats)).toBeNull();
  });

  it('an edit sends only what changed; an unchanged draft sends nothing', () => {
    const draft = itemDraftOf(charm);
    expect(draft.slot).toBe('necklace');
    expect(itemSaveCommand(draft, charm, stats)).toBeNull();
    expect(itemSaveCommand({ ...draft, rarity: 'rare' }, charm, stats)).toEqual({
      type: 'item.edit',
      itemId: 'charm',
      rarity: 'rare',
    });
    expect(
      itemSaveCommand(
        { ...draft, slot: '', bonuses: { ...draft.bonuses, vitality: '' } },
        charm,
        stats,
      ),
    ).toEqual({
      type: 'item.edit',
      itemId: 'charm',
      slot: null,
      bonuses: [{ stat: 'strength', flat: 2 }],
    });
  });

  it('filters by name or rarity name and skips missing ids', () => {
    const state = {
      items: { charm },
      itemOrder: ['charm', 'ghost'],
      rules: { skills: { rarities } },
    };
    expect(libraryItems(state, '')).toEqual([charm]);
    expect(libraryItems(state, 'COMMON')).toEqual([charm]);
    expect(libraryItems(state, 'rare')).toEqual([]);
  });

  it('give and take are signed holdings adjustments of a positive count', () => {
    expect(adjustCommand('jake', 'charm', '2', 1)).toEqual({
      type: 'holdings.adjust',
      characterId: 'jake',
      items: { charm: 2 },
    });
    expect(adjustCommand('jake', 'charm', ' 1 ', -1)).toMatchObject({ items: { charm: -1 } });
    expect(adjustCommand('jake', 'charm', '0', 1)).toBeNull();
    expect(adjustCommand('jake', 'charm', '-3', 1)).toBeNull();
  });
});
