// MC.3 (DESIGN §11): shops are GM-side. A shop names a keeper, a place and
// wares (library items with prices in the campaign currency) and an optional
// hook; players never receive it. A sale is a GM trade the price list fills
// in (the GM console builds it; apps/web/test/shopsModel.test.ts).
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, projectForPlayer, type Command } from '../src';
import { kit, run, testContext } from './helpers/events';

const setup: Command[] = [
  {
    type: 'campaign.create',
    name: 'Whale',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) as typeof DEFAULT_RULES,
  },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'item.define', id: 'salve', name: 'Clotleaf Salve', rarity: 'common' },
  { type: 'region.define', regionId: 'crown', name: 'The Crown' },
];

describe('shops (MC.3)', () => {
  it('the GM defines a shop with wares by item id or name; players never see it', () => {
    const c = run([
      ...setup,
      {
        type: 'shop.define',
        shopId: 'sap',
        name: 'Sap & Sinew',
        regionId: 'crown',
        keeper: 'Old Brenna, half-blind, smells of resin',
        wares: [{ item: 'Clotleaf Salve', price: 15 }],
        hook: 'She pays well for pale-hunter glands.',
      } as unknown as Command,
    ]);
    expect(c.state?.shops?.['sap']).toMatchObject({
      name: 'Sap & Sinew',
      regionId: 'crown',
      wares: [{ itemId: 'salve', price: 15 }],
    });
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('Brenna');
  });
  it('a ware naming no item is refused with its path', () => {
    const c = run(setup);
    const r = execute(
      c,
      { type: 'shop.define', name: 'X', wares: [{ item: 'Nothing', price: 1 }] } as Command,
      testContext(),
    );
    expect(r.ok ? '' : r.error).toContain('wares[0]: no item named "Nothing"');
  });
  it('a sale is a GM trade at the ware price: accepted, the item and the currency move', () => {
    const c = run([
      ...setup,
      { type: 'gift.give', characterId: null, to: 'jake', currency: 40 },
      {
        type: 'shop.define',
        shopId: 'sap',
        name: 'Sap & Sinew',
        wares: [{ item: 'salve', price: 15 }],
      } as unknown as Command,
      {
        type: 'trade.propose',
        tradeId: 't1',
        characterId: null,
        to: 'jake',
        give: { items: { salve: 1 } },
        get: { currency: 15 },
      },
      { type: 'trade.accept', tradeId: 't1', characterId: 'jake' },
    ]);
    expect(c.state?.holdings['jake']?.currency).toBe(25);
    expect(c.state?.holdings['jake']?.inventory['salve']).toBe(1);
    // The shop's list is unchanged: wares are a price list, not stock.
    expect(c.state?.shops?.['sap']?.wares).toEqual([{ itemId: 'salve', price: 15 }]);
  });
});
