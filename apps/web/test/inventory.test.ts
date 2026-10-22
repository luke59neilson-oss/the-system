import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  defaultRules,
  projectRules,
  type PlayerInventory,
  type PlayerItem,
} from '@the-system/engine';
import {
  bonusText,
  bundleText,
  equipTarget,
  itemLabel,
  openTrades,
  parties,
  partyName,
  slotRows,
  wholeNumber,
} from '../src/player/inventory';
import { notificationText } from '../src/format';
import { isQueued, matchesFilter } from '../src/player/history';

const rules = projectRules(defaultRules());
const ring: PlayerItem = {
  id: 'ring',
  name: 'Ring of Haste',
  rarity: 'rare',
  description: '',
  slot: 'ring',
  bonuses: [{ stat: 'agility', flat: 5, percent: 0.05 }],
};
const potion: PlayerItem = {
  id: 'potion',
  name: 'Potion',
  rarity: 'common',
  description: '',
  slot: null,
  bonuses: [],
};
const inv = (over: Partial<PlayerInventory> = {}): PlayerInventory => ({
  currency: 40,
  items: { ring: 1, potion: 3 },
  equipped: {},
  trades: [],
  itemDefs: { ring, potion },
  ...over,
});
const view = {
  viewerId: 'jake',
  party: [{ id: 'kim', name: 'Kim' }],
} as unknown as Parameters<typeof partyName>[0] & Parameters<typeof parties>[0];

describe('inventory helpers (M3.7)', () => {
  it('labels items with rarity and bonuses in display units', () => {
    expect(itemLabel(rules, ring, 'ring')).toBe('[Ring of Haste (Rare)]');
    expect(itemLabel(rules, undefined, 'x')).toBe('[x]');
    expect(bonusText(rules, ring)).toBe('Agility +0.5, +5%');
    expect(
      bonusText(rules, { ...ring, bonuses: [{ stat: 'vitality', flat: -10, percent: -0.1 }] }),
    ).toBe('Vitality −1.0, −10%');
  });

  it('equips into the first empty slot, else swaps the first; never for unwearables', () => {
    expect(equipTarget(rules, inv(), ring)).toEqual({ slot: 'ring', index: 0 });
    expect(equipTarget(rules, inv({ equipped: { 'ring:0': 'ring' } }), ring)).toEqual({
      slot: 'ring',
      index: 1,
    });
    expect(
      equipTarget(rules, inv({ equipped: { 'ring:0': 'ring', 'ring:1': 'ring' } }), ring),
    ).toEqual({ slot: 'ring', index: 0 });
    expect(equipTarget(rules, inv(), potion)).toBeNull();
  });

  it('lists every slot from the rules with what is worn', () => {
    const rows = slotRows(rules, inv({ equipped: { 'ring:1': 'ring' } }));
    const slots = DEFAULT_RULES.economy.equipmentSlots.reduce((a, s) => a + s.count, 0);
    expect(rows).toHaveLength(slots);
    expect(rows.find((r) => r.key === 'ring:1')).toMatchObject({ label: 'Ring 2', itemId: 'ring' });
    expect(rows.find((r) => r.key === 'ring:0')?.itemId).toBeNull();
  });

  it('describes bundles and splits open trades by who acts', () => {
    expect(bundleText(rules, inv(), { currency: 30, items: { potion: 2, ring: 1 } })).toBe(
      '[Potion (Common)] ×2, [Ring of Haste (Rare)] and 30 Credits',
    );
    expect(bundleText(rules, inv(), { currency: 0, items: {} })).toBe('nothing');
    const t = (id: string, from: string | null, to: string | null, status = 'open' as const) => ({
      id,
      from,
      to,
      give: { currency: 1, items: {} },
      get: { currency: 0, items: {} },
      status,
      proposedAt: '',
      closedAt: null,
    });
    const split = openTrades(
      inv({
        trades: [
          t('a', 'kim', 'jake'),
          t('b', 'jake', null),
          { ...t('c', 'jake', 'kim'), status: 'declined' },
        ],
      }),
      'jake',
    );
    expect(split.incoming.map((x) => x.id)).toEqual(['a']);
    expect(split.outgoing.map((x) => x.id)).toEqual(['b']);
    expect(split.closed.map((x) => x.id)).toEqual(['c']);
  });

  it('names parties and parses whole numbers', () => {
    expect(parties(view)).toEqual([
      { id: null, name: 'the GM' },
      { id: 'kim', name: 'Kim' },
    ]);
    expect(partyName(view, null)).toBe('the GM');
    expect(partyName(view, 'jake')).toBe('you');
    expect(partyName(view, 'kim')).toBe('Kim');
    expect(wholeNumber('3', 5)).toBe(3);
    expect(wholeNumber(' 0 ', 5)).toBe(0);
    for (const bad of ['', '-1', '1.5', '6', 'x', '1e3']) expect(wholeNumber(bad, 5)).toBeNull();
  });

  it('formats gift and trade notices, queues them and filters them together', () => {
    const gift = {
      kind: 'gift' as const,
      characterId: 'jake',
      from: 'Kim',
      currency: 30,
      currencyName: 'Credits',
      items: [
        { name: 'Potion', count: 2 },
        { name: 'Ring', count: 1 },
      ],
    };
    expect(notificationText(gift)).toBe('You received [Potion] ×2, [Ring] and 30 Credits from Kim');
    expect(notificationText({ ...gift, from: null, items: [], currency: 5 })).toBe(
      'You received 5 Credits from the GM',
    );
    const trade = {
      kind: 'trade' as const,
      characterId: 'jake',
      action: 'proposed' as const,
      other: 'Kim',
    };
    expect(notificationText(trade)).toBe('Kim offers you a trade');
    expect(notificationText({ ...trade, action: 'accepted', other: null })).toBe(
      'The GM accepted your trade',
    );
    expect(notificationText({ ...trade, action: 'declined' })).toBe('Kim declined your trade');
    expect(notificationText({ ...trade, action: 'cancelled' })).toBe('Kim withdrew a trade offer');
    expect(isQueued(gift) && isQueued(trade)).toBe(true);
    expect(matchesFilter(gift, 'items') && matchesFilter(trade, 'items')).toBe(true);
    expect(matchesFilter(gift, 'dings')).toBe(false);
  });
});
