import { describe, expect, it } from 'vitest';
import {
  LOOT_LOG_LIMIT,
  execute,
  holdingsOf,
  lootBundle,
  notificationsBetween,
  projectForPlayer,
  replay,
  rollLoot,
  type Campaign,
  type Command,
  type CommandContext,
  type LootTable,
} from '../src';
import { kit, rawRules, run, seededRandom, testContext } from './helpers/events';

// M6.2 loot tables (DESIGN §7 "Items"): the GM defines weighted tables and
// rolls them; a roll records its picks (replay never rolls again) and, for a
// character, hands over what it rolled as a GM gift. Tables and rolls are GM-only.

const SEED = 20261023;
const shared = testContext('t');
const ctx = (random: () => number = seededRandom(SEED)): CommandContext => ({
  ...shared,
  random,
});

const pelt: Command = {
  type: 'item.define',
  id: 'pelt',
  name: 'Whale Louse Pelt',
  rarity: 'common',
};
const fang: Command = { type: 'item.define', id: 'fang', name: 'Hunter Fang', rarity: 'rare' };
const table: Command = {
  type: 'lootTable.define',
  id: 'hunter',
  name: 'Pale hunter drop',
  rolls: 2,
  entries: [
    { kind: 'item', itemId: 'pelt', weight: 6, min: 1, max: 3 },
    { kind: 'item', itemId: 'fang', weight: 1, min: 1, max: 1 },
    { kind: 'currency', weight: 2, min: 5, max: 20 },
    { kind: 'nothing', weight: 1 },
  ],
};

const base = (context = ctx()): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      },
      pelt,
      fang,
      table,
    ],
    context,
  );

function ok(c: Campaign, command: Command, context = ctx()): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}

function reject(c: Campaign, command: Command, context = ctx()): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}

const hunter = (c: Campaign): LootTable => {
  const t = c.state?.lootTables['hunter'];
  if (!t) throw new Error('no table');
  return t;
};

