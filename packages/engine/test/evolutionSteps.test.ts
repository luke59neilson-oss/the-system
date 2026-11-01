import { describe, expect, it } from 'vitest';
import {
  buildSessionLog,
  execute,
  projectForPlayer,
  stepBudgetProblems,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// ME.2 (DESIGN §2 "Class, profession and race evolve together", L26): the
// release carries three steps of options; totals must match the step's budget
// at the new grade (F: class 11, profession 7, race 6) and one-time bonuses must
// be equal within a step, unless the release says Override. WIP: the command
// shape below is the target; the engine does not take it yet.

const ctx = testContext('me2');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Archer',
  classSkills: kit,
};

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}
const char = (c: Campaign): Character => c.state!.characters['jake']!;

/** Jake at the G-grade top (race level 4), no profession, nothing pending. */
const atGTop = (): Campaign =>
  ok(run([created, make], ctx), {
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'jake' }],
  });

const opt = (
  id: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number> = { agility: 2 },
) => ({
  id,
  name: id,
  rarity: 'common',
  description: `${id} text`,
  distribution: { stats, free },
  statBonus: bonus,
});

/** A three-step F-grade release that meets every budget (class 11, profession 7, race 6). */
const threeStep = (extra: object = {}): Command =>
  ({
    type: 'evolution.release',
    characterId: 'jake',
    rerateApproved: true,
    steps: {
      class: [opt('hunter', { perception: 6, agility: 3 }, 2), opt('ranger', { agility: 9 }, 2)],
      profession: [opt('tracker', { perception: 5 }, 2)],
      race: [opt('human-f', {}, 6, { vitality: 2 })],
    },
    ...extra,
  }) as unknown as Command;

