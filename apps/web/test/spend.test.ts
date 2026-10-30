// MC.A review M1: the spend counter's line and when it rereads the tally.
import { describe, expect, it } from 'vitest';
import {
  SPEND_POLL_MS,
  shouldPollSpend,
  shownSpend,
  spendLine,
  startSpendPoll,
  type Spend,
  type SpendPollDeps,
} from '../src/gm/spend';

describe('spend counter', () => {
  it('reads like the settings line', () => {
    expect(spendLine({ calls: 0, dollars: 0 })).toBe('This session: $0.000 · 0 calls');
    expect(spendLine({ calls: 1, dollars: 0.0012 })).toBe('This session: $0.001 · 1 call');
    expect(spendLine({ calls: 12, dollars: 1.234 })).toBe('This session: $1.23 · 12 calls');
  });
  it('rereads only while a key is saved', () => {
    expect(shouldPollSpend(null)).toBe(false);
    expect(shouldPollSpend({ hasKey: false })).toBe(false);
    expect(shouldPollSpend({ hasKey: true })).toBe(true);
  });
  it('rereads on a slow clock (a minute or two of suggestions shows within one tick)', () => {
    expect(SPEND_POLL_MS).toBeGreaterThanOrEqual(10_000);
    expect(SPEND_POLL_MS).toBeLessThanOrEqual(30_000);
  });
});

// QF.35 (c): the poll itself. A console without a key makes no requests; with
// a key it rereads on each tick and stops when unmounted; a newer seed wins
// over a stale reread.
describe('spend poll (QF.35)', () => {
  const fakeDeps = () => {
    const ticks: (() => void)[] = [];
    const urls: string[] = [];
    let cleared = 0;
    const deps: SpendPollDeps = {
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ spend: { calls: 3, dollars: 0.5 } }),
        });
      },
      setInterval: (tick, ms) => {
        expect(ms).toBe(SPEND_POLL_MS);
        ticks.push(tick);
        return ticks.length;
      },
      clearInterval: () => {
        cleared += 1;
      },
    };
    return { deps, ticks, urls, cleared: () => cleared };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('makes no requests without a key', async () => {
    const f = fakeDeps();
    const seen: Spend[] = [];
    expect(startSpendPoll('k', false, (s) => seen.push(s), f.deps)).toBeUndefined();
    for (const t of f.ticks) t();
    await flush();
    expect(f.ticks).toHaveLength(0);
    expect(f.urls).toHaveLength(0);
    expect(seen).toEqual([]);
  });

  it('rereads on each tick with a key, then stops', async () => {
    const f = fakeDeps();
    const seen: Spend[] = [];
    const stop = startSpendPoll('k', true, (s) => seen.push(s), f.deps);
    expect(f.ticks).toHaveLength(1);
    f.ticks[0]!();
    f.ticks[0]!();
    await flush();
    expect(f.urls).toEqual(['/api/gm/ai', '/api/gm/ai']);
    expect(seen).toEqual([
      { calls: 3, dollars: 0.5 },
      { calls: 3, dollars: 0.5 },
    ]);
    stop?.();
    expect(f.cleared()).toBe(1);
    // A reread in flight when stopped is dropped.
    f.ticks[0]!();
    await flush();
    expect(seen).toHaveLength(2);
  });

  it('shows a newer seed over a stale reread', () => {
    const oldSeed = { calls: 1, dollars: 0.1 };
    const reread = { calls: 2, dollars: 0.2 };
    const newSeed = { calls: 4, dollars: 0.4 };
    expect(shownSpend(null, oldSeed)).toBe(oldSeed);
    expect(shownSpend({ over: oldSeed, spend: reread }, oldSeed)).toBe(reread);
    expect(shownSpend({ over: oldSeed, spend: reread }, newSeed)).toBe(newSeed);
    expect(shownSpend({ over: null, spend: reread }, null)).toBe(reread);
  });
});
