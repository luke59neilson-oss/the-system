import { describe, expect, it } from 'vitest';
import {
  castingForSkill,
  execute,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// ML.5 (DESIGN §6, Q85): a hand-written copy carries its own cost, cooldown,
// range and casting notes; Use library text returns it; Cast spends the copy's.
const gm = testContext('cc');
const as = (characterId: string): CommandContext => ({
  ...gm,
  actor: { role: 'player', characterId },
});
const setup = () =>
  run(
    [
      { type: 'campaign.create', name: 'Copy', rules: rawRules() },
      {
        type: 'skillDef.define',
        id: 'bolt',
        name: 'Arcane Bolt',
        rarity: 'common',
        tags: ['spell'],
        description: 'Library words.',
        cost: { pool: 'mp', amount: 40 },
        cooldown: '1 round',
      },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Caster',
        classSkills: [...kit.slice(0, 2), { name: 'Arcane Bolt', rarity: 'common' }],
      },
    ],
    gm,
  );
function ok(c: Campaign, command: Command, ctx: CommandContext = gm): Campaign {
  const r = execute(c, command, ctx);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
const refused = (c: Campaign, command: Command, ctx: CommandContext = gm) =>
  expect(execute(c, command, ctx).ok, JSON.stringify(command)).toBe(false);

const own: Command = {
  type: 'skill.setCasting',
  characterId: 'jake',
  skill: 'Arcane Bolt',
  cost: { pool: 'mp', amount: 3 },
  cooldown: ' 5 seconds ',
  range: 'Touch',
  castingNotes: '',
};
const cast: Command = { type: 'skill.cast', characterId: 'jake', skill: 'Arcane Bolt' };
const useLibrary: Command = {
  type: 'skill.useLibraryText',
  characterId: 'jake',
  skill: 'Arcane Bolt',
};
const copy = (c: Campaign, name = 'Arcane Bolt') =>
  c.state!.characters['jake']!.skills.find((s) => s.name === name)!;
const castingOf = (c: Campaign) => castingForSkill(c.state!.rules, c.state!.skillLibrary, copy(c));
const mp = (c: Campaign) => c.state!.characters['jake']!.pools['mp'] as number;

describe('a copy with its own casting (ML.5)', () => {
  it('overrides the library and is marked hand-written', () => {
    const c = ok(setup(), own);
    expect(castingOf(c)).toEqual({
      cost: { pool: 'mp', amount: 3 },
      cooldown: '5 seconds',
      range: 'Touch',
      castingNotes: null,
    });
    expect(copy(c).textEdited).toBe(true);
  });

  it("Cast spends the copy's cost, and its owner sees it", () => {
    const c = ok(setup(), own);
    const after = ok(c, cast, as('jake'));
    expect(mp(after)).toBe(mp(c) - 3);
    const view = projectForPlayer(after.state!, 'jake');
    expect(JSON.stringify(view)).toContain('5 seconds');
  });

  it("all empty means no casting, though the library's has a cost", () => {
    const c = ok(setup(), {
      ...own,
      cost: null,
      cooldown: null,
      range: null,
      castingNotes: null,
    } as Command);
    expect(castingOf(c)).toBeNull();
    refused(c, cast, as('jake'));
  });

  it("survives a library edit; Use library text returns the library's", () => {
    let c = ok(setup(), own);
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: { pool: 'mp', amount: 20 } });
    expect(castingOf(c)?.cost?.amount).toBe(3);
    c = ok(c, useLibrary);
    expect(copy(c).casting).toBeUndefined();
    expect(copy(c).textEdited).toBeUndefined();
    expect(castingOf(c)?.cost?.amount).toBe(20);
    expect(copy(c).description).toBe('Library words.');
  });

  it('Use library text returns the casting when the library has no text', () => {
    const skill = kit[0]!.name;
    let c = ok(setup(), { ...own, skill } as Command);
    c = ok(c, { type: 'skill.useLibraryText', characterId: 'jake', skill });
    expect(copy(c, skill).casting).toBeUndefined();
    expect(copy(c, skill).textEdited).toBe(true);
    refused(c, { type: 'skill.useLibraryText', characterId: 'jake', skill });
  });

  it('refuses an unknown pool, a skill not held, and a player', () => {
    const c = setup();
    refused(c, { ...own, cost: { pool: 'nope', amount: 1 } } as Command);
    refused(c, { ...own, skill: 'Nothing' } as Command);
    refused(c, own, as('jake'));
  });

  it('replays to the same state; another player never sees it', () => {
    let c = ok(setup(), own);
    c = ok(c, cast, as('jake'));
    c = ok(c, {
      type: 'character.create',
      id: 'kim',
      name: 'Kim',
      className: 'Brawler',
      classSkills: [
        { name: 'Kim One', rarity: 'inferior' },
        { name: 'Kim Two', rarity: 'inferior' },
        { name: 'Kim Three', rarity: 'common' },
      ],
    });
    expect(JSON.stringify(replay(c.events).state)).toBe(JSON.stringify(c.state));
    expect(JSON.stringify(projectForPlayer(c.state!, 'kim'))).not.toContain('5 seconds');
  });
});
