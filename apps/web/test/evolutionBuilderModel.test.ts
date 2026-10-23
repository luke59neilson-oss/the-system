import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { evolutionPlan, releaseProblem } from '../src/gm/evolutionBuilderModel';

// M5.2: the evolution builder's model agrees with the engine.
function campaign(classXp: number): Campaign {
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
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    },
    { type: 'xp.award', track: 'class', amount: classXp, participants: [{ characterId: 'jake' }] },
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

  it('plans the F evolution with the default re-rating', () => {
    const plan = evolutionPlan(campaign(400).state!, 'jake')!;
    expect(plan.toGrade).toBe('F');
    expect(plan.pendingSelections).toEqual([]);
    expect(plan.professionOffers).toBe(false);
    expect(plan.released).toBeNull();
    const archery = plan.rerate.find((r) => r.skill === 'Basic Archery')!;
    expect([archery.from, archery.byDefault]).toEqual(['inferior', 'inferior']);
    const eye = plan.rerate.find((r) => r.skill === 'Archer’s Eye')!;
    expect([eye.from, eye.byDefault]).toEqual(['common', 'inferior']);
    expect(eye.choices.at(-1)).toBe('rare');
  });

  it('reports what the engine would refuse', () => {
    const state = campaign(400).state!;
    expect(releaseProblem(state, 'jake', [option], [], [])).toBeNull();
    expect(releaseProblem(state, 'jake', [], [], [])).not.toBeNull();
    expect(releaseProblem(state, 'ghost', [option], [], [])).toBe('No such character.');
  });
});
