import { describe, expect, it } from 'vitest';
import { characterFlags, unassignedFreePoints, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M4.5: the party dashboard's flags (DESIGN §2-§6) on default rules.

const ID = 'jake';
const start: Command[] = [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  { type: 'character.create', id: ID, name: 'Jake', className: 'Archer', classSkills: kit },
];
const award = (amount: number): Command => ({
  type: 'xp.award',
  track: 'class',
  amount,
  participants: [{ characterId: ID }],
});
const marks = (skill: string, n: number, tag: string): Command[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'skill.awardMark',
    characterId: ID,
    skill,
    session: `${tag}${i}`,
  }));
const evolveToF: Command[] = [
  award(400),
  { type: 'evolution.release', characterId: ID, options: [{ className: 'Archer' }] },
  { type: 'evolution.choose', characterId: ID, optionId: 'o1' },
];
const flags = (c: Campaign) => characterFlags(c.state!, ID);
const kinds = (c: Campaign) => flags(c).map((f) => f.kind);

describe('characterFlags (M4.5)', () => {
  it('a new character has no flags; an unknown id has none either', () => {
    const c = run(start);
    expect(flags(c)).toEqual([]);
    expect(characterFlags(c.state!, 'ghost')).toEqual([]);
  });

  it('free points from a level-up wait on the player until assigned', () => {
    const c = run([...start, award(100)]);
    expect(flags(c)).toEqual([{ kind: 'freePoints', points: 2 }]);
    expect(unassignedFreePoints(c.state!.characters[ID]!)).toBe(2);
    const assigned = run(
      [
        {
          type: 'freePoints.assign',
          characterId: ID,
          raceLevel: 1,
          allocation: { strength: 2 },
        },
      ],
      testContext('b'),
      c,
    );
    expect(kinds(assigned)).toEqual([]);
  });

  it('evolution: ready at the top of G, then released until the player chooses', () => {
    const top = run([...start, award(400)]);
    expect(flags(top)).toContainEqual({ kind: 'evolution', toGrade: 'F', status: 'ready' });
    const released = run([evolveToF[1]!], testContext('r'), top);
    expect(flags(released)).toContainEqual({
      kind: 'evolution',
      toGrade: 'F',
      status: 'released',
    });
    const chosen = run([evolveToF[2]!], testContext('c'), released);
    expect(kinds(chosen)).not.toContain('evolution');
  });

  it('a reached selection needs a menu, then waits on the player; a pending one blocks evolution', () => {
    const f = run([...start, ...evolveToF, award(300)]);
    expect(flags(f)).toContainEqual({
      kind: 'selection',
      level: 5,
      capstone: false,
      offered: false,
    });
    const offered = run(
      [
        {
          type: 'selection.offer',
          characterId: ID,
          level: 5,
          options: [
            { name: 'Quick Draw', rarity: 'common' },
            { name: 'Steady Aim', rarity: 'common' },
            { name: 'Hunter’s Mark', rarity: 'uncommon' },
          ],
        },
      ],
      testContext('o'),
      f,
    );
    expect(flags(offered)).toContainEqual({
      kind: 'selection',
      level: 5,
      capstone: false,
      offered: true,
    });
    // To the top of F (14) with both F selections still open: evolution is blocked.
    const capped = run([award(9 * 300)], testContext('t'), offered);
    const evo = flags(capped).filter((x) => x.kind === 'evolution');
    expect(evo).toEqual([{ kind: 'evolution', toGrade: 'E', status: 'blocked' }]);
    // A released evolution with a selection due (a release stored before the
    // gate, or a selection reached later) is blocked too: choose is refused.
    const jake = capped.state!.characters[ID]!;
    const releasedState = {
      ...capped.state!,
      characters: {
        ...capped.state!.characters,
        [ID]: {
          ...jake,
          evolution: { toGrade: 'E', releaseId: 'r', options: [], professions: [] },
        },
      },
    };
    expect(characterFlags(releasedState, ID).filter((x) => x.kind === 'evolution')).toEqual([
      { kind: 'evolution', toGrade: 'E', status: 'blocked' },
    ]);
    expect(flags(capped).filter((x) => x.kind === 'selection')).toEqual([
      { kind: 'selection', level: 5, capstone: false, offered: true },
      { kind: 'selection', level: 10, capstone: true, offered: false },
    ]);
  });

  it('flags a skill with the marks to upgrade, and not once upgraded', () => {
    const ready = run([...start, ...marks('Basic Archery', 3, 'a')]);
    expect(flags(ready)).toEqual([{ kind: 'upgrade', skill: 'Basic Archery', marks: 3 }]);
    const done = run(
      [{ type: 'skill.upgrade', characterId: ID, skill: 'Basic Archery' }],
      testContext('u'),
      ready,
    );
    expect(kinds(done)).toEqual([]);
  });

  it('flags a merge only when every merge rule passes', () => {
    const log = (n: number, tag: string): Command[] =>
      Array.from({ length: n }, (_, i) => ({
        type: 'practice.log',
        characterId: ID,
        action: `volley ${tag}${i}`,
        skills: ['Basic Archery', 'Archer’s Eye'],
      }));
    // Logged together three times, but both are below Uncommon: no flag.
    const low = run([...start, ...log(3, 'x')]);
    expect(kinds(low)).not.toContain('merge');
    // Raise both to Uncommon by marks: now the merge is offered.
    const raised = run(
      [
        ...marks('Basic Archery', 3, 'a'),
        { type: 'skill.upgrade', characterId: ID, skill: 'Basic Archery' },
        ...marks('Basic Archery', 4, 'b'),
        { type: 'skill.upgrade', characterId: ID, skill: 'Basic Archery' },
        ...marks('Archer’s Eye', 4, 'c'),
        { type: 'skill.upgrade', characterId: ID, skill: 'Archer’s Eye' },
      ],
      testContext('m'),
      low,
    );
    expect(flags(raised)).toEqual([
      { kind: 'merge', skills: ['Archer’s Eye', 'Basic Archery'], count: 3 },
    ]);
    // One merge per grade: after merging, a second pair does not flag.
    const merged = run(
      [
        {
          type: 'skill.merge',
          characterId: ID,
          skills: ['Basic Archery', 'Archer’s Eye'],
          name: 'Hawk Volley',
        },
      ],
      testContext('g'),
      raised,
    );
    expect(kinds(merged)).not.toContain('merge');
  });
});
