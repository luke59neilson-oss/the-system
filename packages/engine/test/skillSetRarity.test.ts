import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, replay, type Campaign, type Command } from '../src';
import { rawRules, run, testContext } from './helpers/events';

// MT.7 (DESIGN §7 GM authority, Q60): the GM sets any skill's rarity directly,
// past the grade ceiling, without marks, race skills included; a logged,
// undoable event.

const ID = 'jake';
const start = (): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  {
    type: 'character.create',
    id: ID,
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Cut', rarity: 'common' },
      { name: 'Step', rarity: 'uncommon' },
      { name: 'Look', rarity: 'common' },
    ],
  },
];
const set = (skill: string, rarity: string): Command => ({
  type: 'skill.setRarity',
  characterId: ID,
  skill,
  rarity,
});
const skill = (c: Campaign, name: string) =>
  c.state!.characters[ID]!.skills.find((s) => s.name === name)!;

describe('GM sets a skill rarity (MT.7)', () => {
  it('raises past the G-grade ceiling with no marks; the raised skill starts at 0 marks', () => {
    const c = run([...start(), set('Cut', 'legendary')]);
    expect(c.events.at(-1)?.type).toBe('skill.raritySet');
    expect(skill(c, 'Cut')).toMatchObject({ rarity: 'legendary', marks: 0 });
    expect(skill(c, 'Cut').textRarity).toBeUndefined();
    expect(JSON.stringify(projectForPlayer(c.state!, ID).me)).toContain('"legendary"');
  });

  it('lowers Identify too (the GM overrules "never drops"); the text keeps its rarity', () => {
    const c = run([...start(), set('Identify', 'inferior')]);
    expect(skill(c, 'Identify')).toMatchObject({ rarity: 'inferior', textRarity: 'common' });
    const back = run([set('Identify', 'common')], testContext('b'), c);
    expect(skill(back, 'Identify').rarity).toBe('common');
    expect(skill(back, 'Identify').textRarity).toBeUndefined();
  });

  it('refuses no change, a reserved rarity, an unknown skill, and players', () => {
    const c = run(start());
    const refused = (command: Command, ctx = testContext('r')) => {
      const r = execute(c, command, ctx);
      return r.ok ? 'ok' : r.error;
    };
    expect(refused(set('Cut', 'common'))).toMatch(/already Common/);
    expect(refused(set('Cut', 'divine'))).toMatch(/reserved/);
    expect(refused(set('Nope', 'rare'))).toMatch(/no skill "Nope"/);
    expect(
      refused(set('Cut', 'rare'), {
        ...testContext('p'),
        actor: { role: 'player', characterId: ID },
      }),
    ).toMatch(/Not allowed|players cannot/);
  });

  it('is undone like any event, and replays the same', () => {
    const c = run([...start(), set('Step', 'epic')]);
    const id = c.events.at(-1)!.id;
    const undone = run([{ type: 'event.undo', eventId: id } as Command], testContext('u'), c);
    expect(skill(undone, 'Step').rarity).toBe('uncommon');
    expect(replay(c.events).state).toEqual(c.state);
  });
});

describe('GM gives a skill outside selections (MT.7)', () => {
  const grant = (over: Partial<Extract<Command, { type: 'skill.grant' }>> = {}): Command => ({
    type: 'skill.grant',
    characterId: ID,
    name: 'Star Shot',
    rarity: 'mythical',
    kind: 'class',
    description: 'A shot that never misses.',
    ...over,
  });

  it('gives any skill at any rarity, with no selection due and past the ceiling', () => {
    const c = run([...start(), grant()]);
    expect(c.events.at(-1)?.type).toBe('skill.granted');
    expect(skill(c, 'Star Shot')).toMatchObject({
      rarity: 'mythical',
      kind: 'class',
      marks: 0,
      description: 'A shot that never misses.',
      flavor: null,
    });
    const undone = run(
      [{ type: 'event.undo', eventId: c.events.at(-1)!.id } as Command],
      testContext('u'),
      c,
    );
    expect(undone.state!.characters[ID]!.skills.map((s) => s.name)).not.toContain('Star Shot');
  });

  it('refuses a taken name, a profession skill without a profession, and a reserved rarity', () => {
    const c = run(start());
    const refused = (command: Command) => {
      const r = execute(c, command, testContext('r'));
      return r.ok ? 'ok' : r.error;
    };
    expect(refused(grant({ name: 'Cut' }))).toMatch(/already has a skill "Cut"/);
    expect(refused(grant({ kind: 'profession' }))).toMatch(/has no profession/);
    expect(refused(grant({ rarity: 'divine' }))).toMatch(/reserved/);
  });
});

describe('GM gives a second mark in a session (MT.7)', () => {
  it('refuses a second mark without the override and gives it with one', () => {
    const c = run([
      ...start(),
      { type: 'session.start', sessionId: 'p1' },
      { type: 'skill.awardMark', characterId: ID, skill: 'Cut' },
    ]);
    const again: Command = { type: 'skill.awardMark', characterId: ID, skill: 'Cut' };
    const r = execute(c, again, testContext('r'));
    expect(r.ok ? 'ok' : r.error).toMatch(/already earned its mark this session/);
    const forced = run([{ ...again, override: true } as Command], testContext('f'), c);
    expect(skill(forced, 'Cut').marks).toBe(2);
    expect(forced.events.at(-1)?.payload).toMatchObject({ override: true });
    expect(replay(forced.events).state).toEqual(forced.state);
  });
});
