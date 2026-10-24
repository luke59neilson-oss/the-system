import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type CampaignState,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import {
  clockRows,
  contestPlan,
  factorText,
  montageProgress,
  outcomeText,
  percent,
  poolChange,
  poolCommand,
  recentContests,
  refreshSide,
  rollPlan,
  shareCommand,
  sideDraftFor,
  sideOptions,
  type SideDraft,
} from '../src/gm/encounterModel';

let n = 0;
const ctx: CommandContext = {
  actor: { role: 'gm' },
  sessionId: null,
  now: () => '2026-10-24T12:00:00.000Z',
  newId: () => `x${++n}`,
};
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

function apply(c: Campaign, commands: Command[]): Campaign {
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c;
}

function campaign(): Campaign {
  return apply(emptyCampaign(), [
    { type: 'campaign.create', name: 'Fight', rules: DEFAULT_RULES },
    { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    {
      type: 'entity.define',
      entityId: 'hunter',
      name: 'Pale hunter',
      label: 'Pale stalker',
      tiers: [{ minRarity: 'common', text: '[Pale stalker]' }],
      grade: 'F',
      level: 12,
      stats: { strength: 30 },
    },
    {
      type: 'entity.define',
      entityId: 'place',
      name: 'The Crown',
      label: 'The Crown',
      tiers: [{ minRarity: 'common', text: '[The Crown]' }],
    },
  ]);
}
const stateOf = (c: Campaign): CampaignState => {
  if (!c.state) throw new Error('no state');
  return c.state;
};

describe('encounter model: contests (M7.3)', () => {
  const state = stateOf(campaign());

  it('lists characters, bestiary entries with a grade or stats, and a custom value', () => {
    expect(sideOptions(state)).toEqual([
      { source: 'c:jake', name: 'Jake' },
      { source: 'c:kim', name: 'Kim' },
      { source: 'e:hunter', name: 'Pale hunter (bestiary)' },
      { source: 'custom', name: 'Custom value' },
    ]);
  });

  it('fills a side from a character (effective stat, grade) and an entity (player label)', () => {
    expect(sideDraftFor(state, 'c:jake', 'perception')).toEqual({
      source: 'c:jake',
      stat: 'perception',
      label: 'Jake · Perception',
      value: '10',
      grade: 'G',
    });
    expect(sideDraftFor(state, 'e:hunter', 'strength')).toEqual({
      source: 'e:hunter',
      stat: 'strength',
      label: 'Pale stalker',
      value: '30',
      grade: 'F',
    });
    // A stat the bestiary lacks is left blank for the GM.
    expect(sideDraftFor(state, 'e:hunter', 'agility').value).toBe('');
  });

  it('plans with the grade walls: one grade apart counts the lower side ×⅓', () => {
    const a = sideDraftFor(state, 'c:jake', 'strength');
    const b = sideDraftFor(state, 'e:hunter', 'strength');
    const plan = contestPlan(state, a, b, 'gradeWalls');
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.chance).toBeCloseTo(10 / 3 / (10 / 3 + 30));
    expect(plan.walled).toBe(false);
    expect(plan.a.characterIds).toEqual(['jake']);
    expect(plan.b.characterIds).toEqual([]);
    const none = contestPlan(state, a, b, 'none');
    if (typeof none === 'string') throw new Error(none);
    expect(none.chance).toBe(0.25);
  });

  it('reports the first problem in a side', () => {
    const a = sideDraftFor(state, 'c:jake', 'strength');
    const blank: SideDraft = { ...a, label: ' ' };
    expect(contestPlan(state, blank, a, 'none')).toBe('Side A: give it a label the table sees');
    expect(contestPlan(state, a, { ...a, source: 'custom', value: '-1' }, 'none')).toBe(
      'Side B: the value must be a number ≥ 0',
    );
    expect(contestPlan(state, a, a, 'none')).toBe('A character cannot be on both sides');
    expect(contestPlan(state, a, { ...a, source: 'custom', grade: 'Z' }, 'none')).toBe(
      'Side B: pick a grade',
    );
  });

  it('rolls without a draw behind a grade wall, and shares the roll it showed', () => {
    const a = sideDraftFor(state, 'c:jake', 'strength');
    const wall = { ...sideDraftFor(state, 'e:hunter', 'strength'), grade: 'E' };
    const plan = contestPlan(state, a, wall, 'gradeWalls');
    if (typeof plan === 'string') throw new Error(plan);
    let draws = 0;
    const rolled = rollPlan(state, plan, () => {
      draws++;
      return 0;
    });
    expect(draws).toBe(0);
    expect(rolled.result).toMatchObject({ walled: true, success: false });
    expect(outcomeText(rolled)).toBe('Pale stalker wins: a grade wall, no roll');

    const even = contestPlan(state, a, sideDraftFor(state, 'c:kim', 'strength'), 'none');
    if (typeof even === 'string') throw new Error(even);
    const r2 = rollPlan(state, even, () => 0.42);
    expect(outcomeText(r2)).toBe('Jake · Strength wins (Jake · Strength 50%, rolled 42)');
    const c = apply(campaign(), [shareCommand(r2)]);
    const shared = recentContests(stateOf(c));
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ roll: 0.42, success: true, chance: 0.5 });
  });

  it('formats percentages without hiding long odds', () => {
    expect(percent(0.75)).toBe('75%');
    expect(percent(0.004)).toBe('<1%');
    expect(percent(0.996)).toBe('>99%');
    expect(percent(0)).toBe('0%');
    expect(percent(1)).toBe('100%');
  });
});