describe('loot tables (M6.2)', () => {
  it('defines a table in order, validated against the item library', () => {
    const c = base();
    expect(c.state?.lootTableOrder).toEqual(['hunter']);
    expect(hunter(c)).toMatchObject({ name: 'Pale hunter drop', rolls: 2 });
    const bad = (entries: unknown, reason: string) =>
      expect(reject(c, { ...table, id: 'x', entries } as Command)).toContain(reason);
    bad([{ kind: 'item', itemId: 'ghost', weight: 1, min: 1, max: 1 }], 'unknown item');
    bad([{ kind: 'currency', weight: 1, min: 9, max: 3 }], 'min 9 is above max 3');
    bad([{ kind: 'nothing', weight: 0 }], 'weight');
    bad([], 'entries');
    expect(reject(c, { ...table, id: 'x', rolls: 0 })).toContain('rolls');
    expect(reject(c, { ...table, id: 'x', rolls: 21 })).toContain('rolls');
    expect(reject(c, table)).toContain('already exists');
  });

  it('edits keep omitted fields; nothing to change is refused', () => {
    let c = base();
    expect(reject(c, { type: 'lootTable.edit', tableId: 'hunter' })).toContain('nothing to change');
    expect(reject(c, { type: 'lootTable.edit', tableId: 'ghost', name: 'X' })).toContain(
      'unknown loot table',
    );
    c = ok(c, { type: 'lootTable.edit', tableId: 'hunter', name: 'Hunter drop', rolls: 1 });
    expect(hunter(c)).toMatchObject({ name: 'Hunter drop', rolls: 1 });
    expect(hunter(c).entries).toHaveLength(4);
  });

  it('rolls follow the weights (fixed seed)', () => {
    const t: LootTable = {
      id: 't',
      name: 'T',
      rolls: 1,
      entries: [
        { kind: 'currency', weight: 3, min: 1, max: 1 },
        { kind: 'nothing', weight: 1 },
      ],
    };
    const random = seededRandom(SEED);
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if ((rollLoot(t, random)[0]?.entry ?? -1) === 0) hits++;
    expect(hits / n, `seed ${SEED}`).toBeGreaterThan(0.72);
    expect(hits / n, `seed ${SEED}`).toBeLessThan(0.78);
  });

  it('picks each entry at its edge of the random range, counts from min to max', () => {
    const t = hunter(base());
    // Total weight 10: [0, .6) pelt, [.6, .7) fang, [.7, .9) currency, [.9, 1) nothing.
    const at = (...xs: number[]) => {
      const queue = [...xs];
      return () => queue.shift() ?? 0;
    };
    expect(rollLoot(t, at(0, 0, 0.59, 0.999))).toEqual([
      { entry: 0, count: 1 },
      { entry: 0, count: 3 },
    ]);
    expect(rollLoot(t, at(0.6, 0.5, 0.7, 0))).toEqual([
      { entry: 1, count: 1 },
      { entry: 2, count: 5 },
    ]);
    expect(rollLoot(t, at(0.89, 0.999, 0.9, 0.5))).toEqual([
      { entry: 2, count: 20 },
      { entry: 3, count: 0 },
    ]);
    expect(() => rollLoot(t, () => 1)).toThrow('[0, 1)');
  });

  it('a bundle sums the picks; picks that do not fit the table are refused', () => {
    const t = hunter(base());
    expect(
      lootBundle(t, [
        { entry: 0, count: 2 },
        { entry: 0, count: 1 },
      ]),
    ).toEqual({ currency: 0, items: { pelt: 3 } });
    expect(() => lootBundle(t, [{ entry: 0, count: 1 }])).toThrow('rolls 2 times');
    expect(() =>
      lootBundle(t, [
        { entry: 0, count: 4 },
        { entry: 3, count: 0 },
      ]),
    ).toThrow('gives 1–3, not 4');
    expect(() =>
      lootBundle(t, [
        { entry: 9, count: 1 },
        { entry: 3, count: 0 },
      ]),
    ).toThrow('No entry 10');
  });

  it('rolling for a character gives the loot as a GM gift and logs it; replay never rolls again', () => {
    const c0 = base();
    // A pelt (entry 1, count 1) and 5 Credits (entry 3, count 5).
    const picks = [0, 0, 0.7, 0];
    const c = ok(
      c0,
      { type: 'loot.roll', tableId: 'hunter', characterId: 'jake' },
      ctx(() => picks.shift() ?? 0),
    );
    const roll = c.state?.lootLog.at(-1);
    expect(roll?.bundle).toEqual({ currency: 5, items: { pelt: 1 } });
    expect(roll).toMatchObject({
      tableId: 'hunter',
      tableName: 'Pale hunter drop',
      characterId: 'jake',
    });
    const got = roll?.bundle ?? { currency: 0, items: {} };
    const held = c.state ? holdingsOf(c.state, 'jake') : null;
    expect(held?.currency).toBe(got.currency);
    expect(held?.inventory).toEqual(got.items);
    // Replay reads the recorded picks, with no random source at all.
    expect(replay(c.events).state).toEqual(c.state);
    const notices = notificationsBetween(c0.state, c.state, c.events.at(-1));
    expect(notices).toEqual([
      {
        kind: 'gift',
        characterId: 'jake',
        from: null,
        currency: 5,
        currencyName: 'Credits',
        items: [{ name: 'Whale Louse Pelt', count: 1 }],
      },
    ]);
  });

  it('a roll for the GM only changes no holdings and tells no one', () => {
    const c0 = base();
    const c = ok(c0, { type: 'loot.roll', tableId: 'hunter' });
    expect(c.state?.lootLog).toHaveLength(1);
    expect(c.state?.lootLog[0]?.characterId).toBeNull();
    expect(c.state?.holdings).toEqual(c0.state?.holdings);
    expect(notificationsBetween(c0.state, c.state, c.events.at(-1))).toEqual([]);
  });

  it('refuses a roll without a random source, for an unknown table or character, or by a player', () => {
    const c = base();
    const noRandom: CommandContext = { ...ctx(), random: undefined };
    expect(reject(c, { type: 'loot.roll', tableId: 'hunter' }, noRandom)).toContain(
      'No random source',
    );
    expect(reject(c, { type: 'loot.roll', tableId: 'ghost' })).toContain('No loot table');
    expect(
      reject(
        c,
        { type: 'loot.roll', tableId: 'hunter', characterId: 'ghost' },
        ctx(() => 0.95),
      ),
    ).toContain('ghost');
    const player: CommandContext = { ...ctx(), actor: { role: 'player', characterId: 'jake' } };
    for (const command of [
      table,
      { type: 'lootTable.edit', tableId: 'hunter', name: 'Mine' },
      { type: 'loot.roll', tableId: 'hunter', characterId: 'jake' },
    ] as Command[]) {
      expect(reject(c, command, player)).toContain('only the GM');
    }
  });

  it('keeps the latest rolls only', () => {
    let c = base();
    const random = seededRandom(SEED);
    for (let i = 0; i < LOOT_LOG_LIMIT + 3; i++) {
      c = ok(c, { type: 'loot.roll', tableId: 'hunter' }, ctx(random));
    }
    expect(c.state?.lootLog).toHaveLength(LOOT_LOG_LIMIT);
    expect(c.state?.lootLog[0]?.id).toBe(c.events[c.events.length - LOOT_LOG_LIMIT]?.id);
  });

  it('players never see tables or rolls', () => {
    const c = ok(base(), { type: 'loot.roll', tableId: 'hunter', characterId: 'jake' });
    if (!c.state) throw new Error('no state');
    const view = JSON.stringify(projectForPlayer(c.state, 'jake'));
    expect(view).not.toContain('Pale hunter drop');
    expect(view).not.toContain('lootTable');
    expect(view).not.toContain('lootLog');
  });
});
