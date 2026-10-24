import { describe, expect, it } from 'vitest';
import {
  execute,
  notificationsBetween,
  projectForPlayer,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M6.A milestone review fixes (DESIGN §4 "Bonuses", §7 "Items", "Titles"):
// the sheet can tell item and title bonuses apart; GM item gives and takes
// reach the holder; a library title that matches a name someone already holds
// tells that holder.

const ctx = testContext('m6a');
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
const fresh = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      make('jake', 'Jake'),
      make('kim', 'Kim'),
      {
        type: 'item.define',
        id: 'charm',
        name: 'Bone Charm',
        rarity: 'common',
        slot: 'necklace',
        bonuses: [{ stat: 'vitality', flat: 5 }],
      },
      { type: 'item.define', id: 'fang', name: 'Hunter Fang', rarity: 'common', bonuses: [] },
    ],
    ctx,
  );

function step(c: Campaign, command: Command) {
  const result = execute(c, command, ctx);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  const after = result.campaign;
  return {
    campaign: after,
    notices: notificationsBetween(c.state, after.state, after.events.at(-1)),
  };
}

describe('M6.A review fixes', () => {
  it('the owner’s view carries item-only stats, so items and titles show apart', () => {
    let c = fresh();
    c = step(c, { type: 'holdings.adjust', characterId: 'kim', items: { charm: 1 } }).campaign;
    c = step(c, {
      type: 'item.equip',
      characterId: 'kim',
      itemId: 'charm',
      slot: 'necklace',
    }).campaign;
    c = step(c, {
      type: 'titleDef.define',
      id: 'spread',
      name: 'Rapid Spread',
      text: 'Fast.',
      bonuses: [{ stat: 'vitality', percent: 0.1 }],
    }).campaign;
    c = step(c, { type: 'title.award', characterId: 'kim', title: 'Rapid Spread' }).campaign;
    const me = projectForPlayer(c.state!, 'kim').me;
    expect(me.stats['vitality']).toBe(10);
    // Items +5 capped to +2; then titles: (10 + 2) × 1.1 = 13.2 → 13.
    expect(me.itemStats['vitality']).toBe(12);
    expect(me.effectiveStats['vitality']).toBe(13);
    expect(me.itemCappedStats).toEqual(['vitality']);
    expect(me.itemStats['agility']).toBe(10);
  });

  it('a GM give tells the holder it came from the GM; a take says what left', () => {
    const c = fresh();
    const give = step(c, {
      type: 'holdings.adjust',
      characterId: 'jake',
      items: { fang: 2, charm: 1 },
    });
    expect(give.notices).toEqual([
      {
        kind: 'gift',
        characterId: 'jake',
        from: null,
        currency: 0,
        currencyName: expect.any(String),
        items: [
          { name: 'Hunter Fang', count: 2 },
          { name: 'Bone Charm', count: 1 },
        ],
      },
    ]);
    const take = step(give.campaign, {
      type: 'holdings.adjust',
      characterId: 'jake',
      items: { fang: -2 },
      reason: 'Confiscated',
    });
    expect(take.notices).toEqual([
      {
        kind: 'itemsTaken',
        characterId: 'jake',
        items: [{ name: 'Hunter Fang', count: 2 }],
        reason: 'Confiscated',
      },
    ]);
    // QF.19: a give with a reason carries it to the holder.
    const why = step(c, {
      type: 'holdings.adjust',
      characterId: 'jake',
      items: { fang: 1 },
      reason: ' Reward for the bridge ',
    });
    expect(why.notices).toEqual([
      expect.objectContaining({ kind: 'gift', reason: 'Reward for the bridge' }),
    ]);
    // A blank reason adds no `reason` key.
    const blank = step(c, {
      type: 'holdings.adjust',
      characterId: 'jake',
      items: { fang: 1 },
      reason: '   ',
    });
    expect(blank.notices[0]).not.toHaveProperty('reason');
    // A currency-only grant still sends just the currency notice.
    const paid = step(c, { type: 'holdings.adjust', characterId: 'kim', currency: 5 });
    expect(paid.notices.map((n) => n.kind)).toEqual(['currency']);
  });

  it('defining a title someone holds by name tells that holder, once', () => {
    let c = fresh();
    c = step(c, { type: 'title.award', characterId: 'kim', title: 'Forerunner' }).campaign;
    const define = step(c, {
      type: 'titleDef.define',
      id: 'runner',
      name: 'forerunner',
      text: 'First to set foot.',
      bonuses: [{ stat: 'agility', percent: 0.1 }],
    });
    expect(define.notices).toEqual([
      { kind: 'title', characterId: 'kim', title: 'forerunner', text: 'First to set foot.' },
    ]);
    // Editing the text again does not re-announce it.
    const edit = step(define.campaign, {
      type: 'titleDef.edit',
      titleDefId: 'runner',
      text: 'First of all.',
    });
    expect(edit.notices).toEqual([]);
  });

  it('a rename onto a name someone holds tells only the newly linked holder', () => {
    let c = fresh();
    c = step(c, {
      type: 'titleDef.define',
      id: 'spread',
      name: 'Rapid Spread',
      text: 'Fast.',
      bonuses: [{ stat: 'vitality', percent: 0.1 }],
    }).campaign;
    c = step(c, { type: 'title.award', characterId: 'jake', title: 'Rapid Spread' }).campaign;
    c = step(c, { type: 'title.award', characterId: 'kim', title: 'Rapid Spread II' }).campaign;
    const rename = step(c, {
      type: 'titleDef.edit',
      titleDefId: 'spread',
      name: 'Rapid Spread II',
    });
    expect(rename.notices).toEqual([
      { kind: 'title', characterId: 'kim', title: 'Rapid Spread II', text: 'Fast.' },
    ]);
  });
});
