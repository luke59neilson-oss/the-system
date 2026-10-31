import { describe, expect, it } from 'vitest';
import {
  execute,
  projectForPlayer,
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

const opt = (id: string, stats: Record<string, number>, free: number, bonus = { agility: 2 }) => ({
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
    expect(j.hp).toBe(j.maxHp);
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

  it('unreleased options never reach the player', () => {
    const c = atGTop();
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('tracker');
  });
});
