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
  characterStanding,
  draftFlags,
  offerProblem,
  parseCost,
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

describe('the character standing (MW.1)', () => {
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-23T12:00:00.000Z',
    newId: (() => {
      let n = 1000;
      return () => `s${++n}`;
    })(),
  };
  const run = (c: Campaign, commands: Command[]) =>
    commands.reduce((acc, command) => {
      const r = execute(acc, command, ctx);
      if (!r.ok) throw new Error(r.error);
      return r.campaign;
    }, c);
  const log = (skills: string[], action = 'Shot'): Command => ({
    type: 'practice.log',
    characterId: 'jake',
    action,
    skills,
  });

  it('a full character: stats split, skills, titles, equipment, practice pairs', () => {
    const state = run(campaign(), [
      {
        type: 'item.define',
        id: 'ring',
        name: 'Ring of Haste',
        rarity: 'uncommon',
        slot: 'ring',
        bonuses: [{ stat: 'agility', flat: 1 }],
      },
      { type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 } },
      { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' },
      { type: 'title.award', characterId: 'jake', title: 'Pathfinder' },
      log(['Basic Archery', 'Basic Stealth']),
      log(['Basic Stealth', 'Basic Archery', 'Archer’s Eye']),
    ]).state!;
    const s = characterStanding(state, 'jake')!;
    expect(s.grade).toBe(state.characters['jake']!.grade);
    expect(s.className).toBe('Archer');
    expect(s.classLevel).toBe(state.characters['jake']!.classLevel);
    expect(s.professionLevel).toBeNull();
    const agility = s.stats.find((x) => x.id === 'agility')!;
    expect(agility.bonus).toBeGreaterThan(0);
    expect(agility.total).toBe(agility.base + agility.bonus);
    expect(s.stats.map((x) => x.id)).toEqual(state.rules.stats.list.map((x) => x.id));
    expect(s.skills.map((x) => x.name)).toContain('Basic Archery');
    expect(s.skills.find((x) => x.name === 'Basic Archery')).toMatchObject({
      kind: 'class',
      marks: 0,
      cost: null,
    });
    expect(s.titles).toEqual(['Pathfinder']);
    expect(s.equipped).toEqual([{ slot: 'Ring', item: 'Ring of Haste' }]);
    expect(s.pairs[0]).toEqual({ skills: ['Basic Archery', 'Basic Stealth'], count: 2 });
    expect(s.pairs).toHaveLength(3);
  });

  it('counts unassigned free points and shows a spell cost', () => {
    const c = campaign();
    const state = run(c, [
      {
        type: 'skill.setCasting',
        characterId: 'jake',
        skill: 'Basic Archery',
        cost: { pool: state0Pool(c), amount: 5 },
        cooldown: null,
        range: null,
        castingNotes: null,
      },
    ]).state!;
    const s = characterStanding(state, 'jake')!;
    expect(s.skills.find((x) => x.name === 'Basic Archery')?.cost).toMatch(/^5 /);
    const batches = state.characters['jake']!.freePointBatches;
    expect(s.freePoints).toBe(
      batches.reduce(
        (a, b) =>
          a +
          (b.locked ? 0 : b.points - Object.values(b.allocation ?? {}).reduce((x, y) => x + y, 0)),
        0,
      ),
    );
    expect(s.freePoints).toBeGreaterThan(0);
  });

  it('a character with a profession shows it and its level', () => {
    const state = campaign().state!;
    const jake = state.characters['jake']!;
    const s = characterStanding(
      {
        ...state,
        characters: {
          ...state.characters,
          jake: { ...jake, profession: 'Alchemist', professionLevel: 4 },
        },
      },
      'jake',
    )!;
    expect(s.profession).toBe('Alchemist');
    expect(s.professionLevel).toBe(4);
  });

  it('a character with no profession and no practice yet', () => {
    const state = campaign().state!;
    const s = characterStanding(state, 'jake')!;
    expect(s.profession).toBeNull();
    expect(s.raceLevel).toBe(state.characters['jake']!.classLevel);
    expect(s.pairs).toEqual([]);
    expect(s.titles).toEqual([]);
    expect(s.equipped).toEqual([]);
    expect(characterStanding(state, 'ghost')).toBeNull();
  });
});

