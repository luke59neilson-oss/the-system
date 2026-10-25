import { describe, expect, it } from 'vitest';
import {
  characterFlags,
  describeEvent,
  execute,
  projectForPlayer,
  progressionOverrideSummary,
  raceLevel,
  replay,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/**
 * MT.5 (Q59, DESIGN §7 GM authority): the GM sets class level, profession
 * level, XP and grade directly, after a warning listing what the change
 * skips; the change is one logged, undoable event.
 */
const ctx = testContext('p');
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Archer',
  classSkills: kit,
};
const base = (): Campaign => run([created, make], ctx);
const set = (
  over: Partial<{
    grade: string;
    classLevel: number;
    professionLevel: number;
    xp: { class: number; profession: number };
  }>,
): Command => ({
  type: 'character.setProgression',
  characterId: 'jake',
  grade: 'G',
  classLevel: 0,
  professionLevel: 0,
  xp: { class: 0, profession: 0 },
  ...over,
});
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}
const jake = (c: Campaign): Character => {
  const found = c.state?.characters.jake;
  if (!found) throw new Error('no jake');
  return found;
};

describe('GM override for level, XP and grade (MT.5)', () => {
  it('sets levels, XP and grade without granting spread, free points or evolutions', () => {
    const c0 = base();
    const before = jake(c0);
    const c = ok(c0, set({ grade: 'E', classLevel: 20, xp: { class: 150, profession: 0 } }));
    const after = jake(c);
    expect([after.grade, after.classLevel, after.xp.class]).toEqual(['E', 20, 150]);
    expect(raceLevel(c.state!.rules, after)).toBe(20);
    expect(after.stats).toEqual(before.stats);
    expect(after.classSpreadTotals).toEqual(before.classSpreadTotals);
    expect(after.freePointBatches).toEqual([]);
    expect(after.pools).toEqual(before.pools);
    const last = c.events[c.events.length - 1]!;
    expect(last.type).toBe('character.progressionSet');
    expect(last.actor).toEqual({ role: 'gm' });
  });

  it('makes the selections it passes due, for the GM to offer as usual', () => {
    const c = ok(base(), set({ grade: 'F', classLevel: 12 }));
    const kinds = characterFlags(c.state!, 'jake').filter((f) => f.kind === 'selection');
    expect(kinds.map((f) => (f.kind === 'selection' ? f.level : 0))).toEqual([5, 10]);
  });

  it('is undone by an ordinary undo, and replays to the same state', () => {
    const c0 = base();
    const c1 = ok(c0, set({ grade: 'F', classLevel: 9, xp: { class: 120, profession: 0 } }));
    const id = c1.events[c1.events.length - 1]!.id;
    const undone = ok(c1, { type: 'event.undo', eventId: id });
    expect(jake(undone)).toEqual(jake(c0));
    expect(replay(c1.events).state).toEqual(c1.state);
  });

  it('refuses values the rules cannot hold', () => {
    const c = base();
    expect(reject(c, set({ grade: 'Z' }))).toMatch(/Unknown grade "Z"/);
    expect(reject(c, set({ classLevel: 5 }))).toMatch(/above the G-grade top of 4/);
    expect(reject(c, set({ classLevel: 2, xp: { class: 100, profession: 0 } }))).toMatch(
      /below 100/,
    );
    expect(reject(c, set({ classLevel: 4, xp: { class: 5, profession: 0 } }))).toMatch(
      /its XP is 0/,
    );
    expect(reject(c, set({ grade: 'E', professionLevel: 3 }))).toMatch(/has no profession/);
    expect(reject(c, set({}))).toMatch(/Nothing to change/);
    expect(reject(c, set({ classLevel: -1 }))).toMatch(/classLevel|0 or more/);
  });

  it('is GM-only', () => {
    const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
    expect(reject(base(), set({ classLevel: 3 }), player)).toMatch(/Not allowed/);
  });

  it('sets a profession level once there is one, and race level follows', () => {
    let c = ok(base(), set({ grade: 'E', classLevel: 20 }));
    c = ok(c, { type: 'character.grantProfession', characterId: 'jake', profession: 'Alchemist' });
    expect(jake(c).professionLevel).toBe(20);
    c = ok(
      c,
      set({ grade: 'E', classLevel: 20, professionLevel: 30, xp: { class: 0, profession: 40 } }),
    );
    expect(raceLevel(c.state!.rules, jake(c))).toBe(25);
    expect(jake(c).xp.profession).toBe(40);
  });

  it('withdraws a released evolution when the grade changes', () => {
    let c = ok(base(), {
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'jake' }],
    });
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter' }],
      rerate: {},
      rerateApproved: true,
    });
    expect(jake(c).evolution?.toGrade).toBe('F');
    const summary = progressionOverrideSummary(c.state!.rules, jake(c), {
      grade: 'F',
      classLevel: 4,
      professionLevel: 0,
      xp: { class: 0, profession: 0 },
    });
    expect(summary.skips.join('\n')).toMatch(/released evolution to F-grade is withdrawn/);
    c = ok(c, set({ grade: 'F', classLevel: 4 }));
    expect(jake(c).evolution).toBeNull();
    expect(jake(c).grade).toBe('F');
  });

  it('a level lowered and earned again does not grant a second free-point batch', () => {
    let c = ok(base(), {
      type: 'xp.award',
      track: 'class',
      amount: 300,
      participants: [{ characterId: 'jake' }],
    });
    expect(jake(c).freePointBatches.map((b) => b.raceLevel)).toEqual([1, 2, 3]);
    c = ok(c, set({ classLevel: 1 }));
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 300,
      participants: [{ characterId: 'jake' }],
    });
    expect(jake(c).classLevel).toBe(4);
    expect(jake(c).freePointBatches.map((b) => b.raceLevel)).toEqual([1, 2, 3, 4]);
  });

  it('the warning lists what the change skips', () => {
    const c = base();
    const s = progressionOverrideSummary(c.state!.rules, jake(c), {
      grade: 'E',
      classLevel: 20,
      professionLevel: 0,
      xp: { class: 10, profession: 0 },
    });
    expect(s.changes).toEqual([
      'Grade G → E',
      'Class level 0 → 20',
      'Race level 0 → 20',
      'Class XP 0 → 10',
    ]);
    // Levels 1–4 at G (4 each), 5–14 at F (5 each), 15–20 at E (8 each).
    expect(s.skips).toEqual([
      'The evolution to F-grade and E-grade: no evolution stat bonus, skill re-rating, pool refill or profession offer',
      `${4 * 4 + 10 * 5 + 6 * 8} class spread points (base stats stay as they are)`,
      'No skills are granted: the selections at class level 5, 10, 15 and 20 become due, for you to offer as usual',
      `${4 * 2 + 10 * 3 + 6 * 4} free points (no new batches to assign)`,
    ]);
    const down = progressionOverrideSummary(c.state!.rules, { ...jake(c), classLevel: 3 }, {
      grade: 'G',
      classLevel: 1,
      professionLevel: 0,
      xp: { class: 0, profession: 0 },
    });
    expect(down.skips).toEqual([
      'Lowering a level takes nothing back: stats, free points and skills from those levels stay',
    ]);
  });

  it('players see the result, and the session log names the override', () => {
    const c0 = base();
    const c = ok(c0, set({ grade: 'F', classLevel: 6 }));
    const view = projectForPlayer(c.state!, 'jake');
    expect(JSON.stringify(view)).toContain('"classLevel":6');
    const last = c.events[c.events.length - 1]!;
    expect(describeEvent(c0.state, c.state!, last)[0]).toEqual({
      kind: 'character',
      text: "The GM set Jake's level, XP or grade: Grade G → F, Class level 0 → 6, Race level 0 → 6",
    });
  });
});
