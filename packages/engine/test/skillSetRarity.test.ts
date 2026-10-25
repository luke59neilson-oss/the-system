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