describe('encounter model: sides follow the campaign (M7.A)', () => {
  const before = campaign();
  const after = apply(before, [
    { type: 'character.setStats', characterId: 'jake', stats: { strength: 17 } },
  ]);
  const prev = stateOf(before);
  const next = stateOf(after);

  it('takes a character’s new stat when the side still shows the old one', () => {
    const side = sideDraftFor(prev, 'c:jake', 'strength');
    expect(side.value).toBe('10');
    expect(refreshSide(prev, next, side)).toEqual({ ...side, value: '17' });
  });

  it('keeps what the GM typed, a custom side, and an unchanged side as they are', () => {
    const typed = { ...sideDraftFor(prev, 'c:jake', 'strength'), value: '25' };
    expect(refreshSide(prev, next, typed)).toBe(typed);
    const kim = sideDraftFor(prev, 'c:kim', 'strength');
    expect(refreshSide(prev, next, kim)).toBe(kim);
    const custom: SideDraft = { source: 'custom', stat: '', label: 'Rock', value: '5', grade: 'G' };
    expect(refreshSide(prev, next, custom)).toBe(custom);
  });

  it('follows a bestiary edit and empties a side whose source is gone', () => {
    const edited = stateOf(
      apply(before, [
        {
          type: 'entity.edit',
          entityId: 'hunter',
          name: 'Pale hunter',
          label: 'Pale stalker',
          tiers: [{ minRarity: 'common', text: '[Pale stalker]' }],
          grade: 'F',
          level: 12,
          stats: { strength: 42 },
        },
      ]),
    );
    const hunter = sideDraftFor(prev, 'e:hunter', 'strength');
    expect(refreshSide(prev, edited, hunter)).toEqual({ ...hunter, value: '42' });
    const ghost: SideDraft = { ...sideDraftFor(prev, 'c:jake', 'strength'), source: 'c:gone' };
    expect(refreshSide(prev, next, ghost)).toEqual(sideDraftFor(next, 'custom', ''));
  });
});

