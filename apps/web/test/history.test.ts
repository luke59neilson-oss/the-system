import { describe, expect, it } from 'vitest';
import type { SeqNotification } from '../src/live';
import {
  SOUND_KEY,
  arrivals,
  filterHistory,
  isDing,
  nextArrival,
  notificationKey,
  readSound,
  whenLabel,
  writeSound,
} from '../src/player/history';

const at = '2026-10-21T14:05:00.000Z';
const level = (
  seq: number,
  track: 'class' | 'profession' | 'race',
  name: string,
  to: number,
  day = 1,
): SeqNotification => ({
  seq,
  at,
  day,
  notification: { kind: 'level', characterId: 'j', track, name, from: to - 1, to, freePoints: 0 },
});
const items: SeqNotification[] = [
  level(2, 'class', 'Archer', 1),
  level(2, 'race', 'Human', 1),
  { seq: 2, at, day: 1, notification: { kind: 'freePoints', characterId: 'j', unassigned: 2 } },
  {
    seq: 5,
    at,
    day: 3,
    notification: { kind: 'broadcast', characterId: 'j', text: 'Day 3 dawns' },
  },
  level(7, 'profession', 'Cook', 5, 4),
];

describe('notification history (M3.3)', () => {
  it('filters by kind and track, newest first', () => {
    const seqs = (f: Parameters<typeof filterHistory>[1]) =>
      filterHistory(items, f, '').map((n) => n.notification.kind + n.seq);
    expect(seqs('dings')).toEqual(['level7', 'level2', 'level2']);
    expect(seqs('all')).toHaveLength(5);
    expect(seqs('class')).toEqual(['level2']);
    expect(seqs('profession')).toEqual(['level7']);
    expect(seqs('race')).toEqual(['level2']);
    expect(seqs('freePoints')).toEqual(['freePoints2']);
    expect(seqs('broadcast')).toEqual(['broadcast5']);
  });

  it('an acquired profession counts as a DING and under Profession (MQ.6)', () => {
    const acquired: SeqNotification = {
      seq: 9,
      at,
      day: 5,
      notification: { kind: 'profession', characterId: 'j', name: 'Cook', level: 14 },
    };
    const kinds = (f: Parameters<typeof filterHistory>[1]) =>
      filterHistory([...items, acquired], f, '').map((n) => n.notification.kind + n.seq);
    expect(kinds('dings')[0]).toBe('profession9');
    expect(kinds('profession')).toEqual(['profession9', 'level7']);
    expect(kinds('class')).toEqual(['level2']);
  });

  it('searches the book text and the day, ignoring case', () => {
    expect(filterHistory(items, 'all', 'ARCHER').map((n) => n.seq)).toEqual([2]);
    expect(filterHistory(items, 'all', '  dawns ').map((n) => n.seq)).toEqual([5]);
    expect(filterHistory(items, 'all', 'day 4').map((n) => n.seq)).toEqual([7]);
    expect(filterHistory(items, 'dings', 'dawns')).toEqual([]);
  });

  it('labels the in-game day and time', () => {
    expect(whenLabel({ at, day: 3 })).toMatch(/^Day 3 · \d{1,2}:\d{2}/);
    expect(whenLabel({ at: 'nonsense', day: 2 })).toBe('Day 2');
  });

  it('queues only DINGs and messages that arrived after the page joined', () => {
    expect(arrivals(items, null)).toEqual([]);
    expect(arrivals(items, 2).map((n) => n.seq)).toEqual([5, 7]);
    expect(arrivals(items, 0).map((n) => n.notification.kind)).not.toContain('freePoints');
  });

  it('remembers the sound choice and survives blocked storage', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(readSound(store)).toBe(false);
    writeSound(store, true);
    expect(data.get(SOUND_KEY)).toBe('on');
    expect(readSound(store)).toBe(true);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSound(blocked)).toBe(false);
    expect(() => writeSound(blocked, true)).not.toThrow();
    expect(readSound(null)).toBe(false);
  });

  it('picks the next DING by identity, so an undo cannot skip or swallow one', () => {
    const a = level(10, 'class', 'Archer', 5);
    const b = level(11, 'class', 'Archer', 6);
    const c = level(12, 'class', 'Archer', 7);
    const shown = new Set([notificationKey(a), notificationKey(b)]);
    // b was undone (history reset without it); a new DING c arrives.
    const after = nextArrival([...items, a, c], 9, shown);
    expect(after.current?.seq).toBe(12);
    expect(after.waiting).toBe(0);
    // An earlier unseen arrival removed: the next one is still found.
    expect(nextArrival([...items, b, c], 9, new Set([notificationKey(b)])).current?.seq).toBe(12);
    expect(nextArrival([...items, a, b, c], 9, new Set()).waiting).toBe(2);
  });

  it('every DING kind counts as a DING; nothing else does (QF.17)', () => {
    const c = 'j';
    const dings = [
      level(1, 'class', 'Archer', 1).notification,
      { kind: 'profession', characterId: c, name: 'Cook', level: 14 },
      {
        kind: 'skillUpgrade',
        characterId: c,
        skill: 'Basic Archery',
        from: 'Inferior',
        to: 'Common',
      },
      { kind: 'skillMerge', characterId: c, skills: ['A', 'B'], name: 'AB', rarity: 'Rare' },
    ] as const;
    const others = [
      { kind: 'freePoints', characterId: c, unassigned: 2 },
      { kind: 'broadcast', characterId: c, text: 'Hi' },
      { kind: 'hiddenQuest', characterId: c },
      { kind: 'trade', characterId: c, action: 'proposed', other: null },
    ] as const;
    for (const n of dings) expect(isDing(n), n.kind).toBe(true);
    for (const n of others) expect(isDing(n), n.kind).toBe(false);
    // The history's DING filter is the same set.
    const seqd = [...dings, ...others].map((notification, i) => ({
      seq: i,
      at,
      day: 1,
      notification,
    }));
    expect(
      filterHistory(seqd, 'dings', '')
        .map((n) => n.notification.kind)
        .reverse(),
    ).toEqual(dings.map((n) => n.kind));
  });
});