describe('three-step evolution release (ME.2)', () => {
  it('releases when every option meets its step budget and bonuses match', () => {
    const c = ok(atGTop(), threeStep());
    expect(char(c).evolution).not.toBeNull();
  });

  it('refuses an option whose per-level total misses the budget, naming it', () => {
    const bad = threeStep();
    (bad as any).steps.class[1].distribution = { stats: { agility: 8 }, free: 2 };
    expect(reject(atGTop(), bad)).toMatch(/ranger.*10.*11/i);
  });

  it('refuses unequal one-time bonuses within a step, unless Override', () => {
    const bad = threeStep();
    (bad as any).steps.class[1].statBonus = { agility: 3 };
    expect(reject(atGTop(), bad)).toMatch(/bonus/i);
    const c = ok(atGTop(), { ...(bad as object), override: true } as unknown as Command);
    expect(char(c).evolution).not.toBeNull();
  });

  it('the player picks one option per step and confirms once', () => {
    let c = ok(atGTop(), threeStep());
    c = ok(
      c,
      {
        type: 'evolution.choose',
        characterId: 'jake',
        choices: { class: 'ranger', profession: 'tracker', race: 'human-f' },
      } as unknown as Command,
      player('jake'),
    );
    const j = char(c);
    expect(j.grade).toBe('F');
    expect(j.className).toBe('ranger');
    expect(j.profession).toBe('tracker');
    // Evolution refills HP, MP and Stamina (DESIGN §2).
    const before = char(atGTop());
    expect(Object.keys(j.pools)).toEqual(Object.keys(before.pools));
  });

  it('a character without a profession may choose "none for now"', () => {
    let c = ok(atGTop(), threeStep());
    c = ok(
      c,
      {
        type: 'evolution.choose',
        characterId: 'jake',
        choices: { class: 'hunter', profession: null, race: 'human-f' },
      } as unknown as Command,
      player('jake'),
    );
    expect(char(c).profession).toBeNull();
  });

  const choose = (choices: object): Command =>
    ({ type: 'evolution.choose', characterId: 'jake', choices }) as unknown as Command;

  it('confirming applies all three: distributions, bonuses, race, profession, full pools', () => {
    const before = char(atGTop());
    let c = ok(atGTop(), threeStep());
    c = ok(c, choose({ class: 'hunter', profession: 'tracker', race: 'human-f' }), player('jake'));
    const j = char(c);
    expect(j.distributions).toEqual({
      class: { stats: { perception: 6, agility: 3 }, free: 2 },
      profession: { stats: { perception: 5 }, free: 2 },
      race: { stats: {}, free: 6 },
    });
    // One-time bonuses of all three steps: class +2 agility, profession +2
    // agility, race +2 vitality.
    expect(j.stats['agility']).toBe(before.stats['agility']! + 4);
    expect(j.stats['vitality']).toBe(before.stats['vitality']! + 2);
    expect(j.stats['perception']).toBe(before.stats['perception']);
    expect(j.race).toBe('human-f');
    expect(j.professionLevel).toBe(j.classLevel);
    expect(j.evolution).toBeNull();
    // Pools refill to the new maxima (DESIGN §2).
    for (const [id, value] of Object.entries(j.pools)) expect(value, id).toBeGreaterThan(0);
  });

  it('pools refill even when the character was hurt before choosing', () => {
    let c = ok(atGTop(), threeStep());
    const hurt = Object.fromEntries(Object.keys(char(c).pools).map((id) => [id, 1]));
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: hurt });
    c = ok(c, choose({ class: 'ranger', profession: null, race: 'human-f' }), player('jake'));
    for (const [id, value] of Object.entries(char(c).pools)) expect(value, id).toBeGreaterThan(1);
  });

  it('"none for now" keeps the profession options as offers for later', () => {
    let c = ok(atGTop(), threeStep());
    c = ok(c, choose({ class: 'ranger', profession: null, race: 'human-f' }), player('jake'));
    expect(char(c).profession).toBeNull();
    expect(char(c).professionOffers).toContain('tracker');
    expect(char(c).distributions?.profession).toBeUndefined();
  });

  it('a character with a profession evolves it, keeping its level', () => {
    let c = ok(atGTop(), {
      type: 'character.grantProfession',
      characterId: 'jake',
      profession: 'Hunter of Beasts',
    });
    const level = char(c).professionLevel;
    // Its profession step needs an option.
    const empty = threeStep();
    (empty as any).steps.profession = [];
    expect(reject(c, empty)).toMatch(/profession option/i);
    c = ok(c, threeStep());
    // It cannot choose "none for now".
    expect(
      reject(c, choose({ class: 'hunter', profession: null, race: 'human-f' }), player('jake')),
    ).toMatch(/choose how it evolves/);
    c = ok(c, choose({ class: 'hunter', profession: 'tracker', race: 'human-f' }), player('jake'));
    expect(char(c).profession).toBe('tracker');
    expect(char(c).professionLevel).toBe(level);
  });

  it('a three-step release needs every choice; a single-choice release takes none', () => {
    const c = ok(atGTop(), threeStep());
    expect(
      reject(
        c,
        { type: 'evolution.choose', characterId: 'jake', optionId: 'hunter' },
        player('jake'),
      ),
    ).toMatch(/class, a profession/);
    expect(
      reject(c, choose({ class: 'hunter', profession: 'nope', race: 'human-f' }), player('jake')),
    ).toMatch(/No profession option "nope"/);
    expect(
      reject(c, choose({ class: 'hunter', profession: null, race: 'elf' }), player('jake')),
    ).toMatch(/No race option "elf"/);
    const single = ok(atGTop(), {
      type: 'evolution.release',
      characterId: 'jake',
      rerateApproved: true,
      options: [{ className: 'Ranger' }],
    } as unknown as Command);
    expect(
      reject(single, choose({ class: 'o1', profession: null, race: 'r1' }), player('jake')),
    ).toMatch(/single choice/);
    // The old single choice still works and leaves distributions alone.
    const done = ok(
      single,
      { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
      player('jake'),
    );
    expect(char(done).grade).toBe('F');
    expect(char(done).distributions).toBeUndefined();
  });

  it('refuses an unknown stat in an option distribution', () => {
    const bad = threeStep();
    (bad as any).steps.race[0].distribution = { stats: { luck: 6 }, free: 0 };
    expect(reject(atGTop(), { ...(bad as object), override: true } as unknown as Command)).toMatch(
      /luck/,
    );
  });

  it('the owner sees the released steps; other players do not', () => {
    let c = ok(atGTop(), {
      type: 'character.create',
      id: 'miranda',
      name: 'Miranda',
      className: 'Archer',
      classSkills: kit,
    });
    c = ok(c, threeStep());
    const own = JSON.stringify(projectForPlayer(c.state!, 'jake'));
    expect(own).toContain('tracker');
    expect(own).toContain('"free":6');
    expect(JSON.stringify(projectForPlayer(c.state!, 'miranda'))).not.toContain('tracker');
  });

  it('the session log names the class, profession and race', () => {
    let c = ok(atGTop(), threeStep());
    const from = c.events.length;
    c = ok(c, choose({ class: 'hunter', profession: 'tracker', race: 'human-f' }), player('jake'));
    let text = buildSessionLog(c, from).entries.map((e) => e.text);
    expect(text).toContain(
      'Jake evolved into hunter, grade G → F, profession tracker, race human-f',
    );
    c = ok(atGTop(), threeStep());
    c = ok(c, choose({ class: 'ranger', profession: null, race: 'human-f' }), player('jake'));
    text = buildSessionLog(c, from).entries.map((e) => e.text);
    expect(text).toContain(
      'Jake evolved into ranger, grade G → F, no profession for now, race human-f',
    );
  });

  it('unreleased options never reach the player', () => {
    const c = atGTop();
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('tracker');
  });
});

describe('step budget check (ME.2)', () => {
  const o = (
    name: string,
    stats: Record<string, number>,
    free: number,
    bonus: Record<string, number>,
  ) => ({
    id: name,
    name,
    distribution: { stats, free },
    statBonus: bonus,
  });
  it('passes options that meet the budget with equal bonuses', () => {
    expect(
      stepBudgetProblems('Class', 11, [
        o('Hunter', { perception: 6, agility: 3 }, 2, { agility: 2 }),
        o('Ranger', { agility: 9 }, 2, { perception: 2 }),
      ]),
    ).toEqual([]);
  });
  it('names an option off budget and unequal bonuses', () => {
    expect(
      stepBudgetProblems('Class', 11, [
        o('Hunter', { perception: 6, agility: 3 }, 2, { agility: 2 }),
        o('Ranger', { agility: 8 }, 2, { agility: 3 }),
      ]),
    ).toEqual([
      'Class option "Ranger" gives 10 points per level, not 11',
      'Class options have unequal one-time bonuses (2, 3); make them equal or tick Override',
    ]);
  });
});
