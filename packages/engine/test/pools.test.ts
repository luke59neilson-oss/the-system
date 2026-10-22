import { describe, expect, it } from 'vitest';
import {
  execute,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/**
 * MQ.2 Pools follow maxima (DESIGN §2, D100): a full pool stays full when its
 * maximum rises (level, item, evolution bonus); any other pool keeps its
 * value; level-ups never refill; a falling maximum clamps.
 */

const ctx = testContext('p');
const rulesWith = (fullPoolsStayFull: boolean | undefined): unknown => {
  const r = rawRules() as { character: Record<string, unknown> };
  if (fullPoolsStayFull === undefined) delete r.character['fullPoolsStayFull'];
  else r.character['fullPoolsStayFull'] = fullPoolsStayFull;
  return r;
};
const start = (rules: unknown = rawRules()): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
      {
        type: 'item.define',
        id: 'charm',
        name: 'Charm of Vigor',
        rarity: 'rare',
        slot: 'necklace',
        bonuses: [{ stat: 'vitality', flat: 2 }],
      },
      { type: 'holdings.adjust', characterId: 'jake', items: { charm: 1 } },
    ],
    ctx,
  );

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}

const pool = (c: Campaign, id = 'hp', who = 'jake') => {
  const p = projectForPlayer(c.state ?? (null as never), who).me.pools.find((x) => x.id === id);
  if (!p) throw new Error(`no pool ${id}`);
  return { current: p.current, max: p.max };
};
const equip: Command = {
  type: 'item.equip',
  characterId: 'jake',
  itemId: 'charm',
  slot: 'necklace',
};
const unequip: Command = { type: 'item.unequip', characterId: 'jake', slot: 'necklace' };
const setHp = (hp: number): Command => ({
  type: 'character.setPools',
  characterId: 'jake',
  pools: { hp },
});
const levelUp = (amount = 500): Command => ({
  type: 'xp.award',
  track: 'class',
  amount,
  participants: [{ characterId: 'jake' }],
});

describe('pools follow maxima (MQ.2, D100)', () => {
  it('DESIGN §2: 100/100 equips +20 → 120/120; 85/100 equips +20 → 85/120', () => {
    let c = ok(start(), equip);
    expect(pool(c)).toEqual({ current: 120, max: 120 });
    c = ok(c, unequip);
    expect(pool(c)).toEqual({ current: 100, max: 100 });
    c = ok(ok(c, setHp(85)), equip);
    expect(pool(c)).toEqual({ current: 85, max: 120 });
  });

  it('a level-up keeps a full pool full and never refills one that is not', () => {
    const before = start();
    expect(pool(before)).toEqual({ current: 100, max: 100 });
    const full = ok(before, levelUp());
    const raised = pool(full);
    expect(raised.max).toBeGreaterThan(100);
    expect(raised.current).toBe(raised.max);
    const hurt = ok(ok(before, setHp(85)), levelUp());
    expect(pool(hurt)).toEqual({ current: 85, max: raised.max });
    // Every pool follows its own maximum; other characters are untouched.
    for (const id of ['mp', 'stamina']) expect(pool(full, id).current).toBe(pool(full, id).max);
    expect(pool(full, 'hp', 'kim')).toEqual({ current: 100, max: 100 });
  });

  it('a falling maximum clamps; a pool at the lower maximum is then full again', () => {
    let c = ok(ok(start(), equip), setHp(110));
    c = ok(c, unequip);
    expect(pool(c)).toEqual({ current: 100, max: 100 });
    // DESIGN §2 read literally: the clamped pool is full, so it rises with the
    // maximum (QUESTIONS Q41).
    c = ok(c, equip);
    expect(pool(c)).toEqual({ current: 120, max: 120 });
  });

  it('an item edit that raises an equipped bonus keeps a full pool full (MQ.2 review)', () => {
    let c = ok(start(), equip);
    c = ok(c, { type: 'item.edit', itemId: 'charm', bonuses: [{ stat: 'vitality', flat: 4 }] });
    expect(pool(c)).toEqual({ current: 140, max: 140 });
    c = ok(ok(c, setHp(90)), {
      type: 'item.edit',
      itemId: 'charm',
      bonuses: [{ stat: 'vitality', flat: 6 }],
    });
    expect(pool(c)).toEqual({ current: 90, max: 160 });
  });

  it('a GM pool set is never overridden by the rule', () => {
    const c = ok(ok(start(), equip), setHp(120));
    expect(pool(ok(c, setHp(60)))).toEqual({ current: 60, max: 120 });
  });

  it('a base stat edit that raises the maximum keeps a full pool full', () => {
    const c = ok(start(), {
      type: 'character.setStats',
      characterId: 'jake',
      stats: { vitality: 13 },
    });
    expect(pool(c)).toEqual({ current: 130, max: 130 });
  });

  it('rules stored without the flag keep the old behaviour, so older logs replay unchanged', () => {
    for (const rules of [rulesWith(undefined), rulesWith(false)]) {
      const c = ok(ok(start(rules), equip), levelUp());
      expect(pool(c).current).toBe(100);
      expect(pool(c).max).toBeGreaterThan(120);
      expect(c.state?.rules.character.fullPoolsStayFull).toBe(false);
    }
    expect(start().state?.rules.character.fullPoolsStayFull).toBe(true);
  });

  it('replay and append agree (undo of the equip refolds the pool)', () => {
    let c = ok(start(), equip);
    const equipId = c.events[c.events.length - 1]?.id ?? '';
    c = ok(c, { type: 'event.undo', eventId: equipId });
    expect(pool(c)).toEqual({ current: 100, max: 100 });
    expect(replay(c.events.map((e) => JSON.parse(JSON.stringify(e)) as unknown)).state).toEqual(
      c.state,
    );
  });
});
