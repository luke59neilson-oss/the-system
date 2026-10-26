// MC.3 (DESIGN §11): shops are GM-side. A shop names a keeper, a place and
// wares (library items with prices in the campaign currency) and an optional
// hook; players never receive it. Work in progress: this is the first test,
// the engine side follows (see docs/PROGRESS.md hand-off).
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
});
