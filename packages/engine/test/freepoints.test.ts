import { describe, expect, it } from 'vitest';
import {
  PLAYER_COMMANDS,
  PLAYER_EVENT_TYPES,
  appendEvent,
  execute,
  parseEvent,
  replay,
  characterFlags,
  statBudgetTotal,
  type Campaign,
  type Command,
} from '../src';
import { kit, preMeRules, run, testContext } from './helpers/events';

const setup: Command[] = [
  { type: 'campaign.create', name: 'W', rules: preMeRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'kim', name: 'Kim', className: 'Mage', classSkills: kit },
  // 2 class levels → race levels 1 and 2, 2 free points each at G-grade.
  {
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'jake' }, { characterId: 'kim' }],
  },
];
const base = () => run(setup);
const jake = (c: Campaign) => c.state?.characters['jake'];
const player = (characterId: string) => ({
  ...testContext('p'),
  actor: { role: 'player' as const, characterId },
});
const assign = (
  raceLevel: number,
  allocation: Record<string, number>,
  characterId = 'jake',
): Command => ({
  type: 'freePoints.assign',
  characterId,
  raceLevel,
  allocation,
});

describe('free points', () => {
  it('a player assigns a batch once; it adds to stats and locks', () => {
    const before = base();
    const strength = jake(before)?.stats['strength'] as number;
    const result = execute(before, assign(1, { strength: 1, agility: 1 }), player('jake'));
    if (!result.ok) throw new Error(result.error);
    const after = jake(result.campaign);
    expect(after?.stats['strength']).toBe(strength + 1);
    expect(after?.freePointBatches[0]).toEqual({
      raceLevel: 1,
      points: 2,
      allocation: { strength: 1, agility: 1 },
      locked: true,
    });
    expect(after?.freePointBatches[1]?.locked).toBe(false);
  });

  it('rejects reassigning a locked batch, even by the GM through assign', () => {
    const c = run([assign(1, { strength: 2 })], testContext('a'), base());
    const again = execute(c, assign(1, { agility: 2 }), player('jake'));
    expect(again).toMatchObject({
      ok: false,
      error: expect.stringContaining('already assigned and locked'),
    });
    expect(execute(c, assign(1, { agility: 2 }), testContext('g')).ok).toBe(false);
  });

  it('the next level grants a new unlocked batch', () => {
    let c = run([assign(1, { strength: 2 }), assign(2, { strength: 2 })], testContext('a'), base());
    c = run(
      [{ type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] }],
      testContext('b'),
      c,
    );
    const batches = jake(c)?.freePointBatches ?? [];
    expect(batches.map((b) => [b.raceLevel, b.locked])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ]);
    expect(execute(c, assign(3, { wisdom: 2 }), player('jake')).ok).toBe(true);
  });

  it('rejects wrong totals, unknown stats, missing batches and other players', () => {
    const c = base();
    const p = player('jake');
    expect(execute(c, assign(1, { strength: 3 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('assign exactly 2 points (got 3)'),
    });
    expect(execute(c, assign(1, { strength: 1 }), p).ok).toBe(false);
    expect(execute(c, assign(1, { luck: 2 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown stat "luck"'),
    });
    expect(execute(c, assign(9, { strength: 2 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('no free-point batch for race level 9'),
    });
    expect(execute(c, assign(1, { strength: 2 }, 'kim'), p)).toMatchObject({
      ok: false,
      error: 'Not allowed: players may only act on their own character',
    });
    const override: Command = {
      type: 'freePoints.override',
      characterId: 'jake',
      raceLevel: 1,
      allocation: null,
    };
    expect(execute(c, override, p)).toMatchObject({
      ok: false,
      error: 'Not allowed: only the GM can freePoints.override',
    });
  });

  it('the GM overrides a locked batch, or unassigns it, and both are undoable', () => {
    const assigned = run([assign(1, { strength: 2 })], testContext('a'), base());
    const overridden = run(
      [
        {
          type: 'freePoints.override',
          characterId: 'jake',
          raceLevel: 1,
          allocation: { vitality: 2 },
        },
      ],
      testContext('o'),
      assigned,
    );
    expect(jake(overridden)?.stats).toMatchObject({
      strength: jake(base())?.stats['strength'],
      vitality: (jake(base())?.stats['vitality'] as number) + 2,
    });
    expect(jake(overridden)?.freePointBatches[0]).toMatchObject({
      allocation: { vitality: 2 },
      locked: true,
    });
    const undone = run([{ type: 'event.undo', eventId: 'o1' }], testContext('u'), overridden);
    expect(undone.state).toEqual(assigned.state);

    const cleared = run(
      [{ type: 'freePoints.override', characterId: 'jake', raceLevel: 1, allocation: null }],
      testContext('o'),
      assigned,
    );
    expect(jake(cleared)?.stats).toEqual(jake(base())?.stats);
    expect(jake(cleared)?.freePointBatches[0]).toMatchObject({ allocation: null, locked: false });
    // Unlocked again, so the player can assign it afresh.
    expect(execute(cleared, assign(1, { agility: 2 }), player('jake')).ok).toBe(true);
  });

  it('rejects an override that would push a stat below 0, and clamps pools when vitality drops', () => {
    const c = run(
      [
        assign(1, { vitality: 2 }),
        { type: 'character.setStats', characterId: 'jake', stats: { vitality: 1 } },
      ],
      testContext('a'),
      base(),
    );
    const result = execute(
      c,
      { type: 'freePoints.override', characterId: 'jake', raceLevel: 1, allocation: null },
      testContext('o'),
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('vitality would drop below 0'),
    });
    const hp = run(
      [
        assign(1, { vitality: 2 }),
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 120 } },
        {
          type: 'freePoints.override',
          characterId: 'jake',
          raceLevel: 1,
          allocation: { strength: 2 },
        },
      ],
      testContext('b'),
      base(),
    );
    expect(jake(hp)?.pools['hp']).toBe(10 * (jake(hp)?.stats['vitality'] as number));
  });

  it('undoing the award that granted an assigned batch is refused until the assignment is undone', () => {
    const c = run([assign(1, { strength: 2 })], testContext('a'), base());
    const awardId = c.events[3]?.id as string;
    const refused = execute(c, { type: 'event.undo', eventId: awardId }, testContext('u'));
    expect(refused).toMatchObject({
      ok: false,
      error: expect.stringContaining('no free-point batch'),
    });
    const ok = run(
      [
        { type: 'event.undo', eventId: 'a1' },
        { type: 'event.undo', eventId: awardId },
      ],
      testContext('v'),
      c,
    );
    expect(jake(ok)?.freePointBatches).toEqual([]);
  });

  it('enforces player authority on events in the log, not only in execute', () => {
    const c = base();
    const raw = (type: string, actor: object, payload: object) =>
      parseEvent({
        id: 'raw1',
        type,
        timestamp: '2026-10-21T12:00:00.000Z',
        actor,
        sessionId: null,
        schemaVersion: 1,
        payload,
      });
    const asJake = { role: 'player', characterId: 'jake' };
    const override = raw('freePoints.overridden', asJake, {
      characterId: 'jake',
      raceLevel: 1,
      allocation: null,
    });
    expect(() => appendEvent(c, override)).toThrow('players cannot cause this event');
    const others = raw('freePoints.assigned', asJake, {
      characterId: 'kim',
      raceLevel: 1,
      allocation: { strength: 2 },
    });
    expect(() => appendEvent(c, others)).toThrow('only act on their own character');
    const undo = raw('event.undone', asJake, { eventId: 'e4' });
    expect(() => appendEvent(c, undo)).toThrow('players cannot cause this event');
    const stored = JSON.parse(JSON.stringify([...c.events, others])) as unknown[];
    expect(() => replay(stored)).toThrow('only act on their own character');
    // Player commands and player events stay in step.
    const past: Record<string, string> = {
      'freePoints.assign': 'freePoints.assigned',
      'freePoints.spend': 'freePoints.spent',
      'gift.give': 'gift.given',
      'item.equip': 'item.equipped',
      'item.unequip': 'item.unequipped',
      'trade.propose': 'trade.proposed',
      'trade.accept': 'trade.accepted',
      'trade.decline': 'trade.declined',
      'trade.cancel': 'trade.cancelled',
      'practice.log': 'practice.logged',
      'scene.answer': 'scene.answered',
      'roll.answer': 'roll.answered',
      'entity.closeNotice': 'entity.noticeClosed',
      'montage.focus': 'montage.focused',
      'note.create': 'note.created',
      'note.edit': 'note.edited',
      'note.delete': 'note.deleted',
      'skill.nickname': 'skill.nicknamed',
      'skill.answerMerge': 'skill.mergeAnswered',
      'selection.choose': 'selection.chosen',
      'evolution.choose': 'evolution.chosen',
      'profession.choose': 'profession.chosen',
    };
    expect([...PLAYER_COMMANDS].map((t) => past[t] ?? t)).toEqual([...PLAYER_EVENT_TYPES]);
  });

  it('a player cannot undo, even their own assignment', () => {
    const c = run([assign(1, { strength: 2 })], testContext('a'), base());
    expect(execute(c, { type: 'event.undo', eventId: 'a1' }, player('jake'))).toMatchObject({
      ok: false,
      error: 'Not allowed: only the GM can event.undo',
    });
  });

  it('undoing a player assignment under a later GM override leaves the override in force (D38)', () => {
    const c = run(
      [
        assign(1, { strength: 2 }),
        {
          type: 'freePoints.override',
          characterId: 'jake',
          raceLevel: 1,
          allocation: { vitality: 2 },
        },
        { type: 'event.undo', eventId: 'a1' },
      ],
      testContext('a'),
      base(),
    );
    expect(jake(c)?.freePointBatches[0]).toMatchObject({
      allocation: { vitality: 2 },
      locked: true,
    });
    expect(jake(c)?.stats['strength']).toBe(jake(base())?.stats['strength']);
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[])).toEqual(c);
  });

  it('rejects an empty allocation and unassigning a batch that is not assigned', () => {
    expect(execute(base(), assign(1, {}), player('jake'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('assign exactly 2 points (got 0)'),
    });
    const unassign: Command = {
      type: 'freePoints.override',
      characterId: 'jake',
      raceLevel: 1,
      allocation: null,
    };
    expect(execute(base(), unassign, testContext('g'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('are not assigned'),
    });
  });
});

describe('free points: any amount at once (MV.1)', () => {
  // A third class level → three waiting level-ups (race levels 1-3), 2 points each.
  const three = () =>
    run(
      [{ type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] }],
      testContext('t'),
      base(),
    );
  const spend = (allocation: Record<string, number>, characterId = 'jake'): Command => ({
    type: 'freePoints.spend',
    characterId,
    allocation,
  });
  let n = 0;
  const ok = (
    c: Campaign,
    command: Command,
    ctx: ReturnType<typeof testContext> = {
      ...testContext(`q${++n}x`),
      actor: { role: 'player', characterId: 'jake' },
    },
  ) => {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.campaign;
  };

  it('one confirm spends three level-ups, oldest first, each batch locking', () => {
    const before = three();
    expect(jake(before)?.freePointBatches.map((b) => b.raceLevel)).toEqual([1, 2, 3]);
    const s0 = jake(before)?.stats ?? {};
    const after = ok(before, spend({ strength: 1, agility: 3, wisdom: 2 }));
    const c = jake(after);
    expect(c?.stats['strength']).toBe((s0['strength'] ?? 0) + 1);
    expect(c?.stats['agility']).toBe((s0['agility'] ?? 0) + 3);
    expect(c?.stats['wisdom']).toBe((s0['wisdom'] ?? 0) + 2);
    expect(c?.freePointBatches).toEqual([
      { raceLevel: 1, points: 2, allocation: { strength: 1, agility: 1 }, locked: true },
      { raceLevel: 2, points: 2, allocation: { agility: 2 }, locked: true },
      { raceLevel: 3, points: 2, allocation: { wisdom: 2 }, locked: true },
    ]);
    expect(replay(JSON.parse(JSON.stringify(after.events)) as unknown[])).toEqual(after);
  });

  it('splits a spend in stat order, whatever order the allocation lists (QF.67)', () => {
    const c = jake(ok(three(), spend({ agility: 3, strength: 1 })));
    expect(c?.freePointBatches).toEqual([
      { raceLevel: 1, points: 2, allocation: { strength: 1, agility: 1 }, locked: true },
      { raceLevel: 2, points: 2, allocation: { agility: 2 }, locked: true },
      { raceLevel: 3, points: 2, allocation: null, locked: false },
    ]);
  });

  it('keeps points back; a partly used level-up keeps the rest open and finishes later', () => {
    const c1 = ok(three(), spend({ vitality: 3 }));
    const b1 = jake(c1)?.freePointBatches ?? [];
    expect(b1[0]).toEqual({ raceLevel: 1, points: 2, allocation: { vitality: 2 }, locked: true });
    expect(b1[1]).toEqual({ raceLevel: 2, points: 2, allocation: { vitality: 1 }, locked: false });
    expect(b1[2]).toEqual({ raceLevel: 3, points: 2, allocation: null, locked: false });
    expect(characterFlags(c1.state!, 'jake')).toContainEqual({ kind: 'freePoints', points: 3 });
    const c2 = ok(c1, spend({ perception: 1 }));
    expect(jake(c2)?.freePointBatches[1]).toEqual({
      raceLevel: 2,
      points: 2,
      allocation: { vitality: 1, perception: 1 },
      locked: true,
    });
    expect(jake(c2)?.freePointBatches[2]?.allocation).toBeNull();
    const c3 = ok(c2, spend({ perception: 2 }));
    expect(jake(c3)?.freePointBatches.every((b) => b.locked)).toBe(true);
    expect(statBudgetTotal(jake(c3)!)).toBe(statBudgetTotal(jake(three())!));
  });

  it('refuses too many, nothing, negative, fractional and unknown amounts, and other players', () => {
    const c = three();
    const p = player('jake');
    expect(execute(c, spend({ strength: 7 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('only 6 unassigned points (got 7)'),
    });
    expect(execute(c, spend({}), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('at least one point'),
    });
    expect(execute(c, spend({ strength: 0 }), p).ok).toBe(false);
    expect(execute(c, spend({ strength: -1, agility: 2 }), p).ok).toBe(false);
    expect(execute(c, spend({ strength: 1.5 }), p).ok).toBe(false);
    expect(execute(c, spend({ luck: 1 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown stat "luck"'),
    });
    expect(execute(c, spend({ strength: 1 }, 'kim'), p)).toMatchObject({
      ok: false,
      error: 'Not allowed: players may only act on their own character',
    });
    const all = ok(c, spend({ strength: 6 }));
    expect(execute(all, spend({ strength: 1 }), p)).toMatchObject({
      ok: false,
      error: expect.stringContaining('only 0 unassigned points'),
    });
  });

  it('the GM overrides or unassigns a partly used level-up', () => {
    const c1 = ok(three(), spend({ vitality: 3 }));
    const s1 = jake(c1)?.stats ?? {};
    const over = ok(
      c1,
      {
        type: 'freePoints.override',
        characterId: 'jake',
        raceLevel: 2,
        allocation: { toughness: 2 },
      },
      testContext('g'),
    );
    expect(jake(over)?.freePointBatches[1]).toEqual({
      raceLevel: 2,
      points: 2,
      allocation: { toughness: 2 },
      locked: true,
    });
    expect(jake(over)?.stats['vitality']).toBe((s1['vitality'] ?? 0) - 1);
    expect(jake(over)?.stats['toughness']).toBe((s1['toughness'] ?? 0) + 2);
    const back = ok(
      c1,
      { type: 'freePoints.override', characterId: 'jake', raceLevel: 2, allocation: null },
      testContext('h'),
    );
    expect(jake(back)?.freePointBatches[1]).toEqual({
      raceLevel: 2,
      points: 2,
      allocation: null,
      locked: false,
    });
    expect(jake(back)?.stats['vitality']).toBe((s1['vitality'] ?? 0) - 1);
    // The older one-batch command cannot rewrite a partly used level-up's locked points.
    expect(execute(c1, assign(2, { strength: 2 }), player('jake'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('some race level 2 points are already assigned'),
    });
  });

  it('undo of a spend restores every batch it touched', () => {
    const before = three();
    const after = run([spend({ agility: 5 })], testContext('u'), before);
    const undone = run([{ type: 'event.undo', eventId: 'u1' }], testContext('v'), after);
    expect(jake(undone)?.freePointBatches).toEqual(jake(before)?.freePointBatches);
    expect(jake(undone)?.stats).toEqual(jake(before)?.stats);
  });
});
