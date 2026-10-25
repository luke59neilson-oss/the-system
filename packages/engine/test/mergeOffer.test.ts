import { describe, expect, it } from 'vitest';
import {
  execute,
  notificationsBetween,
  projectForPlayer,
  replay,
  describeEvent,
  type Campaign,
  type Command,
} from '../src';
import { rawRules, run, testContext } from './helpers/events';

// MT.2 (DESIGN §6 Merges, Q62): the GM sends a merge as an offer; the player
// accepts (the merge applies) or declines (both originals stay); the GM sees
// the answer.

const ID = 'jake';
const pair = ['Cut', 'Step'] as const;
const start = (): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  {
    type: 'character.create',
    id: ID,
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Cut', rarity: 'uncommon' },
      { name: 'Step', rarity: 'uncommon' },
      { name: 'Look', rarity: 'common' },
    ],
  },
  {
    type: 'character.create',
    id: 'amy',
    name: 'Amy',
    className: 'Archer',
    classSkills: [
      { name: 'Aim', rarity: 'common' },
      { name: 'Hide', rarity: 'common' },
      { name: 'Run', rarity: 'common' },
    ],
  },
  { type: 'session.start', sessionId: 'p1' },
  ...['One', 'Two', 'Three'].map((action): Command => ({
    type: 'practice.log',
    characterId: ID,
    action,
    skills: [...pair],
  })),
];

const offer = (offerId = 'o1', name = 'Cutstep'): Command => ({
  type: 'skill.merge',
  characterId: ID,
  skills: pair,
  name,
  offerId,
});
const answer = (accept: boolean, offerId = 'o1', characterId = ID): Command => ({
  type: 'skill.answerMerge',
  characterId,
  offerId,
  accept,
});
const player = (characterId: string) => ({
  ...testContext('p'),
  actor: { role: 'player' as const, characterId },
});
const names = (c: Campaign) => c.state!.characters[ID]!.skills.map((s) => s.name);

