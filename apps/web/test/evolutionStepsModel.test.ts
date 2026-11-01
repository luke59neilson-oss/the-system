import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
  type RulesConfig,
} from '@the-system/engine';
import {
  nearThreshold,
  releaseBlockers,
  standingOf,
  stepMeters,
  stepsCommand,
  stepsReleaseProblem,
  type DraftOption,
} from '../src/gm/evolutionStepsModel';

/** Jake, an Archer at the G-grade top (race level 4), with some practice logged. */
function atGTop(): Campaign {
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-11-01T01:00:00.000Z',
    newId: () => `e${++n}`,
  };
  const commands: Command[] = [
    { type: 'campaign.create', name: 'Evolve', rules: DEFAULT_RULES },
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    },
    { type: 'xp.award', track: 'class', amount: 400, participants: [{ characterId: 'jake' }] },
    {
      type: 'practice.log',
      characterId: 'jake',
      action: 'shot from cover',
      skills: ['Basic Archery', 'Basic Stealth'],
    },
    { type: 'practice.log', characterId: 'jake', action: 'long shot', skills: ['Basic Archery'] },
  ];
  let c = emptyCampaign();
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
    c = r.campaign;
  }
  return c;
}

const o = (
  id: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number>,
): DraftOption => ({
  id,
  name: id,
  rarity: 'common',
  description: '',
  stats,
  free,
  bonus,
});

describe('Evolutions tab model (ME.3)', () => {
  it('meters each option against the step budget and the first option’s bonus', () => {
    expect(
      stepMeters(
        [
          o('Hunter', { agility: 9 }, 2, { agility: 2 }),
          o('Ranger', { agility: 8 }, 2, { agility: 3 }),
        ],
        11,
      ),
    ).toEqual([
      { perLevel: 11, budget: 11, perLevelDiff: 0, bonus: 2, bonusDiff: 0 },
      { perLevel: 10, budget: 11, perLevelDiff: -1, bonus: 3, bonusDiff: 1 },
    ]);
  });

  it('blocks release for missing steps and budget problems, Override only past the latter', () => {
    const budgets = { class: 11, profession: 7, race: 6 };
    const draft = {
      class: [
        o('Hunter', { agility: 9 }, 2, { agility: 2 }),
        o('Ranger', { agility: 9 }, 2, { agility: 3 }),
      ],
      profession: [],
      race: [],
    };
    const blocked = releaseBlockers(draft, budgets, true);
    expect(blocked.hard).toEqual([
      'Add at least one race option',
      'Add at least one profession option: this character evolves their profession',
    ]);
    expect(blocked.overridable).toEqual([
      'Class options have unequal one-time bonuses (2, 3); make them equal or tick Override',
    ]);
    expect(
      releaseBlockers({ ...draft, race: [o('Human', {}, 6, {})] }, budgets, false).hard,
    ).toEqual([]);
  });

  it('lists characters at or within 3 race levels of the threshold', () => {
    const at = (id: string, grade: string, classLevel: number) =>
      ({ id, grade, classLevel, professionLevel: 0, profession: null }) as unknown as Character;
    const rules = DEFAULT_RULES as unknown as RulesConfig;
    const last = rules.grades.at(-1)!.id;
    expect(
      nearThreshold(rules, [
        at('a', 'G', 0),
        at('b', 'G', 1),
        at('c', 'G', 4),
        at('d', 'F', 10),
        at('e', last, 999),
      ]),
    ).toEqual([
      { id: 'b', levelsToGo: 3 },
      { id: 'c', levelsToGo: 0 },
    ]);
    // The class gate counts class levels, as the engine does (ME.3 review).
    const classGate = {
      ...rules,
      tracks: { ...rules.tracks, evolutionGate: 'class' },
    } as RulesConfig;
    const split = {
      id: 'k',
      grade: 'F',
      classLevel: 14,
      professionLevel: 4,
      profession: 'Herbalist',
    } as unknown as Character;
    expect(nearThreshold(classGate, [split])).toEqual([{ id: 'k', levelsToGo: 0 }]);
    expect(nearThreshold(rules, [split])).toEqual([]);
    // A grade at the campaign cap never evolves.
    const capped = { ...rules, campaign: { ...rules.campaign, levelCap: 4 } } as RulesConfig;
    expect(nearThreshold(capped, [at('c', 'G', 4)])).toEqual([]);
  });

  it('dry-runs the release on the engine: an unequal bonus refuses, Override takes it', () => {
    const state = atGTop().state!;
    const draft = {
      class: [
        o('hunter', { perception: 6, agility: 3 }, 2, { agility: 2 }),
        o('ranger', { agility: 9 }, 2, { agility: 3 }),
      ],
      profession: [o('tracker', { perception: 5 }, 2, { perception: 2 })],
      race: [o('human-f', {}, 6, { vitality: 2 })],
    };
    const command = stepsCommand('jake', draft, { rerate: {}, override: false });
    expect(command.steps!.class[0]).toEqual({
      id: 'hunter',
      name: 'hunter',
      rarity: 'common',
      description: '',
      distribution: { stats: { perception: 6, agility: 3 }, free: 2 },
      statBonus: { agility: 2 },
    });
    expect(stepsReleaseProblem(state, command)).toMatch(/unequal one-time bonuses \(2, 3\)/);
    expect(
      stepsReleaseProblem(state, stepsCommand('jake', draft, { rerate: {}, override: true })),
    ).toBeNull();
    const fair = { ...draft, class: [draft.class[0]!] };
    expect(
      stepsReleaseProblem(state, stepsCommand('jake', fair, { rerate: {}, override: false })),
    ).toBeNull();
    // A transform the engine refuses (an unknown skill) is caught before release.
    expect(
      stepsReleaseProblem(
        state,
        stepsCommand('jake', fair, {
          rerate: {},
          override: true,
          transforms: { hunter: [{ skill: 'Nope', name: 'Nope+', rarity: 'common' }] },
        }),
      ),
    ).not.toBeNull();
    // The dry run never changes the GM's state.
    expect(state.characters['jake']!.evolution).toBeNull();
  });

  it('summarises the character’s standing beside the builder', () => {
    const s = standingOf(atGTop().state!, 'jake')!;
    expect(s.grade).toBe('G');
    expect(s.levels).toBe('Class 4 · Race 4');
    expect(s.stats).toHaveLength(9);
    expect(s.skills).toContain('Basic Archery (Inferior)');
    expect(s.practised).toEqual([
      { skill: 'Basic Archery', count: 2 },
      { skill: 'Basic Stealth', count: 1 },
    ]);
    expect(s.pairs.map((p) => [...p.skills, p.count])).toEqual([
      ['Basic Archery', 'Basic Stealth', 1],
    ]);
    expect(standingOf(atGTop().state!, 'ghost')).toBeNull();
  });
});
