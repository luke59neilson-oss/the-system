import { describe, expect, it } from 'vitest';
import {
  FAST_RETRIES,
  SLOW_EVERY,
  firstReadDue,
  joinBlocks,
  listenPollNeeded,
  voiceRows,
  type ModelStatus,
} from '../src/gm/listenModel';

// QF.31 (D239): the Listening panel polls only while its view can change on its own.
const idle = { on: false, model: null as ModelStatus | null, loaded: true, capturing: false };

describe('listening poll (QF.31)', () => {
  it('polls while the laptop listens or this window holds a mic, whatever the model', () => {
    expect(listenPollNeeded({ ...idle, on: true })).toBe(true);
    expect(listenPollNeeded({ ...idle, on: true, model: { state: 'ready' } })).toBe(true);
    expect(listenPollNeeded({ ...idle, capturing: true })).toBe(true);
  });

  it('polls while the speech model downloads or loads', () => {
    expect(
      listenPollNeeded({ ...idle, model: { state: 'downloading', received: 1, bytes: 9 } }),
    ).toBe(true);
    expect(listenPollNeeded({ ...idle, model: { state: 'loading' } })).toBe(true);
  });

  it('keeps asking until a first read lands', () => {
    expect(listenPollNeeded({ ...idle, loaded: false })).toBe(true);
    expect(listenPollNeeded({ ...idle, loaded: false, model: { state: 'ready' } })).toBe(true);
  });

  it('is quiet when idle: loaded, mic off and the model missing, ready, failed or absent', () => {
    expect(listenPollNeeded(idle)).toBe(false);
    expect(listenPollNeeded({ ...idle, model: { state: 'missing', bytes: 9 } })).toBe(false);
    expect(listenPollNeeded({ ...idle, model: { state: 'ready' } })).toBe(false);
    expect(listenPollNeeded({ ...idle, model: { state: 'failed', error: 'x', bytes: 9 } })).toBe(
      false,
    );
  });

  it('retries a failing first read every tick at first, then every 10 s', () => {
    for (let misses = 0; misses < FAST_RETRIES; misses += 1) {
      expect(firstReadDue(misses, 1)).toBe(true);
    }
    const due = Array.from({ length: 10 }, (_, i) => firstReadDue(FAST_RETRIES, i + 1));
    expect(due.filter(Boolean)).toHaveLength(10 / SLOW_EVERY);
    expect(firstReadDue(FAST_RETRIES, SLOW_EVERY)).toBe(true);
    expect(firstReadDue(FAST_RETRIES + 5, SLOW_EVERY + 1)).toBe(false);
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
