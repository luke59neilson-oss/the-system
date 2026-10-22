import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  characterEffectiveStats,
  effectiveStats,
  execute,
  holdingsOf,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
const ring: Command = {
  type: 'item.define',
  id: 'ring',
  name: 'Ring of Haste',
  rarity: 'uncommon',
  slot: 'ring',
  bonuses: [{ stat: 'agility', flat: 10, percent: 0.1 }],
};
const potion: Command = { type: 'item.define', id: 'potion', name: 'Potion', rarity: 'common' };
const bow: Command = {
  type: 'item.define',
  id: 'bow',
  name: 'Bow',
  rarity: 'rare',
  slot: 'mainHand',
  bonuses: [{ stat: 'agility', percent: 0.2 }],
};

const ctx = testContext('t');
const base = (): Campaign =>
  run(
    [
      created,
      make('jake', 'Jake'),
      make('kim', 'Kim'),
      ring,
      potion,
      bow,
      {
        type: 'holdings.adjust',
        characterId: 'jake',
        currency: 100,
        items: { ring: 2, potion: 3 },
      },
      { type: 'holdings.adjust', characterId: 'kim', currency: 50, items: { bow: 1 } },
    ],
    ctx,
  );

const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});

function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}

const held = (c: Campaign, id: string) => {
  if (!c.state) throw new Error('no state');
  return holdingsOf(c.state, id);
};

