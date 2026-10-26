import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type CampaignState } from '@the-system/engine';
import { gmOffers, saleCommand, saleOpen, shopRows } from '../src/gm/shopsModel';

// MC.3 (DESIGN §11 "Shops"): the GM's shop list and the sale it builds.
const state = {
  rules: DEFAULT_RULES,
  regions: { crown: { id: 'crown', name: 'The Crown' } },
  items: { salve: { id: 'salve', name: 'Clotleaf Salve', rarity: 'common' } },
  shops: {
    sap: {
      id: 'sap',
      name: 'Sap & Sinew',
      regionId: 'crown',
      keeper: 'Old Brenna',
      wares: [
        { itemId: 'salve', price: 15 },
        { itemId: 'gone', price: 3 },
      ],
      hook: '',
      createdAt: '2026-10-26T06:00:00.000Z',
    },
    free: {
      id: 'free',
      name: 'Free Stall',
      regionId: null,
      keeper: '',
      wares: [{ itemId: 'salve', price: 0 }],
      hook: 'A trap.',
      createdAt: '2026-10-26T06:00:00.000Z',
    },
  },
  shopOrder: ['sap', 'free', 'missing'],
  characters: { jake: { id: 'jake', name: 'Jake' } },
  trades: {
    t1: {
      id: 't1',
      from: null,
      to: 'jake',
      give: { currency: 0, items: { salve: 1 } },
      get: { currency: 15, items: {} },
      status: 'open',
      proposedAt: '',
      closedAt: null,
    },
    t2: {
      id: 't2',
      from: null,
      to: 'jake',
      give: { currency: 0, items: { salve: 2 } },
      get: { currency: 0, items: {} },
      status: 'declined',
      proposedAt: '',
      closedAt: '',
    },
    t3: {
      id: 't3',
      from: 'jake',
      to: null,
      give: { currency: 5, items: {} },
      get: { currency: 0, items: {} },
      status: 'open',
      proposedAt: '',
      closedAt: null,
    },
  },
} as unknown as CampaignState;

describe('shops model (MC.3)', () => {
  it('lists shops in order with the place name and named wares; unknown ids drop out', () => {
    const rows = shopRows(state);
    expect(rows.map((r) => r.name)).toEqual(['Sap & Sinew', 'Free Stall']);
    expect(rows[0]).toMatchObject({ place: 'The Crown', keeper: 'Old Brenna' });
    expect(rows[0]?.wares).toEqual([
      { itemId: 'salve', name: 'Clotleaf Salve', rarity: 'common', price: 15 },
    ]);
    expect(rows[1]?.place).toBe('');
  });

  it('a campaign with no shops yet lists none', () => {
    const none = Object.fromEntries(
      Object.entries(state).filter(([k]) => k !== 'shops' && k !== 'shopOrder'),
    ) as unknown as CampaignState;
    expect(shopRows(none)).toEqual([]);
  });

  it('Sell builds a GM trade: one of the ware for its price', () => {
    const [sap, free] = shopRows(state);
    expect(saleCommand('jake', sap!.wares[0]!)).toEqual({
      type: 'trade.propose',
      characterId: null,
      to: 'jake',
      give: { items: { salve: 1 } },
      get: { currency: 15 },
    });
    expect(saleCommand('jake', free!.wares[0]!)).toMatchObject({ get: {} });
    expect(saleCommand('', sap!.wares[0]!)).toBeNull();
  });

  it("lists only the GM's open offers, and knows a ware already offered", () => {
    expect(gmOffers(state)).toEqual([
      { tradeId: 't1', characterId: 'jake', who: 'Jake', text: '[Clotleaf Salve] for 15 Credits' },
    ]);
    expect(saleOpen(state, 'jake', 'salve')).toBe(true);
    expect(saleOpen(state, 'kim', 'salve')).toBe(false);
  });
});
