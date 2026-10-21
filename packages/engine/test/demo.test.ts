import { describe, expect, it } from 'vitest';
import {
  DEMO_BROADCASTS,
  DEMO_CAMPAIGN_NAME,
  DEMO_CHARACTERS,
  buildDemoEvents,
  projectForPlayer,
  raceLevel,
  replay,
} from '../src';

const ctx = () => {
  let n = 0;
  return { now: () => '2026-10-21T00:00:00.000Z', newId: () => `id-${++n}` };
};

describe('demo campaign (MS.4)', () => {
  it('builds a party at different levels from ordinary GM commands', () => {
    const events = buildDemoEvents(ctx());
    expect(events.every((e) => e.actor.role === 'gm')).toBe(true);
    const state = replay(events).state;
    expect(state?.name).toBe(DEMO_CAMPAIGN_NAME);
    expect(state?.characterOrder).toEqual(DEMO_CHARACTERS.map((c) => c.id));
    const levels = DEMO_CHARACTERS.map((c) => state?.characters[c.id]?.classLevel);
    // Jake at the G-grade cap (4) with XP banked, then 3, 2 and 0.
    expect(levels).toEqual([4, 3, 2, 0]);
    expect(state?.characters['demo-jake']?.xp.class).toBe(50);
    for (const c of DEMO_CHARACTERS) {
      const ch = state?.characters[c.id];
      expect(ch?.skills.map((s) => s.name)).toContain('Identify');
      expect(ch?.skills.length).toBe(4);
      if (state && ch) expect(raceLevel(state.rules, ch)).toBe(ch.classLevel);
    }
    expect(state?.broadcasts.map((b) => b.text)).toEqual(DEMO_BROADCASTS);
  });

  it('is deterministic for a fixed clock and ids', () => {
    expect(buildDemoEvents(ctx())).toEqual(buildDemoEvents(ctx()));
  });

  it('keeps the GM-only award reason out of every player view', () => {
    const state = replay(buildDemoEvents(ctx())).state;
    if (!state) throw new Error('no state');
    for (const c of DEMO_CHARACTERS) {
      expect(JSON.stringify(projectForPlayer(state, c.id))).not.toContain(
        'Demo campaign starting XP',
      );
    }
  });
});