describe('item library', () => {
  it('defines items with rarity, slot and bonuses from the rules', () => {
    const c = base();
    expect(c.state?.itemOrder).toEqual(['ring', 'potion', 'bow']);
    expect(c.state?.items['potion']).toEqual({
      id: 'potion',
      name: 'Potion',
      rarity: 'common',
      description: '',
      slot: null,
      bonuses: [],
    });
  });

  it.each([
    [{ rarity: 'nope' }, 'Unknown rarity'],
    [{ rarity: 'divine' }, 'reserved'],
    [{ slot: 'tail' }, 'Unknown equipment slot'],
    [{ bonuses: [{ stat: 'luck', flat: 1 }] }, 'Unknown stat'],
    [{ bonuses: [{ stat: 'agility' }] }, 'neither flat nor percent'],
    [
      {
        bonuses: [
          { stat: 'agility', flat: 1 },
          { stat: 'agility', flat: 2 },
        ],
      },
      'listed twice',
    ],
    [{ name: ' ' }, 'name'],
    [{ id: 'ring' }, 'already exists'],
  ])('rejects a bad definition %j', (change, reason) => {
    expect(reject(base(), { ...ring, id: 'x', ...change } as Command)).toContain(reason);
  });

  it('rarity edits change every copy; a slot change cannot strand an equipped copy', () => {
    let c = base();
    expect(reject(c, { type: 'item.edit', itemId: 'ring' })).toContain('nothing to change');
    c = ok(c, { type: 'item.edit', itemId: 'ring', rarity: 'epic' });
    expect(c.state?.items['ring']).toMatchObject({ rarity: 'epic', name: 'Ring of Haste' });
    expect(reject(c, { type: 'item.edit', itemId: 'ring', rarity: 'divine' })).toContain(
      'reserved',
    );
    expect(reject(c, { type: 'item.edit', itemId: 'ghost', rarity: 'rare' })).toContain(
      'unknown item',
    );
    c = ok(c, { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' });
    expect(reject(c, { type: 'item.edit', itemId: 'ring', slot: 'necklace' })).toContain(
      'unequip it first',
    );
    expect(reject(c, { type: 'item.edit', itemId: 'ring', slot: null })).toContain(
      'unequip it first',
    );
    // Unequipped copies may change slot freely.
    c = ok(c, { type: 'item.edit', itemId: 'potion', slot: 'necklace' });
    expect(c.state?.items['potion']?.slot).toBe('necklace');
  });

  it('players cannot define or edit items', () => {
    expect(reject(base(), { ...ring, id: 'x' }, player('jake'))).toContain('only the GM');
    expect(
      reject(base(), { type: 'item.edit', itemId: 'ring', rarity: 'rare' }, player('jake')),
    ).toContain('only the GM');
  });
});

describe('holdings: no negative balances or stacks', () => {
  it('GM gives and takes; empty stacks disappear', () => {
    let c = base();
    expect(held(c, 'jake')).toEqual({
      currency: 100,
      inventory: { ring: 2, potion: 3 },
      equipped: {},
    });
    c = ok(c, {
      type: 'holdings.adjust',
      characterId: 'jake',
      currency: -100,
      items: { potion: -3 },
    });
    expect(held(c, 'jake')).toEqual({ currency: 0, inventory: { ring: 2 }, equipped: {} });
  });

  it('refuses to go below zero and changes nothing', () => {
    const c = base();
    expect(reject(c, { type: 'holdings.adjust', characterId: 'jake', currency: -101 })).toContain(
      'Not enough Credits',
    );
    expect(
      reject(c, {
        type: 'holdings.adjust',
        characterId: 'jake',
        currency: 5,
        items: { potion: -4 },
      }),
    ).toContain('Not enough [Potion]');
    expect(reject(c, { type: 'holdings.adjust', characterId: 'jake' })).toContain(
      'nothing to adjust',
    );
    expect(
      reject(c, { type: 'holdings.adjust', characterId: 'jake', items: { ghost: 1 } }),
    ).toContain('unknown item');
    expect(
      reject(c, { type: 'holdings.adjust', characterId: 'jake', items: { potion: 0 } }),
    ).toContain('must not be 0');
    expect(reject(c, { type: 'holdings.adjust', characterId: 'ghost', currency: 1 })).toContain(
      'unknown character',
    );
    expect(held(c, 'jake').currency).toBe(100);
  });

  it('players cannot adjust holdings, even their own', () => {
    expect(
      reject(base(), { type: 'holdings.adjust', characterId: 'jake', currency: 5 }, player('jake')),
    ).toContain('only the GM');
  });
});

describe('gifts', () => {
  it('moves currency and items atomically between characters and the GM', () => {
    let c = base();
    c = ok(
      c,
      { type: 'gift.give', characterId: 'jake', to: 'kim', currency: 30, items: { potion: 2 } },
      player('jake'),
    );
    expect(held(c, 'jake')).toMatchObject({ currency: 70, inventory: { ring: 2, potion: 1 } });
    expect(held(c, 'kim')).toMatchObject({ currency: 80, inventory: { bow: 1, potion: 2 } });
    // To the GM: leaves play. From the GM: comes from nowhere.
    c = ok(c, { type: 'gift.give', characterId: 'kim', to: null, currency: 80 }, player('kim'));
    expect(held(c, 'kim').currency).toBe(0);
    c = ok(c, { type: 'gift.give', characterId: null, to: 'kim', items: { ring: 1 } });
    expect(held(c, 'kim').inventory).toEqual({ bow: 1, potion: 2, ring: 1 });
  });

  it('is all or nothing and never negative', () => {
    const c = base();
    expect(
      reject(
        c,
        { type: 'gift.give', characterId: 'jake', to: 'kim', currency: 10, items: { bow: 1 } },
        player('jake'),
      ),
    ).toContain('Not enough [Bow]');
    expect(held(c, 'jake').currency).toBe(100);
    expect(reject(c, { type: 'gift.give', characterId: 'jake', to: 'kim' })).toContain(
      'needs currency or items',
    );
    expect(
      reject(c, { type: 'gift.give', characterId: 'jake', to: 'jake', currency: 1 }),
    ).toContain('must differ');
    expect(reject(c, { type: 'gift.give', characterId: null, to: null, currency: 1 })).toContain(
      'must differ',
    );
  });

  it('a player gives only from their own inventory and cannot give as the GM', () => {
    const c = base();
    expect(
      reject(c, { type: 'gift.give', characterId: 'jake', to: 'kim', currency: 1 }, player('kim')),
    ).toContain('own character');
    expect(
      reject(c, { type: 'gift.give', characterId: null, to: 'kim', currency: 1 }, player('kim')),
    ).toContain('own character');
  });

  it('equipped items cannot be given until unequipped', () => {
    let c = run([{ type: 'holdings.adjust', characterId: 'kim', items: { ring: 1 } }], ctx, base());
    c = ok(c, { type: 'item.equip', characterId: 'kim', itemId: 'bow', slot: 'mainHand' });
    expect(
      reject(c, { type: 'gift.give', characterId: 'kim', to: 'jake', items: { bow: 1 } }),
    ).toContain('Not enough [Bow]');
  });

  it('an undo that a later transfer depends on is refused', () => {
    let c = ok(base(), { type: 'gift.give', characterId: 'jake', to: 'kim', currency: 100 });
    const giftId = c.events[c.events.length - 1]?.id ?? '';
    c = ok(c, { type: 'gift.give', characterId: 'kim', to: null, currency: 150 });
    expect(reject(c, { type: 'event.undo', eventId: giftId })).toContain('depends on it');
  });
});

describe('equipment', () => {
  it('has the 12 slots of DESIGN §7 from the rules', () => {
    const slots = DEFAULT_RULES.economy.equipmentSlots;
    expect(slots.reduce((n, s) => n + s.count, 0)).toBe(12);
    expect(slots.map((s) => s.id)).toEqual([
      'ring',
      'necklace',
      'chest',
      'legs',
      'boots',
      'bracers',
      'mask',
      'cloak',
      'gloves',
      'mainHand',
      'offHand',
    ]);
  });

  it('equips from the inventory, two rings, and unequips back', () => {
    let c = base();
    c = ok(
      c,
      { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' },
      player('jake'),
    );
    c = ok(c, {
      type: 'item.equip',
      characterId: 'jake',
      itemId: 'ring',
      slot: 'ring',
      index: 1,
    });
    expect(held(c, 'jake')).toMatchObject({
      inventory: { potion: 3 },
      equipped: { 'ring:0': 'ring', 'ring:1': 'ring' },
    });
    c = ok(
      c,
      { type: 'item.unequip', characterId: 'jake', slot: 'ring', index: 0 },
      player('jake'),
    );
    expect(held(c, 'jake')).toMatchObject({
      inventory: { potion: 3, ring: 1 },
      equipped: { 'ring:1': 'ring' },
    });
  });

  it('swaps: the item already in the slot returns to the inventory', () => {
    let c = run(
      [
        { type: 'item.define', id: 'bow2', name: 'Longbow', rarity: 'rare', slot: 'mainHand' },
        { type: 'holdings.adjust', characterId: 'kim', items: { bow2: 1 } },
        { type: 'item.equip', characterId: 'kim', itemId: 'bow', slot: 'mainHand' },
      ],
      ctx,
      base(),
    );
    c = ok(c, { type: 'item.equip', characterId: 'kim', itemId: 'bow2', slot: 'mainHand' });
    expect(held(c, 'kim')).toMatchObject({
      inventory: { bow: 1 },
      equipped: { 'mainHand:0': 'bow2' },
    });
  });

  it.each([
    [{ itemId: 'potion', slot: 'ring' }, 'cannot be equipped'],
    [{ itemId: 'ring', slot: 'necklace' }, 'goes in a ring slot'],
    [{ itemId: 'ring', slot: 'ring', index: 2 }, 'Ring slot 3 does not exist'],
    [{ itemId: 'ring', slot: 'tail' }, 'Unknown equipment slot'],
    [{ itemId: 'bow', slot: 'mainHand' }, 'No [Bow] in the inventory'],
    [{ itemId: 'ghost', slot: 'ring' }, 'unknown item'],
  ])('rejects %j', (change, reason) => {
    expect(
      reject(base(), { type: 'item.equip', characterId: 'jake', ...change } as Command),
    ).toContain(reason);
  });

  it('rejects equipping the same item twice in a slot and unequipping an empty slot', () => {
    const c = ok(base(), { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' });
    expect(
      reject(c, { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' }),
    ).toContain('already equipped');
    expect(reject(c, { type: 'item.unequip', characterId: 'jake', slot: 'cloak' })).toContain(
      'Nothing is equipped',
    );
  });

  it("a player cannot equip another character's items", () => {
    expect(
      reject(
        base(),
        { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' },
        player('kim'),
      ),
    ).toContain('own character');
  });
});

describe('item effects reach effective stats in the M1.6 order', () => {
  it('equipped bonuses only, base → flat → percent → cap', () => {
    let c = run(
      [
        { type: 'character.setStats', characterId: 'jake', stats: { agility: 100 } },
        { type: 'holdings.adjust', characterId: 'jake', items: { bow: 1 } },
      ],
      ctx,
      base(),
    );
    const state = () => c.state ?? (null as never);
    // Held but not equipped: no effect.
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(100);
    c = ok(c, { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' });
    // (100 + 10) × 1.10 = 121
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(121);
    c = ok(c, { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring', index: 1 });
    // (100 + 20) × 1.20 = 144
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(144);
    c = ok(c, { type: 'item.equip', characterId: 'jake', itemId: 'bow', slot: 'mainHand' });
    // Percent 0.1 + 0.1 + 0.2 = 0.4, capped at +25%: (100 + 20) × 1.25 = 150
    expect(DEFAULT_RULES.bonuses.percentCapPerStat).toBe(0.25);
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(150);
    // Matches M1.6 effectiveStats with the same sources.
    const jake = state().characters['jake'];
    expect(characterEffectiveStats(state(), 'jake')).toEqual(
      effectiveStats(state().rules, jake?.stats ?? {}, [
        {
          id: 'a',
          kind: 'item',
          name: 'r',
          bonuses: [{ stat: 'agility', flat: 10, percent: 0.1 }],
        },
        {
          id: 'b',
          kind: 'item',
          name: 'r',
          bonuses: [{ stat: 'agility', flat: 10, percent: 0.1 }],
        },
        { id: 'c', kind: 'item', name: 'b', bonuses: [{ stat: 'agility', percent: 0.2 }] },
      ]),
    );
    // Base stats are untouched; unequipping removes the bonus.
    expect(jake?.stats['agility']).toBe(100);
    c = ok(c, { type: 'item.unequip', characterId: 'jake', slot: 'mainHand' });
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(144);
    // An item edit reaches every equipped copy.
    c = ok(c, { type: 'item.edit', itemId: 'ring', bonuses: [{ stat: 'agility', flat: 5 }] });
    expect(characterEffectiveStats(state(), 'jake')['agility']).toBe(110);
  });
});

describe('trades', () => {
  const offer: Command = {
    type: 'trade.propose',
    tradeId: 'tr1',
    characterId: 'jake',
    to: 'kim',
    give: { currency: 20, items: { potion: 1 } },
    get: { items: { bow: 1 } },
  };

  it('accept moves both sides at once', () => {
    let c = ok(base(), offer, player('jake'));
    expect(c.state?.trades['tr1']).toMatchObject({ status: 'open', from: 'jake', to: 'kim' });
    // Nothing moves on proposal.
    expect(held(c, 'jake').currency).toBe(100);
    c = ok(c, { type: 'trade.accept', tradeId: 'tr1', characterId: 'kim' }, player('kim'));
    expect(c.state?.trades['tr1']).toMatchObject({ status: 'accepted' });
    expect(c.state?.trades['tr1']?.closedAt).not.toBeNull();
    expect(held(c, 'jake')).toMatchObject({
      currency: 80,
      inventory: { ring: 2, potion: 2, bow: 1 },
    });
    expect(held(c, 'kim')).toMatchObject({ currency: 70, inventory: { potion: 1 } });
  });

  it('decline and cancel close the trade without moving anything', () => {
    const c = ok(base(), offer);
    const declined = ok(
      c,
      { type: 'trade.decline', tradeId: 'tr1', characterId: 'kim' },
      player('kim'),
    );
    expect(declined.state?.trades['tr1']?.status).toBe('declined');
    expect(declined.state?.holdings).toEqual(c.state?.holdings);
    const cancelled = ok(
      c,
      { type: 'trade.cancel', tradeId: 'tr1', characterId: 'jake' },
      player('jake'),
    );
    expect(cancelled.state?.trades['tr1']?.status).toBe('cancelled');
    for (const type of ['trade.accept', 'trade.decline', 'trade.cancel'] as const) {
      expect(reject(cancelled, { type, tradeId: 'tr1', characterId: 'kim' })).toContain(
        'already cancelled',
      );
    }
  });

  it('only the counterparty answers and only the proposer cancels', () => {
    const c = ok(base(), offer);
    expect(reject(c, { type: 'trade.accept', tradeId: 'tr1', characterId: 'jake' })).toContain(
      'only "kim" can answer',
    );
    expect(reject(c, { type: 'trade.decline', tradeId: 'tr1', characterId: null })).toContain(
      'only "kim" can answer',
    );
    expect(reject(c, { type: 'trade.cancel', tradeId: 'tr1', characterId: 'kim' })).toContain(
      'only "jake" can cancel',
    );
    // A player cannot answer on someone else's behalf.
    expect(
      reject(c, { type: 'trade.accept', tradeId: 'tr1', characterId: 'kim' }, player('jake')),
    ).toContain('own character');
    expect(reject(c, { type: 'trade.accept', tradeId: 'nope', characterId: 'kim' })).toContain(
      'unknown trade',
    );
  });

  it('accept is atomic: if either side no longer has its part, nothing moves', () => {
    let c = ok(base(), offer);
    // Kim gives the bow away before answering.
    c = ok(c, { type: 'gift.give', characterId: 'kim', to: null, items: { bow: 1 } });
    expect(reject(c, { type: 'trade.accept', tradeId: 'tr1', characterId: 'kim' })).toContain(
      'Not enough [Bow]',
    );
    expect(held(c, 'jake')).toMatchObject({ currency: 100, inventory: { ring: 2, potion: 3 } });
    expect(c.state?.trades['tr1']?.status).toBe('open');
    // And the proposer's side is re-checked too.
    let d = ok(base(), offer);
    d = ok(d, { type: 'holdings.adjust', characterId: 'jake', currency: -95 });
    expect(reject(d, { type: 'trade.accept', tradeId: 'tr1', characterId: 'kim' })).toContain(
      'Not enough Credits',
    );
    expect(held(d, 'kim')).toMatchObject({ currency: 50, inventory: { bow: 1 } });
  });

  it('each side must already hold its part; receiving it in the same trade does not count', () => {
    const c = ok(base(), {
      type: 'trade.propose',
      tradeId: 'loop',
      characterId: 'kim',
      to: 'jake',
      give: { items: { bow: 1 } },
      get: { items: { bow: 1 } },
    });
    expect(reject(c, { type: 'trade.accept', tradeId: 'loop', characterId: 'jake' })).toContain(
      'Not enough [Bow]',
    );
  });

  it('the proposer must hold the offer; trades need two parties and something on them', () => {
    const c = base();
    expect(reject(c, { ...offer, give: { currency: 101 } })).toContain('Not enough Credits');
    expect(reject(c, { ...offer, to: 'jake' })).toContain('two different parties');
    expect(reject(c, { ...offer, give: {}, get: {} })).toContain('something on it');
    expect(reject(c, { ...offer, get: { items: { ghost: 1 } } })).toContain('unknown item');
    expect(reject(c, { ...offer, to: 'ghost' })).toContain('unknown character');
    expect(reject(ok(c, offer), offer)).toContain('already exists');
  });

  it('trades with the GM: the GM side comes from and goes to nowhere', () => {
    let c = ok(
      base(),
      {
        type: 'trade.propose',
        tradeId: 'shop',
        characterId: 'jake',
        to: null,
        give: { currency: 40 },
        get: { items: { bow: 1 } },
      },
      player('jake'),
    );
    expect(
      reject(c, { type: 'trade.accept', tradeId: 'shop', characterId: null }, player('jake')),
    ).toContain('own character');
    c = ok(c, { type: 'trade.accept', tradeId: 'shop', characterId: null });
    expect(held(c, 'jake')).toMatchObject({ currency: 60, inventory: { bow: 1 } });
    // GM-proposed offer, answered by the player.
    c = ok(c, {
      type: 'trade.propose',
      tradeId: 'quest',
      characterId: null,
      to: 'kim',
      give: { currency: 500 },
      get: { items: { bow: 1 } },
    });
    c = ok(c, { type: 'trade.accept', tradeId: 'quest', characterId: 'kim' }, player('kim'));
    expect(held(c, 'kim')).toMatchObject({ currency: 550, inventory: {} });
  });
});

describe('pool maxima use effective stats (M3.7, D81)', () => {
  const amulet: Command = {
    type: 'item.define',
    id: 'amulet',
    name: 'Amulet of Vigor',
    rarity: 'rare',
    slot: 'necklace',
    bonuses: [{ stat: 'vitality', flat: 5 }],
  };
  const pools = (c: Campaign, id = 'jake') => c.state?.characters[id]?.pools ?? {};
  const setup = () =>
    run(
      [amulet, { type: 'holdings.adjust', characterId: 'jake', items: { amulet: 1 } }],
      ctx,
      base(),
    );
  const equipAmulet: Command = {
    type: 'item.equip',
    characterId: 'jake',
    itemId: 'amulet',
    slot: 'necklace',
  };

  it('equipping raises the maximum but never refills the pool', () => {
    let c = setup();
    expect(pools(c)['hp']).toBe(100);
    c = ok(c, equipAmulet);
    expect(pools(c)['hp']).toBe(100);
    // Vitality 10 + 5 = 15 → max 150: a pool set up to 150 is now valid.
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 150 } });
    expect(pools(c)['hp']).toBe(150);
    expect(
      reject(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 151 } }),
    ).toContain('between 0 and 150');
  });

  it('unequipping or weakening the item clamps the pool down', () => {
    let c = ok(setup(), equipAmulet);
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 140 } });
    c = ok(c, { type: 'item.edit', itemId: 'amulet', bonuses: [{ stat: 'vitality', flat: 2 }] });
    expect(pools(c)['hp']).toBe(120);
    c = ok(c, { type: 'item.unequip', characterId: 'jake', slot: 'necklace' });
    expect(pools(c)['hp']).toBe(100);
    // Other pools and other characters are untouched.
    expect(pools(c)['mp']).toBe(100);
    expect(pools(c, 'kim')['hp']).toBe(100);
  });

  it('base stat changes clamp against effective maxima, not base ones', () => {
    let c = ok(setup(), equipAmulet);
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 150 } });
    // Base vitality 10 → 8; effective 13 → max 130 (a base-only clamp would give 80).
    c = ok(c, { type: 'character.setStats', characterId: 'jake', stats: { vitality: 8 } });
    expect(pools(c)['hp']).toBe(130);
  });

  it('an undo of an equip that a later pool set depends on is refused (D31)', () => {
    let c = ok(setup(), equipAmulet);
    const equipId = c.events[c.events.length - 1]?.id ?? '';
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 150 } });
    expect(reject(c, { type: 'event.undo', eventId: equipId })).toContain('depends on it');
  });

  it('an undo of an unequip restores the higher maximum without refilling', () => {
    let c = ok(setup(), equipAmulet);
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { hp: 150 } });
    c = ok(c, { type: 'item.unequip', characterId: 'jake', slot: 'necklace' });
    const unequipId = c.events[c.events.length - 1]?.id ?? '';
    expect(pools(c)['hp']).toBe(100);
    c = ok(c, { type: 'event.undo', eventId: unequipId });
    expect(pools(c)['hp']).toBe(150);
  });
});

describe('pool clamp edge cases (M3.7 review)', () => {
  it('level-ups and gifts with gear equipped keep effective maxima', () => {
    let c = run(
      [
        {
          type: 'item.define',
          id: 'amulet',
          name: 'Amulet',
          rarity: 'rare',
          slot: 'necklace',
          bonuses: [{ stat: 'vitality', flat: 10 }],
        },
        { type: 'holdings.adjust', characterId: 'jake', items: { amulet: 1 } },
        { type: 'item.equip', characterId: 'jake', itemId: 'amulet', slot: 'necklace' },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 200 } },
        {
          type: 'xp.award',
          track: 'class',
          amount: 500,
          participants: [{ characterId: 'jake' }],
        },
      ],
      ctx,
      base(),
    );
    // XP raised base stats; the gear-raised pool stays (never clamped to base).
    expect(c.state?.characters['jake']?.pools['hp']).toBe(200);
    // A gift of another item touches holdings; the pools stay as they are.
    c = ok(c, { type: 'gift.give', characterId: 'jake', to: 'kim', items: { potion: 1 } });
    expect(c.state?.characters['jake']?.pools['hp']).toBe(200);
  });
});
