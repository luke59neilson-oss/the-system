// MC.A review M1: the spend counter's line and when it rereads the tally.
import { describe, expect, it } from 'vitest';
import { SPEND_POLL_MS, shouldPollSpend, spendLine } from '../src/gm/spend';

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