function state0Pool(c: Campaign): string {
  return c.state!.rules.pools[0]!.id;
}

describe('skill-offer draft flags (MW.2)', () => {
  const row = (name: string, rarity = 'common', spell = false, costAmount = '') => ({
    name,
    rarity,
    spell,
    costAmount,
    costPool: 'mana',
  });
  const state = campaign().state!;

  it('a clean menu has no flags', () => {
    const f = draftFlags(state, 'jake', 2, [row('A'), row('B'), row('C', 'rare', true, '5')]);
    expect(f.rows.flat()).toEqual([]);
    expect(f.menu).toEqual([]);
  });
  it('flags a rarity above the ceiling', () => {
    const f = draftFlags(state, 'jake', 2, [row('A', 'epic')]);
    expect(f.rows[0]?.[0]).toMatch(/ceiling \(Rare\)/);
  });
  it('flags a missed capstone, and clears it with a ceiling option', () => {
    expect(draftFlags(state, 'jake', 4, [row('A')]).menu[0]).toMatch(/capstone/i);
    expect(draftFlags(state, 'jake', 4, [row('A', 'rare')]).menu).toEqual([]);
    expect(draftFlags(state, 'jake', 4, [row('')]).menu).toEqual([]);
  });
  it('flags a name the character has, in any case, and a repeat within the menu', () => {
    const f = draftFlags(state, 'jake', 2, [row('basic archery'), row('New'), row(' new ')]);
    expect(f.rows[0]?.[0]).toMatch(/Jake already has/);
    expect(f.rows[1]).toEqual([]);
    expect(f.rows[2]?.[0]).toMatch(/Another option/);
  });
  it('flags a spell with no cost, and parses costs', () => {
    expect(draftFlags(state, 'jake', 2, [row('A', 'common', true)]).rows[0]?.[0]).toMatch(/cost/);
    expect(draftFlags(state, 'jake', 2, [row('A', 'common', true, '0')]).rows[0]).toHaveLength(1);
    expect(draftFlags(state, 'jake', 2, [row('', 'common', true)]).rows[0]).toEqual([]);
    expect(parseCost(' 5 ')).toBe(5);
    expect(parseCost('1.5')).toBeNull();
    expect(parseCost('')).toBeNull();
  });
});

describe('a spell row and the library (MW.2 review)', () => {
  const base = campaign().state!;
  const pool = base.rules.pools[0]!.id;
  const withEntry = (cost: { pool: string; amount: number } | null) =>
    ({
      ...base,
      skillLibrary: {
        bolt: {
          ...Object.values(base.skillLibrary)[0],
          id: 'bolt',
          name: 'Bolt',
          rarity: 'common',
          cost,
        },
      },
    }) as unknown as typeof base;
  const spell = (costAmount: string) => ({
    name: 'Bolt',
    rarity: 'common',
    kind: 'class',
    description: '',
    spell: true,
    costPool: pool,
    costAmount,
  });
  it('flags a cost that differs from the entry, so sending cannot change it', () => {
    const flags = draftFlags(withEntry({ pool, amount: 3 }), 'jake', 2, [spell('5')]).rows[0]!;
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/library's Bolt costs 3 .*match it or rename/);
  });
  it('accepts the matching cost', () => {
    expect(draftFlags(withEntry({ pool, amount: 3 }), 'jake', 2, [spell('3')]).rows[0]).toEqual([]);
  });
  it('flags a cost on an entry that has none', () => {
    expect(draftFlags(withEntry(null), 'jake', 2, [spell('3')]).rows[0]![0]).toMatch(/has no cost/);
  });
  it('a new name is free to define its cost', () => {
    expect(draftFlags(base, 'jake', 2, [spell('3')]).rows[0]).toEqual([]);
  });
});
