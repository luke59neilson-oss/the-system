import { describe, expect, it } from 'vitest';
import { changeLog, execute, projectForPlayer, replay, type Campaign, type Command } from '../src';
import { rawRules, run, testContext } from './helpers/events';

// MT.7 (DESIGN §7 GM authority, Q60): where the engine enforces a rule on a
// GM action, `override: true` takes the GM through it as a logged, undoable
// event. One test per override: merges, an early profession, a montage.

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
      { name: 'Step', rarity: 'common' },
      { name: 'Look', rarity: 'common' },
    ],
  },
];
const player = { ...testContext('p'), actor: { role: 'player' as const, characterId: ID } };
const refusal = (c: Campaign, command: Command): string => {
  const r = execute(c, command, testContext('r'));
  return r.ok ? 'ok' : r.error;
};
const names = (c: Campaign) => c.state!.characters[ID]!.skills.map((s) => s.name);
const undo = (c: Campaign): Campaign =>
  run([{ type: 'event.undo', eventId: c.events.at(-1)!.id } as Command], testContext('u'), c);

describe('GM overrides the merge rules (MT.7)', () => {
  const merge = (name: string, skills: readonly [string, string], override = true): Command => ({
    type: 'skill.merge',
    characterId: ID,
    skills,
    name,
    offerId: `o-${name}`,
    override,
  });
  const accept = (offerId: string): Command => ({
    type: 'skill.answerMerge',
    characterId: ID,
    offerId,
    accept: true,
  });

  it('without the override: refused for Common skills never logged together', () => {
    expect(refusal(run(start()), merge('Cutstep', ['Cut', 'Step'], false))).toMatch(
      /must be at least Uncommon to merge/,
    );
  });

  it('with it: offered, accepted by the player, a second merge in the grade too', () => {
    let c = run([...start(), merge('Cutstep', ['Cut', 'Step'])]);
    expect(c.events.at(-1)?.payload).toMatchObject({ override: true });
    expect(c.state!.characters[ID]!.mergeOffer?.override).toBe(true);
    // The player never sees that the GM overrode a rule.
    expect(JSON.stringify(projectForPlayer(c.state!, ID).me.mergeOffer)).not.toContain('override');
    // The owner sees the merged rarity (not a stale offer) under the override.
    expect(projectForPlayer(c.state!, ID).me.mergeOffer?.rarity).toBe('uncommon');
    c = run([accept('o-Cutstep')], player, c);
    expect(names(c)).toEqual(expect.arrayContaining(['Cutstep', 'Look']));
    expect(names(c)).not.toContain('Cut');
    expect(c.state!.characters[ID]!.skills.find((s) => s.name === 'Cutstep')?.rarity).toBe(
      'uncommon',
    );
    // Once per grade is spent: a second merge needs the override again.
    expect(refusal(c, merge('Lookcut', ['Look', 'Cutstep'], false))).toMatch(/at least Uncommon/);
    c = run([merge('Lookcut', ['Look', 'Cutstep'])], testContext('m2'), c);
    c = run([accept('o-Lookcut')], player, c);
    expect(names(c)).toContain('Lookcut');
    expect(c.state!.characters[ID]!.merges).toEqual({ G: 2 });
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('with it: two Rare skills merge past the G-grade ceiling (MT.7 review)', () => {
    const rare = (skill: string): Command => ({
      type: 'skill.setRarity',
      characterId: ID,
      skill,
      rarity: 'rare',
    });
    const c = run([...start(), rare('Cut'), rare('Step')]);
    expect(refusal(c, merge('Cutstep', ['Cut', 'Step'], false))).toMatch(/logged together/);
    const merged = run([merge('Cutstep', ['Cut', 'Step'])], testContext('m'), c);
    expect(projectForPlayer(merged.state!, ID).me.mergeOffer?.rarity).toBe('epic');
    const done = run([accept('o-Cutstep')], player, merged);
    expect(done.state!.characters[ID]!.skills.find((s) => s.name === 'Cutstep')?.rarity).toBe(
      'epic',
    );
  });

  it('a merge into a reserved rarity stays refused, override or not (MT.7 review)', () => {
    const top = (skill: string): Command => ({
      type: 'skill.setRarity',
      characterId: ID,
      skill,
      rarity: 'mythical',
    });
    const c = run([...start(), top('Cut'), top('Step')]);
    expect(refusal(c, merge('Cutstep', ['Cut', 'Step']))).toMatch(
      /highest rarity a skill can have/,
    );
  });

  it('players cannot send an override merge', () => {
    const r = execute(run(start()), merge('Cutstep', ['Cut', 'Step']), player);
    expect(r.ok ? 'ok' : r.error).toMatch(/Not allowed/);
  });
});

describe('GM grants a profession before E-grade (MT.7)', () => {
  const grant = (override?: boolean): Command => ({
    type: 'character.grantProfession',
    characterId: ID,
    profession: 'Alchemist',
    ...(override === undefined ? {} : { override }),
  });

  it('refused without the override, granted with it at the class level, undoable', () => {
    const c = run(start());
    expect(refusal(c, grant())).toMatch(/Professions unlock at E-grade/);
    const granted = run([grant(true)], testContext('g'), c);
    expect(granted.events.at(-1)?.payload).toMatchObject({ override: true });
    expect(granted.state!.characters[ID]).toMatchObject({
      grade: 'G',
      profession: 'Alchemist',
      professionLevel: 0,
    });
    expect(replay(granted.events).state).toEqual(granted.state);
    expect(undo(granted).state!.characters[ID]!.profession).toBeNull();
  });

  it('replaces a profession the character has, only with the override (MT.7 review)', () => {
    const c = run([...start(), grant(true)]);
    const swap: Command = {
      type: 'character.grantProfession',
      characterId: ID,
      profession: 'Smith',
    };
    expect(refusal(c, swap)).toMatch(/already has a profession/);
    expect(refusal(c, grant())).toMatch(/already has a profession/);
    // The same name again with the override resets it to the class level.
    const leveled = run(
      [
        {
          type: 'character.setProgression',
          characterId: ID,
          grade: 'G',
          classLevel: 3,
          professionLevel: 1,
          xp: { class: 0, profession: 0 },
        } as Command,
        grant(true),
      ],
      testContext('l'),
      c,
    );
    expect(leveled.state!.characters[ID]).toMatchObject({
      profession: 'Alchemist',
      professionLevel: 3,
    });
    const swapped = run([{ ...swap, override: true } as Command], testContext('s'), c);
    expect(swapped.state!.characters[ID]!.profession).toBe('Smith');
    expect(undo(swapped).state!.characters[ID]!.profession).toBe('Alchemist');
  });
});

describe('GM offers a montage early (MT.7)', () => {
  const offer = (override?: boolean): Command => ({
    type: 'montage.offer',
    montageId: 'm1',
    clockId: 'k1',
    characterIds: [ID],
    ...(override === undefined ? {} : { override }),
  });

  it('refused on an empty clock without the override, offered with it, undoable', () => {
    const c = run([
      ...start(),
      { type: 'clock.create', clockId: 'k1', name: 'Climb', segments: 6 },
    ]);
    expect(refusal(c, offer())).toMatch(/does not qualify for a montage yet/);
    const offered = run([offer(true)], testContext('m'), c);
    expect(offered.state!.montages.m1).toMatchObject({ status: 'open', characterIds: [ID] });
    expect(JSON.stringify(projectForPlayer(offered.state!, ID))).not.toContain('override');
    expect(replay(offered.events).state).toEqual(offered.state);
    expect(undo(offered).state!.montages.m1).toBeUndefined();
    // The change log names the override on its row.
    expect(changeLog(offered).at(-1)?.lines[0]).toMatch(/\(GM override\)$/);
    expect(changeLog(c).at(-1)?.lines[0]).not.toMatch(/override/);
  });
});
