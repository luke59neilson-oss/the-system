import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import {
  builderSlots,
  offerProblem,
  practiceSkillCounts,
  practiceStatCounts,
  recentPractice,
} from '../src/gm/offerBuilderModel';

// M5.1: the offer builder's model agrees with the engine.
function campaign(): Campaign {
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as {
    grades: { selectionInterval: number | null }[];
  };
  rules.grades[0]!.selectionInterval = 2; // G selections at 2 and 4 (capstone)
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-23T12:00:00.000Z',
    newId: () => `e${++n}`,
  };
  const commands: Command[] = [
    { type: 'campaign.create', name: 'Offers', rules },
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
  ];
  let c = emptyCampaign();
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c;
}

const opt = (name: string, rarity = 'rare') => ({
  name,
  rarity,
  kind: 'class' as const,
  description: '',
});

describe('offer builder model (M5.1)', () => {
  it('lists due selections with the capstone and ceiling', () => {
    const state = campaign().state!;
    const slots = builderSlots(state, 'jake');
    expect(slots.map((s) => [s.level, s.capstone, s.ceiling, s.pending])).toEqual([
      [2, false, 'rare', null],
      [4, true, 'rare', null],
    ]);
    expect(builderSlots(state, 'ghost')).toEqual([]);
  });

  it('reports what the engine would refuse, and accepts a valid menu', () => {
    const state = campaign().state!;
    expect(offerProblem(state, 'jake', 2, [opt('A')])).toMatch(/option/i);
    expect(
      offerProblem(state, 'jake', 4, [opt('A', 'common'), opt('B', 'common'), opt('C', 'common')]),
    ).toMatch(/capstone/);
    expect(
      offerProblem(state, 'jake', 4, [opt('A'), opt('B', 'common'), opt('C', 'common')]),
    ).toBeNull();
    expect(offerProblem(state, 'ghost', 2, [])).toBe('No such character.');
  });

  it('lists a character’s practice newest first, capped', () => {
    const c = campaign();
    let n = 100;
    const ctx: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now: () => '2026-10-23T12:00:00.000Z',
      newId: () => `p${++n}`,
    };
    let state = c;
    for (const action of ['one', 'two', 'three']) {
      const r = execute(
        state,
        { type: 'practice.log', characterId: 'jake', action, stat: 'agility' },
        ctx,
      );
      if (!r.ok) throw new Error(r.error);
      state = r.campaign;
    }
    expect(recentPractice(state.state!, 'jake').map((e) => e.action)).toEqual([
      'three',
      'two',
      'one',
    ]);
    expect(recentPractice(state.state!, 'jake', 2).map((e) => e.action)).toEqual(['three', 'two']);
    expect(recentPractice(state.state!, 'ghost')).toEqual([]);
  });

  it('counts each skill once per practice entry, most used first', () => {
    let state = campaign();
    let n = 200;
    const ctx: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now: () => '2026-10-23T12:00:00.000Z',
      newId: () => `q${++n}`,
    };
    const logs: string[][] = [
      ['Basic Archery'],
      ['Basic Archery', 'Basic Stealth'],
      ['Basic Stealth', 'Basic Archery'],
      ['Archer’s Eye'],
    ];
    for (const skills of logs) {
      const r = execute(
        state,
        { type: 'practice.log', characterId: 'jake', action: 'shot', skills },
        ctx,
      );
      if (!r.ok) throw new Error(r.error);
      state = r.campaign;
    }
    expect(practiceSkillCounts(state.state!, 'jake')).toEqual([
      { skill: 'Basic Archery', count: 3 },
      { skill: 'Basic Stealth', count: 2 },
      { skill: 'Archer’s Eye', count: 1 },
    ]);
    expect(practiceSkillCounts(state.state!, 'ghost')).toEqual([]);
    expect(practiceStatCounts(state.state!, 'jake')).toEqual([]);
  });

  it('counts the stats exercised, most first', () => {
    let state = campaign();
    let n = 300;
    const ctx: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now: () => '2026-10-23T12:00:00.000Z',
      newId: () => `s${++n}`,
    };
    for (const stat of ['agility', 'perception', 'agility']) {
      const r = execute(
        state,
        { type: 'practice.log', characterId: 'jake', action: 'x', stat },
        ctx,
      );
      if (!r.ok) throw new Error(r.error);
      state = r.campaign;
    }
    expect(practiceStatCounts(state.state!, 'jake')).toEqual([
      { stat: 'agility', count: 2 },
      { stat: 'perception', count: 1 },
    ]);
  });
});
