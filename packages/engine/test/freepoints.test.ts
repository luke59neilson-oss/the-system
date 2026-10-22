import { describe, expect, it } from 'vitest';
import {
  PLAYER_COMMANDS,
  PLAYER_EVENT_TYPES,
  appendEvent,
  execute,
  parseEvent,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const setup: Command[] = [
  { type: 'campaign.create', name: 'W', rules: rawRules() },
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
      'gift.give': 'gift.given',
      'item.equip': 'item.equipped',
      'item.unequip': 'item.unequipped',
      'trade.propose': 'trade.proposed',
      'trade.accept': 'trade.accepted',
      'trade.decline': 'trade.declined',
      'trade.cancel': 'trade.cancelled',
      'practice.log': 'practice.logged',
      'montage.focus': 'montage.focused',
      'note.create': 'note.created',
      'note.edit': 'note.edited',
      'note.delete': 'note.deleted',
      'skill.nickname': 'skill.nicknamed',
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
