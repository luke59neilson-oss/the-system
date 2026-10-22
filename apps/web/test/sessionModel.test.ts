import { describe, expect, it } from 'vitest';
import type { CampaignState, SessionRecord } from '@the-system/engine';
import { daySpan, duration, parseDays, sessionSummary, shortTime } from '../src/gm/sessionModel';

const rec = (id: string, number: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  number,
  startedAt: '2026-10-22T19:00:00.000Z',
  startDay: 1,
  endedAt: '2026-10-22T22:05:00.000Z',
  endDay: 3,
  ...extra,
});
const stateWith = (sessions: SessionRecord[], currentSession: string | null, day = 5) =>
  ({ sessions, currentSession, day }) as unknown as CampaignState;

describe('session summary', () => {
  it('shows the running session, the next number and past sessions newest first', () => {
    const open = rec('c', 3, { startDay: 5, endedAt: null, endDay: null });
    const s = sessionSummary(stateWith([rec('a', 1), rec('b', 2), open], 'c'));
    expect(s.running?.id).toBe('c');
    expect(s.nextNumber).toBe(4);
    expect(s.day).toBe(5);
    expect(s.past.map((x) => x.number)).toEqual([2, 1]);
    const between = sessionSummary(stateWith([rec('a', 1)], null));
    expect(between.running).toBeNull();
    expect(between.nextNumber).toBe(2);
    expect(sessionSummary(stateWith([], null)).past).toEqual([]);
  });

  it('formats day spans, durations and the advance field', () => {
    expect(daySpan(rec('a', 1), 9)).toBe('Days 1–3');
    expect(daySpan(rec('a', 1, { endDay: 1 }), 9)).toBe('Day 1');
    expect(daySpan(rec('a', 1, { endDay: null, startDay: 4 }), 4)).toBe('Day 4');
    expect(daySpan(rec('a', 1, { endDay: null, startDay: 4 }), 6)).toBe('Days 4–6');
    expect(duration('2026-10-22T19:00:00.000Z', '2026-10-22T22:05:59.000Z')).toBe('3 h 05 min');
    expect(duration('2026-10-22T19:00:00.000Z', '2026-10-22T19:45:00.000Z')).toBe('45 min');
    expect(duration('2026-10-22T19:00:00.000Z', '2026-10-22T18:00:00.000Z')).toBe('');
    expect(duration('2026-10-22T19:00:00.000Z', '2026-10-22T19:00:40.000Z')).toBe('under 1 min');
    expect(parseDays('1')).toBe(1);
    expect(parseDays(' 30 ')).toBe(30);
    for (const bad of ['', '0', '-1', '1.5', '2e3', 'abc', '1001'])
      expect(parseDays(bad)).toBeNull();
    expect(shortTime('nope')).toBe('nope');
    expect(shortTime('2026-10-22T19:00:00.000Z')).toMatch(/\d/);
  });
});
