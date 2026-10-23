import { describe, expect, it } from 'vitest';
import { mergeCandidates, notificationsBetween, type Command } from '../src';
import { rawRules, run, testContext } from './helpers/events';

// M5.4: merge builder candidates (DESIGN §6) and the merge DING.

const ID = 'jake';
const pair = ['Cut', 'Step'];
const start = (rarity: string): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  {
    type: 'character.create',
    id: ID,
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Cut', rarity },
      { name: 'Step', rarity: 'uncommon' },
      { name: 'Look', rarity: 'common' },
    ],
  },
  { type: 'session.start', sessionId: 'p1' },
  ...['One', 'Two', 'Three'].map((action): Command => ({
    type: 'practice.log',
    characterId: ID,
    action,
    skills: pair,
  })),
];

describe('mergeCandidates (M5.4)', () => {
  it('a ready pair shows the merged rarity; merging tells only the owner', () => {
    const c = run(start('uncommon'));
    expect(mergeCandidates(c.state!, ID)).toEqual([
      { skills: ['Cut', 'Step'], count: 3, rarity: 'rare', problem: null },
    ]);
    const merged = run(
      [{ type: 'skill.merge', characterId: ID, skills: ['Cut', 'Step'], name: 'Cutstep' }],
      testContext('m'),
      c,
    );
    expect(notificationsBetween(c.state, merged.state, merged.events.at(-1))).toEqual([
      {
        kind: 'skillMerge',
        characterId: ID,
        skills: ['Cut', 'Step'],
        name: 'Cutstep',
        rarity: 'Rare',
      },
    ]);
    expect(mergeCandidates(merged.state!, ID)).toEqual([]);
  });

  it('a pair below the merge rarity says why; unknown characters have none', () => {
    const c = run(start('common'));
    const [candidate] = mergeCandidates(c.state!, ID);
    expect(candidate).toMatchObject({ rarity: null });
    expect(candidate!.problem).toContain('[Cut] must be at least Uncommon');
    expect(mergeCandidates(c.state!, 'ghost')).toEqual([]);
  });

  it('the ceiling and one-merge-per-grade refusals are shown; a consumed skill drops its other alerts', () => {
    const log = (skills: string[], n = 3): Command[] =>
      Array.from({ length: n }, (_, i): Command => ({
        type: 'practice.log',
        characterId: ID,
        action: `${skills.join(' and ')} ${i}`,
        skills,
      }));
    const c = run([
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      {
        type: 'character.create',
        id: ID,
        name: 'Jake',
        className: 'Archer',
        classSkills: [
          { name: 'Cut', rarity: 'uncommon' },
          { name: 'Step', rarity: 'uncommon' },
          { name: 'Look', rarity: 'rare' },
        ],
      },
      { type: 'session.start', sessionId: 'p1' },
      ...log(['Cut', 'Step']),
      ...log(['Cut', 'Look']),
    ]);
    const before = mergeCandidates(c.state!, ID);
    expect(before.map((x) => x.skills)).toEqual(
      expect.arrayContaining([
        ['Cut', 'Step'],
        ['Cut', 'Look'],
      ]),
    );
    // Rare + Uncommon would be Epic, above the G-grade ceiling (Rare).
    const look = before.find((x) => x.skills.includes('Look'));
    expect(look).toMatchObject({ rarity: null });
    expect(look!.problem).toBe('The merged skill would be above the G-grade ceiling');
    const merged = run(
      [
        { type: 'skill.merge', characterId: ID, skills: ['Cut', 'Step'], name: 'Cutstep' },
        ...log(['Cutstep', 'Look']),
      ],
      testContext('m'),
      c,
    );
    // Cut is gone, so Cut + Look is no longer an alert; the new pair is refused.
    const after = mergeCandidates(merged.state!, ID);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ skills: ['Cutstep', 'Look'], rarity: null });
    expect(after[0]!.problem).toBe('Already merged at G-grade');
  });
});