describe('encounter model: damage and healing (M7.3)', () => {
  it('applies damage with the grade-wall factor and clamps at 0; heals clamp at the max', () => {
    const c = apply(campaign(), [
      { type: 'character.setPools', characterId: 'jake', pools: { hp: 80 } },
    ]);
    const state = stateOf(c);
    const base = {
      characterId: 'jake',
      pool: 'hp',
      kind: 'damage' as const,
      amount: '30',
      attackerGrade: '',
    };
    expect(poolChange(state, base)).toMatchObject({ before: 80, after: 50, max: 100, factor: 1 });
    // Jake is G-grade, so an F-grade attacker is above him: full damage.
    expect(poolChange(state, { ...base, attackerGrade: 'F' })).toMatchObject({ after: 50 });
    expect(poolChange(state, { ...base, amount: '500' })).toMatchObject({
      after: 0,
      applied: 80,
    });
    const heal = poolChange(state, { ...base, kind: 'heal', amount: '50' });
    expect(heal).toMatchObject({ after: 100, applied: 20 });
    if (typeof heal === 'string') throw new Error(heal);
    expect(poolCommand(heal)).toEqual({
      type: 'character.setPools',
      characterId: 'jake',
      pools: { hp: 100 },
    });
    expect(poolChange(state, { ...base, amount: '1.5' })).toBe(
      'The amount must be a whole number ≥ 1',
    );
    expect(poolChange(state, { ...base, amount: ' ' })).toBe('Enter an amount');
    expect(poolChange(state, { ...base, characterId: 'nobody' })).toBe('Pick a character');
  });

  it('a lower-grade attacker deals ⅓ (one below) or nothing (two below)', () => {
    const c = apply(campaign(), [
      { type: 'character.setPools', characterId: 'jake', pools: { hp: 80 } },
    ]);
    const s = stateOf(c);
    const jake = s.characters['jake'];
    if (!jake) throw new Error('no jake');
    // Pretend Jake is E-grade for the factor: rebuild the state with his grade raised.
    const raised: CampaignState = {
      ...s,
      characters: { ...s.characters, jake: { ...jake, grade: 'E' } },
    };
    const input = {
      characterId: 'jake',
      pool: 'hp',
      kind: 'damage' as const,
      amount: '30',
      attackerGrade: 'F',
    };
    expect(poolChange(raised, input)).toMatchObject({ factor: 1 / 3, applied: 10 });
    expect(poolChange(raised, { ...input, attackerGrade: 'G' })).toMatchObject({
      factor: 0,
      applied: 0,
    });
    expect(factorText(1 / 3)).toBe('×⅓ damage (one grade below)');
    expect(factorText(0)).toBe('no damage (two or more grades below)');
    expect(factorText(1)).toBe('full damage');
  });
});

describe('encounter model: clocks and montages (M7.3)', () => {
  it('marks a clock montage-ready at half with no failures, until a montage is open', () => {
    let c = apply(campaign(), [
      { type: 'clock.create', clockId: 'k', name: 'Cross the marsh', segments: 4 },
      { type: 'clock.tick', clockId: 'k', result: 'success', amount: 1 },
    ]);
    expect(clockRows(stateOf(c))[0]).toMatchObject({ montageReady: false, complete: false });
    c = apply(c, [{ type: 'clock.tick', clockId: 'k', result: 'success', amount: 1 }]);
    expect(clockRows(stateOf(c))[0]).toMatchObject({ montageReady: true });
    c = apply(c, [
      { type: 'montage.offer', montageId: 'm', clockId: 'k', characterIds: ['jake', 'kim'] },
      {
        type: 'montage.focus',
        montageId: 'm',
        characterId: 'jake',
        action: 'Scouts ahead',
        skills: [],
        stat: null,
      },
    ]);
    const row = clockRows(stateOf(c))[0];
    expect(row).toMatchObject({ montageReady: false });
    expect(row?.montages.map((m) => m.id)).toEqual(['m']);
    const m = row?.montages[0];
    if (!m) throw new Error('no montage');
    expect(montageProgress(stateOf(c), m)).toEqual({ done: ['Jake'], waiting: ['Kim'] });
    c = apply(c, [
      { type: 'clock.tick', clockId: 'k', result: 'success', amount: 2 },
      { type: 'montage.close', montageId: 'm' },
    ]);
    expect(clockRows(stateOf(c))[0]).toMatchObject({ complete: true, montageReady: false });
  });
});