describe('players accept or decline merges (MT.2)', () => {
  it('the GM sends a merge: it is pending on the owner, not applied', () => {
    const c = run([...start(), offer()]);
    expect(c.events.at(-1)?.type).toBe('skill.mergeOffered');
    expect(names(c)).toEqual(expect.arrayContaining(['Cut', 'Step']));
    expect(c.state!.characters[ID]!.merges).toEqual({});
    expect(projectForPlayer(c.state!, ID).me.mergeOffer).toEqual({
      offerId: 'o1',
      skills: ['Cut', 'Step'],
      name: 'Cutstep',
      rarity: 'rare',
      description: null,
      flavor: null,
    });
    // Nobody else sees it: Amy's view names neither the offer nor its skills.
    const amy = JSON.stringify(projectForPlayer(c.state!, 'amy'));
    expect(amy).not.toContain('Cutstep');
    expect(amy).not.toContain('o1');
  });

  it("the offer carries the merged skill's text, given to it on accept", () => {
    const c = run([
      ...start(),
      { ...offer(), description: 'Cut while stepping.', flavor: 'Never still.' } as Command,
    ]);
    expect(projectForPlayer(c.state!, ID).me.mergeOffer).toMatchObject({
      description: 'Cut while stepping.',
      flavor: 'Never still.',
    });
    const done = run([answer(true)], player(ID), c);
    expect(done.state!.characters[ID]!.skills.find((s) => s.name === 'Cutstep')).toMatchObject({
      description: 'Cut while stepping.',
      flavor: 'Never still.',
    });
  });

  it('a bad offer is refused when sent', () => {
    const c = run(start());
    const r = execute(
      c,
      { type: 'skill.merge', characterId: ID, skills: ['Cut', 'Look'], name: 'X' },
      testContext('g'),
    );
    expect(r.ok).toBe(false);
  });

  it('accepting applies the merge (originals consumed, marks 0) with the merge DING', () => {
    const offered = run([...start(), offer()]);
    const done = run([answer(true)], player(ID), offered);
    expect(names(done)).not.toContain('Cut');
    expect(names(done)).not.toContain('Step');
    const merged = done.state!.characters[ID]!.skills.find((s) => s.name === 'Cutstep');
    expect(merged).toMatchObject({ rarity: 'rare', marks: 0 });
    expect(done.state!.characters[ID]!.mergeOffer).toBeNull();
    expect(notificationsBetween(offered.state, done.state, done.events.at(-1))).toEqual([
      {
        kind: 'skillMerge',
        characterId: ID,
        skills: ['Cut', 'Step'],
        name: 'Cutstep',
        rarity: 'Rare',
      },
    ]);
    const sent = run(start());
    expect(
      describeEvent(sent.state, offered.state!, offered.events.at(-1)!).map((l) => l.text),
    ).toEqual([expect.stringContaining('offered Jake a merge of Cut and Step')]);
    expect(describeEvent(offered.state, done.state!, done.events.at(-1)!)).toEqual([
      { kind: 'skill', text: 'Jake merged Cut and Step into Cutstep (Rare)' },
    ]);
  });

  it('declining keeps both originals; the GM sees the answer', () => {
    const offered = run([...start(), offer()]);
    const done = run([answer(false)], player(ID), offered);
    expect(names(done)).toEqual(expect.arrayContaining(['Cut', 'Step']));
    expect(done.state!.characters[ID]!.mergeOffer).toBeNull();
    expect(done.state!.characters[ID]!.merges).toEqual({});
    expect(done.events.at(-1)).toMatchObject({
      type: 'skill.mergeAnswered',
      payload: { accept: false },
    });
    // The GM's builder reads the answer from state; players never get it.
    expect(done.state!.characters[ID]!.lastMergeAnswer).toEqual({
      offerId: 'o1',
      skills: ['Cut', 'Step'],
      name: 'Cutstep',
      accept: false,
    });
    expect(JSON.stringify(projectForPlayer(done.state!, ID))).not.toContain('lastMergeAnswer');
    expect(describeEvent(offered.state, done.state!, done.events.at(-1)!)).toEqual([
      { kind: 'skill', text: 'Jake declined merging Cut and Step' },
    ]);
    // A decline leaves the grade's merge unused: the GM may offer again.
    expect(() => run([offer('o2')], testContext('g'), done)).not.toThrow();
  });

  it('only the owner answers, and only the open offer', () => {
    const offered = run([...start(), offer()]);
    expect(execute(offered, answer(true, 'o1', 'amy'), player('amy')).ok).toBe(false);
    expect(execute(offered, answer(true), player('amy')).ok).toBe(false);
    expect(execute(offered, answer(true, 'nope'), player(ID)).ok).toBe(false);
    const done = run([answer(false)], player(ID), offered);
    expect(execute(done, answer(true), player(ID)).ok).toBe(false);
  });

  it('a stale offer (replaced, or a skill changed) is refused', () => {
    const replaced = run([...start(), offer('o1'), offer('o2', 'Stepcut')]);
    expect(execute(replaced, answer(true, 'o1'), player(ID)).ok).toBe(false);
    const ok = run([answer(true, 'o2')], player(ID), replaced);
    expect(names(ok)).toContain('Stepcut');

    // Cut is upgraded after the offer: the player never saw that merge.
    const changed = run(
      [
        ...[1, 2, 3, 4, 5, 6].map((n): Command => ({
          type: 'skill.awardMark',
          characterId: ID,
          skill: 'Cut',
          session: `m${n}`,
        })),
        { type: 'skill.upgrade', characterId: ID, skill: 'Cut' },
      ],
      testContext('g'),
      run([...start(), offer()]),
    );
    expect(projectForPlayer(changed.state!, ID).me.mergeOffer?.rarity).toBeNull();
    const stale = execute(changed, answer(true), player(ID));
    expect(stale).toMatchObject({ ok: false, error: expect.stringContaining('out of date') });
    // Declining a stale offer still clears it.
    expect(run([answer(false)], player(ID), changed).state!.characters[ID]!.mergeOffer).toBeNull();
  });

  it('an offer that no longer applies shows no rarity and cannot be accepted', () => {
    const offered = run([...start(), offer()]);
    const removed = run(
      [{ type: 'practice.remove', entryId: offered.state!.practice[0]!.id }],
      testContext('r'),
      offered,
    );
    expect(projectForPlayer(removed.state!, ID).me.mergeOffer).toMatchObject({ rarity: null });
    expect(execute(removed, answer(true), player(ID))).toMatchObject({
      ok: false,
      error: expect.stringContaining('logged together 2 times'),
    });
  });

  it('stored skill.merged events replay unchanged', () => {
    const offered = run([...start(), offer()]);
    const merged = run([answer(true)], player(ID), offered);
    // A pre-MT.2 log: the GM applied the merge directly.
    const legacy = [
      ...offered.events.slice(0, -1),
      {
        ...offered.events.at(-1)!,
        type: 'skill.merged',
        payload: { characterId: ID, skills: [...pair], name: 'Cutstep' },
      },
    ];
    const replayed = replay(legacy);
    expect(replayed.state!.characters[ID]!.skills).toEqual(merged.state!.characters[ID]!.skills);
    expect(replay(merged.events).state).toEqual(merged.state);
  });
});
