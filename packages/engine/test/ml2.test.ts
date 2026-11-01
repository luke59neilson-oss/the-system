import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  entryBudget,
  entryPoints,
  pointsTotal,
  execute,
  projectForPlayer,
  replay,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// ML.2 (DESIGN §2 "The GM lays these out in the library", Q93, Q94): class,
// race and profession entries carry whole points per stat plus free points
// per level; new characters and offers take the entry's points.

const ctx = testContext('ml2');
const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
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

// Luke's G example (L27): class +1 Str +2 Agi +3 Int +2 free.
const archerPoints = { stats: { strength: 1, agility: 2, intelligence: 3 }, free: 2 };
const archer: Command = {
  type: 'classDef.define',
  id: 'archer',
  name: 'Archer',
  skills: kit.map((s) => ({ name: s.name, rarity: s.rarity })),
  weights: { agility: 3, perception: 2 },
  points: archerPoints,
};
const humanPoints = { stats: { perception: 2, intelligence: 2 }, free: 1 };

describe('ML.2 library entries carry points per level', () => {
  it('stores, edits and keeps points on class, race and profession entries', () => {
    let c = ok(run([created], ctx), archer);
    expect(c.state!.classLibrary['archer']!.points).toEqual(archerPoints);
    c = ok(c, {
      type: 'classDef.edit',
      classDefId: 'archer',
      points: { stats: { agility: 6 }, free: 2 },
    });
    expect(c.state!.classLibrary['archer']!.points).toEqual({ stats: { agility: 6 }, free: 2 });
    // An edit of another field keeps the points.
    c = ok(c, { type: 'classDef.edit', classDefId: 'archer', description: 'Shoots.' });
    expect(c.state!.classLibrary['archer']!.points).toEqual({ stats: { agility: 6 }, free: 2 });

    c = ok(c, { type: 'raceDef.define', id: 'elf', name: 'Elf', points: humanPoints });
    expect(c.state!.raceLibrary['elf']!.points).toEqual(humanPoints);
    c = ok(c, { type: 'raceDef.edit', raceDefId: 'elf', points: { stats: {}, free: 5 } });
    expect(c.state!.raceLibrary['elf']!.points).toEqual({ stats: {}, free: 5 });

    const alch = { stats: { intelligence: 1, wisdom: 1, vitality: 1 }, free: 2 };
    c = ok(c, { type: 'professionDef.define', id: 'alch', name: 'Alchemist', points: alch });
    expect(c.state!.professionLibrary['alch']!.points).toEqual(alch);
    c = ok(c, { type: 'professionDef.edit', professionDefId: 'alch', name: 'Brewer' });
    expect(c.state!.professionLibrary['alch']!.points).toEqual(alch);
    // Replay gives the same state.
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('an all-zero points edit clears them, so the entry follows its default (review)', () => {
    let c = ok(run([created], ctx), archer);
    c = ok(c, { type: 'classDef.edit', classDefId: 'archer', points: { stats: {}, free: 0 } });
    expect(c.state!.classLibrary['archer']).not.toHaveProperty('points');
    c = ok(c, { type: 'raceDef.define', id: 'elf', name: 'Elf', points: humanPoints });
    c = ok(c, {
      type: 'raceDef.edit',
      raceDefId: 'elf',
      points: { stats: { agility: 0 }, free: 0 },
    });
    expect(c.state!.raceLibrary['elf']).not.toHaveProperty('points');
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('refuses points for an unknown stat or not whole numbers', () => {
    const c = run([created], ctx);
    const base = archer as Extract<Command, { type: 'classDef.define' }>;
    expect(reject(c, { ...base, points: { stats: { luck: 2 }, free: 0 } })).toMatch(/Unknown stat/);
    expect(
      reject(c, { type: 'raceDef.define', name: 'Orc', points: { stats: {}, free: 1.5 } }),
    ).toMatch(/whole number|expected int/);
    expect(
      reject(c, {
        type: 'professionDef.define',
        name: 'Cook',
        points: { stats: { strength: -1 }, free: 0 },
      }),
    ).toMatch(/whole number|Invalid|too_small|>=/i);
  });

  it('a class made before ML.2 (weights only) still loads, with no points', () => {
    const { points: _unused, ...old } = archer as Extract<Command, { type: 'classDef.define' }>;
    void _unused;
    const c = ok(run([created], ctx), old);
    expect(c.state!.classLibrary['archer']).not.toHaveProperty('points');
    expect(replay(c.events).state).toEqual(c.state);
  });

  it("an entry's points reach a new character and its level-ups", () => {
    let c = ok(run([created], ctx), {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: kit,
      classWeights: { agility: 3, perception: 2 },
      distributions: { class: archerPoints, race: humanPoints },
    });
    expect(char(c).distributions).toEqual({ class: archerPoints, race: humanPoints });
    const before = { ...char(c).stats };
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 100,
      participants: [{ characterId: 'jake' }],
    });
    const j = char(c);
    expect(j.classLevel).toBe(1);
    // Class level 1: the class's 8 (1/2/3 + 2 free) and, with no profession
    // yet, the profession's 5 by the class's shape; race level 1: 2/2 + 1 free.
    const gain = (id: string) => (j.stats[id] ?? 0) - (before[id] ?? 0);
    expect(gain('strength')).toBeGreaterThanOrEqual(1);
    expect(gain('agility')).toBeGreaterThanOrEqual(2);
    expect(gain('perception')).toBe(2);
    const statGain = Object.keys(j.stats).reduce((a, id) => a + gain(id), 0);
    const free = j.freePointBatches.reduce((a, b) => a + b.points, 0);
    expect(statGain + free).toBe(8 + 5 + 5);
    expect(free).toBeGreaterThanOrEqual(2 + 1);
    expect(replay(c.events).state).toEqual(c.state);
    // GM-only library entries never reach the player; the character's own sheet does.
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('classLibrary');
  });

  it('a character made without entry points keeps the defaults (no distributions)', () => {
    const c = ok(run([created], ctx), {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: kit,
    });
    expect(char(c)).not.toHaveProperty('distributions');
  });

  it('refuses entry points with an unknown stat at creation', () => {
    expect(
      reject(run([created], ctx), {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
        distributions: { class: { stats: { luck: 8 }, free: 0 } },
      }),
    ).toMatch(/Unknown stat "luck" in class points/);
  });

  it('a profession offered with its entry points gives them when taken later (Q94)', () => {
    let c = ok(run([created], ctx), {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: kit,
    });
    const alch = { stats: { intelligence: 1, wisdom: 1, vitality: 1 }, free: 2 };
    c = ok(c, {
      type: 'profession.offer',
      characterId: 'jake',
      profession: 'Alchemist',
      distribution: alch,
    } as unknown as Command);
    c = ok(c, { type: 'profession.choose', characterId: 'jake', profession: 'Alchemist' }, player);
    expect(char(c).profession).toBe('Alchemist');
    expect(char(c).distributions?.profession).toEqual(alch);
  });
});

describe('ML.2 library helpers', () => {
  it('gives the budget reminder per track and grade', () => {
    expect(entryBudget(DEFAULT_RULES, 'G', 'class')).toBe(8);
    expect(entryBudget(DEFAULT_RULES, 'G', 'race')).toBe(5);
    expect(entryBudget(DEFAULT_RULES, 'G', 'profession')).toBe(5);
    expect(entryBudget(DEFAULT_RULES, 'nope', 'class')).toBeNull();
  });
  it('shows set points as they are and old weights as converted points at the class budget', () => {
    expect(
      entryPoints(DEFAULT_RULES, 'G', { points: archerPoints, weights: { agility: 1 } }),
    ).toEqual({ points: archerPoints, converted: false });
    const old = entryPoints(DEFAULT_RULES, 'G', { weights: { agility: 3, perception: 1 } });
    expect(old?.converted).toBe(true);
    expect(old?.points).toEqual({ stats: { agility: 6, perception: 2 }, free: 0 });
    expect(pointsTotal(old!.points)).toBe(8);
    expect(entryPoints(DEFAULT_RULES, 'G', {})).toBeNull();
    expect(entryPoints(DEFAULT_RULES, 'G', { weights: { agility: 0 } })).toBeNull();
  });
});
