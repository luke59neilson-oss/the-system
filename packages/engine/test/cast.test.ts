import { describe, expect, it } from 'vitest';
import {
  execute,
  notificationsBetween,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/** MU.5 (DESIGN §6): a player taps Cast; the pool pays; the use is logged as practice. */
const gm = testContext('c');
const as = (characterId: string): CommandContext => ({
  ...gm,
  actor: { role: 'player', characterId },
});
const created = { type: 'campaign.create', name: 'Cast', rules: rawRules() } as const;
const bolt: Command = {
  type: 'skillDef.define',
  id: 'bolt',
  name: 'Arcane Bolt',
  rarity: 'common',
  tags: ['spell'],
  cost: { pool: 'mp', amount: 40 },
  cooldown: '1 round',
};
const jake: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Caster',
  classSkills: [...kit.slice(0, 2), { name: 'Arcane Bolt', rarity: 'common' }],
};
const kim: Command = {
  type: 'character.create',
  id: 'kim',
  name: 'Kim',
  className: 'Brawler',
  classSkills: [
    { name: 'Kim One', rarity: 'inferior' },
    { name: 'Kim Two', rarity: 'inferior' },
    { name: 'Kim Three', rarity: 'common' },
  ],
};
const cast: Command = { type: 'skill.cast', characterId: 'jake', skill: 'Arcane Bolt' };

function ok(c: Campaign, command: Command, ctx: CommandContext = gm): Campaign {
  const r = execute(c, command, ctx);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function refused(c: Campaign, command: Command, ctx: CommandContext = gm): string {
  const r = execute(c, command, ctx);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}
const setup = () => run([created, bolt, jake, kim], gm);
const mp = (c: Campaign) => c.state!.characters['jake']!.pools['mp'];

describe('casting a skill with a cost (MU.5)', () => {
  it('the owner casts: the pool pays and the use waits for the GM as practice', () => {
    const before = setup();
    const full = mp(before)!;
    expect(full).toBeGreaterThanOrEqual(40);
    const after = ok(before, cast, as('jake'));
    expect(mp(after)).toBe(full - 40);
    const entry = after.state!.practice.at(-1)!;
    expect(entry).toMatchObject({
      characterId: 'jake',
      action: 'Cast [Arcane Bolt]',
      skills: ['Arcane Bolt'],
      tags: ['cast'],
      source: 'player',
      reviewed: false,
    });
    const event = after.events.at(-1)!;
    expect(event.payload).toEqual({
      characterId: 'jake',
      skill: 'Arcane Bolt',
      pool: 'mp',
      amount: 40,
    });
    // The owner (and so the GM's feed) hears of it; nobody else does.
    const notes = notificationsBetween(before.state, after.state, event);
    expect(notes).toEqual([
      {
        kind: 'spellCast',
        characterId: 'jake',
        skill: 'Arcane Bolt',
        pool: 'MP',
        amount: 40,
        left: full - 40,
      },
    ]);
  });

  it("refuses a cast the pool cannot pay, with the caster's own numbers only", () => {
    let c = setup();
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { mp: 39 } });
    expect(refused(c, cast, as('jake'))).toBe('Not enough MP to cast [Arcane Bolt]: 39 of 40');
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: { mp: 40 } });
    expect(mp(ok(c, cast, as('jake')))).toBe(0);
  });

  it("refuses a skill with no cost, another player's skill and an unknown skill", () => {
    const c = setup();
    expect(
      refused(c, { type: 'skill.cast', characterId: 'jake', skill: 'Basic Archery' }, as('jake')),
    ).toBe('[Basic Archery] has no cost to cast');
    expect(refused(c, cast, as('kim'))).toMatch(/own character/);
    expect(refused(c, { type: 'skill.cast', characterId: 'jake', skill: 'Nope' }, as('jake'))).toBe(
      'Jake has no skill "Nope"',
    );
  });

  it('the GM can cast for a player (counted as reviewed) and undo a cast', () => {
    const before = setup();
    const full = mp(before)!;
    const gmCast = ok(before, cast);
    expect(gmCast.state!.practice.at(-1)).toMatchObject({ source: 'gm', reviewed: true });
    const played = ok(before, cast, as('jake'));
    const undone = ok(played, { type: 'event.undo', eventId: played.events.at(-1)!.id });
    expect(mp(undone)).toBe(full);
    expect(undone.state!.practice).toEqual(before.state!.practice);
  });

  it('a cast is priced when cast; a later library edit does not re-price it on replay', () => {
    let c = ok(setup(), cast, as('jake'));
    const full = mp(setup())!;
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: { pool: 'mp', amount: 5 } });
    expect(mp(c)).toBe(full - 40);
    expect(JSON.stringify(replay(c.events).state)).toBe(JSON.stringify(c.state));
  });

  it('a player-recorded cast that the pool cannot pay is refused on replay too', () => {
    const c = ok(setup(), { type: 'character.setPools', characterId: 'jake', pools: { mp: 10 } });
    const forged = {
      ...c.events.at(-1)!,
      id: 'forged',
      type: 'skill.cast',
      actor: { role: 'player', characterId: 'jake' },
      payload: { characterId: 'jake', skill: 'Arcane Bolt', pool: 'mp', amount: 40 },
    };
    expect(() => replay([...c.events, forged] as typeof c.events)).toThrow(/not enough mp/);
  });

  it('the owner sees the cooldown; no other player sees the cast notice', () => {
    const before = setup();
    const after = ok(before, cast, as('jake'));
    const me = projectForPlayer(after.state!, 'jake').me;
    expect(me.skills.find((s) => s.name === 'Arcane Bolt')?.casting?.cooldown).toBe('1 round');
    const notes = notificationsBetween(before.state, after.state, after.events.at(-1));
    expect(notes.filter((n) => n.characterId !== 'jake')).toEqual([]);
    expect(JSON.stringify(projectForPlayer(after.state!, 'kim'))).not.toContain('Arcane Bolt');
  });
});
