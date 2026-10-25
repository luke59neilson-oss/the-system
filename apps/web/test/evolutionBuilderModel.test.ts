import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { evolutionPlan, releaseProblem, withdrawableOffers } from '../src/gm/evolutionBuilderModel';

// M5.2: the evolution builder's model agrees with the engine.
function campaign(
  classXp: number,
  extra: Command[] = [],
  rarity = 'inferior',
  stealth = rarity,
): Campaign {
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-23T12:00:00.000Z',
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
        { name: 'Basic Archery', rarity },
        { name: 'Basic Stealth', rarity: stealth },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    },
    { type: 'xp.award', track: 'class', amount: classXp, participants: [{ characterId: 'jake' }] },
    ...extra,
  ];
  let c = emptyCampaign();
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c;
}

const option = {
  id: 'o1',
  className: 'Hunter',
  description: '',
  transforms: [],
  classWeights: null,
  statBonus: {},
};

describe('evolution builder model (M5.2)', () => {
  it('has nothing to build before the top of the grade', () => {
    expect(evolutionPlan(campaign(100).state!, 'jake')).toBeNull();
    expect(evolutionPlan(campaign(100).state!, 'ghost')).toBeNull();
  });

  it('plans the F evolution with every skill kept by default (MT.1)', () => {
    const plan = evolutionPlan(campaign(400).state!, 'jake')!;
    expect(plan.toGrade).toBe('F');
    expect(plan.pendingSelections).toEqual([]);
    expect(plan.professionOffers).toBe(false);
    expect(plan.released).toBeNull();
    const archery = plan.rerate.find((r) => r.skill === 'Basic Archery')!;
    expect([archery.from, archery.byDefault]).toEqual(['inferior', 'inferior']);
    const eye = plan.rerate.find((r) => r.skill === 'Archer’s Eye')!;
    expect([eye.from, eye.byDefault]).toEqual(['common', 'common']);
    expect(eye.choices).toEqual(['inferior', 'common', 'uncommon', 'rare']);
    // Identify is a race skill: never offered below its rarity.
    const identify = plan.rerate.find((r) => r.skill === 'Identify')!;
    expect(identify.choices).toEqual(['common', 'uncommon', 'rare']);
  });

  it('reports what the engine would refuse', () => {
    const state = campaign(400).state!;
    expect(releaseProblem(state, 'jake', [option], [], [])).toBeNull();
    expect(releaseProblem(state, 'jake', [], [], [])).not.toBeNull();
    expect(releaseProblem(state, 'ghost', [option], [], [])).toBe('No such character.');
  });

  it('limits transforms by the rules and lists no withdrawable offers without any', () => {
    const plan = evolutionPlan(campaign(400).state!, 'jake')!;
    expect(plan.transforms).toEqual(DEFAULT_RULES.skills.evolutionTransforms);
    expect(plan.rarities.at(-1)).toBe('rare');
    expect(plan.mergePrompts).toEqual([]);
    expect(withdrawableOffers(campaign(400).state!)).toEqual([]);
  });

  it('checks a merge transform against the practice log, as the engine does', () => {
    const state = campaign(400).state!;
    const merge = {
      ...option,
      transforms: [{ skill: 'Basic Archery', merge: 'Basic Stealth', name: 'X', rarity: 'rare' }],
    };
    expect(releaseProblem(state, 'jake', [merge], [], [])).toMatch(/must be at least/);
  });

  it('judges a merge from the higher skill and needs both at the minimum (QF.16)', () => {
    const log: Command[] = [1, 2, 3].map((i) => ({
      type: 'practice.log',
      characterId: 'jake',
      action: `shot ${i}`,
      skills: ['Basic Archery', 'Basic Stealth'],
    }));
    // Uncommon + Rare lands at Epic, above the F ceiling: no prompt.
    expect(
      evolutionPlan(campaign(400, log, 'uncommon', 'rare').state!, 'jake')!.mergePrompts,
    ).toEqual([]);
    // Uncommon + Inferior: the Inferior partner is below the merge minimum.
    expect(
      evolutionPlan(campaign(400, log, 'uncommon', 'inferior').state!, 'jake')!.mergePrompts,
    ).toEqual([]);
  });

  it('prompts a ready merge at the new ceiling and flags a release made unchoosable', () => {
    const log: Command[] = [1, 2, 3].map((i) => ({
      type: 'practice.log',
      characterId: 'jake',
      action: `shot ${i}`,
      skills: ['Basic Archery', 'Basic Stealth'],
    }));
    const ready = campaign(400, log, 'uncommon');
    const plan = evolutionPlan(ready.state!, 'jake')!;
    expect(plan.mergePrompts).toEqual([
      { skills: ['Basic Archery', 'Basic Stealth'], rarity: 'rare' },
    ]);
    expect(plan.mergesLeft).toBe(1);
    expect(plan.stale).toEqual([]);
    const released = campaign(
      400,
      [
        ...log,
        {
          type: 'evolution.release',
          rerateApproved: true,
          characterId: 'jake',
          options: [
            {
              className: 'Shade',
              transforms: [
                { skill: 'Basic Archery', merge: 'Basic Stealth', name: 'Ghost', rarity: 'rare' },
              ],
            },
          ],
        },
        {
          type: 'skill.merge',
          characterId: 'jake',
          skills: ['Basic Archery', 'Basic Stealth'],
          name: 'Twin',
        },
      ],
      'uncommon',
    );
    const after = evolutionPlan(released.state!, 'jake')!;
    expect(after.stale.map((x) => x.className)).toEqual(['Shade']);
    expect(after.mergesLeft).toBe(0);
    expect(after.mergePrompts).toEqual([]);
  });
});
