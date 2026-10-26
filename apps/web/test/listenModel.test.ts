import { describe, expect, it } from 'vitest';
import { joinBlocks, listenPollNeeded, voiceRows } from '../src/gm/listenModel';

// QF.31: the Listening panel polls only while its view can change on its own.
describe('listening poll (QF.31)', () => {
  it('polls while the mic is on, whatever the model', () => {
    expect(listenPollNeeded(true, null)).toBe(true);
    expect(listenPollNeeded(true, { state: 'ready' })).toBe(true);
  });

  it('polls while the speech model downloads or loads', () => {
    expect(listenPollNeeded(false, { state: 'downloading', received: 1, bytes: 9 })).toBe(true);
    expect(listenPollNeeded(false, { state: 'loading' })).toBe(true);
  });

  it('is quiet when idle: mic off and the model missing, ready, failed or absent', () => {
    expect(listenPollNeeded(false, null)).toBe(false);
    expect(listenPollNeeded(false, { state: 'missing', bytes: 9 })).toBe(false);
    expect(listenPollNeeded(false, { state: 'ready' })).toBe(false);
    expect(listenPollNeeded(false, { state: 'failed', error: 'x', bytes: 9 })).toBe(false);
  });
});

describe('voices (MC.6)', () => {
  it('lists every character in party order with its enrolment, plus orphaned enrolments', () => {
    const rows = voiceRows(
      [
        { id: 'jake', name: 'Jake' },
        { id: 'miranda', name: 'Miranda' },
      ],
      [
        { characterId: 'miranda', name: 'Miranda', enrolledAt: '2026-10-26T10:00:00.000Z' },
        { characterId: 'gone', name: 'Old Hero', enrolledAt: '2026-10-25T10:00:00.000Z' },
      ],
    );
    expect(rows).toEqual([
      { characterId: 'jake', name: 'Jake', enrolledAt: null },
      { characterId: 'miranda', name: 'Miranda', enrolledAt: '2026-10-26T10:00:00.000Z' },
      { characterId: 'gone', name: 'Old Hero', enrolledAt: '2026-10-25T10:00:00.000Z' },
    ]);
  });

  it('joins recorded blocks into one sample, dropping the overrun', () => {
    const b = (v: number) => new Float32Array(4).fill(v);
    expect(Array.from(joinBlocks([b(1), b(2), b(3)], 10))).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    expect(Array.from(joinBlocks([b(1)], 10))).toEqual([1, 1, 1, 1]);
  });
});
