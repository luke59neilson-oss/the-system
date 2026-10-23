import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { builderSlots, offerProblem } from '../src/gm/offerBuilderModel';

// M5.1 (in progress): the offer builder's model agrees with the engine.
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
});
