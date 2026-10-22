import { describe, expect, it } from 'vitest';
import {
  emptyCampaign,
  execute,
  notificationHistory,
  notificationsBetween,
  buildDemoEvents,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const setup: Command[] = [
  { type: 'campaign.create', name: 'History', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'casper', name: 'Casper', className: 'Archer', classSkills: kit },
];
const award = (id: string, amount: number): Command => ({
  type: 'xp.award',
  track: 'class',
  amount,
  participants: [{ characterId: id }],
});

describe('notificationHistory (M3.3)', () => {
  it('lists every notification back to day 1 with seq, time and day', () => {
    const ctx = testContext('h');
    const c = run(
      [
        ...setup,
        award('jake', 1000),
        { type: 'campaign.advanceDay', days: 2 },
        { type: 'system.broadcast', text: 'Day 3 dawns.' },
        award('casper', 1000),
      ],
      ctx,
    );
    const items = notificationHistory(c);
    // The first award is event 4 (seq 4); the broadcast reaches both.
    const jakeLevels = items.filter(
      (i) => i.notification.characterId === 'jake' && i.notification.kind === 'level',
    );
    expect(jakeLevels.length).toBeGreaterThan(0);
    expect(jakeLevels.every((i) => i.seq === 4 && i.day === 1)).toBe(true);
    expect(jakeLevels[0]?.at).toBe(c.events[3]?.timestamp);
    const broadcasts = items.filter((i) => i.notification.kind === 'broadcast');
    expect(broadcasts.map((b) => [b.notification.characterId, b.day, b.seq])).toEqual([
      ['jake', 3, 6],
      ['casper', 3, 6],
    ]);
    const casperLevels = items.filter(
      (i) => i.notification.characterId === 'casper' && i.notification.kind === 'level',
    );
    expect(casperLevels.every((i) => i.seq === 7 && i.day === 3)).toBe(true);
    // Oldest first.
    expect(items.map((i) => i.seq)).toEqual([...items.map((i) => i.seq)].sort((a, b) => a - b));
  });

  it('matches the live notifications event by event', () => {
    const ctx = testContext('l');
    let c: Campaign = emptyCampaign();
    const live: { seq: number; kind: string; characterId: string }[] = [];
    for (const command of [
      ...setup,
      award('jake', 400),
      award('jake', 4000),
      { type: 'system.broadcast', text: 'Hi', characterIds: ['casper'] } as Command,
    ]) {
      const before = c.state;
      const r = execute(c, command, ctx);
      if (!r.ok) throw new Error(r.error);
      c = r.campaign;
      for (const n of notificationsBetween(before, c.state, c.events.at(-1))) {
        live.push({ seq: c.events.length, kind: n.kind, characterId: n.characterId });
      }
    }
    expect(
      notificationHistory(c).map((i) => ({
        seq: i.seq,
        kind: i.notification.kind,
        characterId: i.notification.characterId,
      })),
    ).toEqual(live);
  });

  it('drops undone events as if they never happened', () => {
    const ctx = testContext('u');
    const c1 = run([...setup, award('jake', 1000)], ctx);
    const awardId = c1.events.at(-1)?.id ?? '';
    const c2 = run([{ type: 'event.undo', eventId: awardId }, award('casper', 1000)], ctx, c1);
    const items = notificationHistory(c2);
    expect(items.some((i) => i.notification.characterId === 'jake')).toBe(false);
    expect(items.some((i) => i.notification.characterId === 'casper')).toBe(true);
    expect(notificationHistory(emptyCampaign())).toEqual([]);
  });

  it('covers the demo campaign without throwing', () => {
    let n = 0;
    const demo = replay(
      buildDemoEvents({ now: () => '2026-10-21T00:00:00.000Z', newId: () => `id-${++n}` }),
    );
    const items = notificationHistory(demo);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(demo.state?.characters[i.notification.characterId]).toBeDefined();
  });
});
