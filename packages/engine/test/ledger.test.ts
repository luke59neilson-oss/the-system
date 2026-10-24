import { describe, expect, it } from 'vitest';
import {
  LEDGER_LIMIT,
  execute,
  ledgerFor,
  notificationsBetween,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, seededRandom, testContext } from './helpers/events';

// M6.3 currency (DESIGN §7 "Items"): GM grants and fines with a reason, and a
// GM-only ledger of every balance change (grants, fines, gifts, trades, loot).

const ctx = testContext('l');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});

const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      make('jake', 'Jake'),
      make('kim', 'Kim'),
      { type: 'item.define', id: 'pelt', name: 'Pelt', rarity: 'common' },
    ],
    ctx,
  );

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}

const ledger = (c: Campaign) => c.state?.ledger ?? [];
const grant = (characterId: string, currency: number, reason = ''): Command => ({
  type: 'holdings.adjust',
  characterId,
  currency,
  reason,
});

describe('currency ledger (M6.3)', () => {
  it('records a grant and a fine with the reason and the balance after', () => {
    let c = ok(base(), grant('jake', 50, 'Bounty on the pale hunter'));
    c = ok(c, grant('jake', -20, 'Broke the canyon bridge'));
    expect(ledger(c).map((e) => [e.characterId, e.kind, e.delta, e.balance, e.reason])).toEqual([
      ['jake', 'grant', 50, 50, 'Bounty on the pale hunter'],
      ['jake', 'fine', -20, 30, 'Broke the canyon bridge'],
    ]);
    expect(ledger(c)[0]?.id).toBe(c.events.at(-2)?.id);
    expect(ledger(c)[0]?.at).toBe(c.events.at(-2)?.timestamp);
  });

  it('refuses a fine larger than the balance and records nothing', () => {
    const c = ok(base(), grant('jake', 10));
    const r = execute(c, grant('jake', -11), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Not enough Credits (has 10)');
    expect(ledger(c)).toHaveLength(1);
  });

  it('item-only adjustments leave the ledger alone', () => {
    const c = ok(base(), { type: 'holdings.adjust', characterId: 'jake', items: { pelt: 2 } });
    expect(ledger(c)).toEqual([]);
  });

  it('records both sides of a gift and of an accepted trade, naming the other party', () => {
    let c = ok(base(), grant('jake', 100));
    c = ok(c, grant('kim', 40));
    c = ok(c, { type: 'gift.give', characterId: 'jake', to: 'kim', currency: 30 }, player('jake'));
    c = ok(c, { type: 'gift.give', characterId: null, to: 'kim', currency: 5 });
    c = ok(
      c,
      {
        type: 'trade.propose',
        tradeId: 't1',
        characterId: 'kim',
        to: 'jake',
        give: { currency: 25 },
        get: { currency: 0, items: {} },
      },
      player('kim'),
    );
    c = ok(c, { type: 'trade.accept', tradeId: 't1', characterId: 'jake' }, player('jake'));
    const rows = ledger(c)
      .slice(2)
      .map((e) => [e.characterId, e.kind, e.delta, e.balance, e.other]);
    expect(rows).toEqual([
      ['jake', 'gift', -30, 70, 'kim'],
      ['kim', 'gift', 30, 70, 'jake'],
      ['kim', 'gift', 5, 75, null],
      ['jake', 'trade', 25, 95, 'kim'],
      ['kim', 'trade', -25, 50, 'jake'],
    ]);
  });

  it('records currency from a loot roll for a character', () => {
    let c = ok(base(), {
      type: 'lootTable.define',
      id: 'coins',
      name: 'Coins',
      rolls: 1,
      entries: [{ kind: 'currency', weight: 1, min: 7, max: 7 }],
    });
    c = ok(
      c,
      { type: 'loot.roll', tableId: 'coins', characterId: 'kim' },
      {
        ...ctx,
        random: seededRandom(1),
      },
    );
    expect(ledger(c).map((e) => [e.characterId, e.kind, e.delta, e.other])).toEqual([
      ['kim', 'loot', 7, null],
    ]);
  });

  it('an undo removes its entries; replay rebuilds the same ledger', () => {
    let c = ok(base(), grant('jake', 50));
    c = ok(c, grant('kim', 9));
    const kimGrant = c.events.at(-1)?.id ?? '';
    c = ok(c, { type: 'event.undo', eventId: kimGrant });
    expect(ledger(c).map((e) => e.characterId)).toEqual(['jake']);
    expect(replay(c.events).state?.ledger).toEqual(ledger(c));
  });

  it(`keeps the latest ${LEDGER_LIMIT} entries`, () => {
    const c = run(
      [
        { type: 'campaign.create', name: 'Whale', rules: rawRules() },
        make('jake', 'Jake'),
        ...Array.from({ length: LEDGER_LIMIT + 5 }, (_, i) => grant('jake', i + 1)),
      ],
      testContext('m'),
    );
    expect(ledger(c)).toHaveLength(LEDGER_LIMIT);
    expect(ledger(c)[0]?.delta).toBe(6);
    expect(ledger(c).at(-1)?.delta).toBe(LEDGER_LIMIT + 5);
  });

  it('ledgerFor filters by character, newest first', () => {
    let c = ok(base(), grant('jake', 1));
    c = ok(c, grant('kim', 2));
    c = ok(c, grant('jake', 3));
    expect(ledgerFor(ledger(c), 'jake').map((e) => e.delta)).toEqual([3, 1]);
    expect(ledgerFor(ledger(c), null).map((e) => e.delta)).toEqual([3, 2, 1]);
  });

  it('never reaches a player view', () => {
    const { state } = ok(base(), grant('jake', 50, 'GM-SECRET-REASON'));
    if (!state) throw new Error('no state');
    const view = JSON.stringify(projectForPlayer(state, 'jake'));
    expect(view).not.toContain('ledger');
    expect(view).not.toContain('GM-SECRET-REASON');
  });

  it("tells only that character of a grant or fine, with the GM's reason", () => {
    const before = ok(base(), grant('jake', 50));
    const after = ok(before, grant('jake', -20, 'Broke the bridge'));
    expect(notificationsBetween(before.state, after.state, after.events.at(-1))).toEqual([
      {
        kind: 'currency',
        characterId: 'jake',
        amount: -20,
        currencyName: 'Credits',
        reason: 'Broke the bridge',
      },
    ]);
    const items = ok(before, { type: 'holdings.adjust', characterId: 'jake', items: { pelt: 1 } });
    // M6.A: an item-only adjustment is told as a gift from the GM, not as currency.
    expect(
      notificationsBetween(before.state, items.state, items.events.at(-1)).map((n) => n.kind),
    ).toEqual(['gift']);
  });
});
