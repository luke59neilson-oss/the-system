import { describe, expect, it } from 'vitest';
import { FixtureAiClient } from '../src/ai/fake';
import {
  MAX_CHIPS,
  SUGGEST_INTERVAL_MIN_S,
  chipId,
  parseChips,
  suggest,
  suggestDue,
  suggestPrompt,
} from '../src/ai/suggestions';
import type { TranscriptLine } from '../src/speech/transcript';

// MC.8 (DESIGN §11 "Suggestions"): chips from the recent transcript, each
// with the quote behind it; dismissed chips never return; calls are paced.
const line = (text: string, speaker?: string): TranscriptLine => ({
  at: '2026-10-26T19:00:00.000Z',
  startMs: 0,
  endMs: 1000,
  text,
  ...(speaker ? { speaker } : {}),
});
const lines = [
  line('We should find an herbalist before the canyon.', 'Jake'),
  line('Jake nocks an arrow and waits.'),
];
const context = { party: ['Jake', 'Miranda'], known: ['The Crown', 'Old Tam (NPC)'] };
const reply = JSON.stringify({
  chips: [
    {
      line: 1,
      type: 'generate',
      kind: 'shop',
      title: 'Herbalist shop',
      request: 'An herbalist at the canyon edge',
    },
    { line: 2, type: 'complication', kind: 'encounter', title: 'Pale hunters', request: 'Ambush' },
    { line: 9, type: 'callback', kind: 'npc', title: 'Old Tam returns', request: 'Old Tam' },
  ],
});

describe('suggestion chips (MC.8)', () => {
  it('quotes the real transcript line, drops chips that point nowhere', () => {
    const chips = parseChips(reply, lines, new Set());
    expect(chips.map((c) => [c.type, c.kind, c.title, c.quote])).toEqual([
      ['generate', 'shop', 'Herbalist shop', 'We should find an herbalist before the canyon.'],
      ['complication', 'encounter', 'Pale hunters', 'Jake nocks an arrow and waits.'],
    ]);
  });

  it('never returns a dismissed chip, even reworded in case or spacing', () => {
    const dismissed = new Set([chipId('generate', 'shop', '  herbalist   SHOP ')]);
    expect(parseChips(reply, lines, dismissed).map((c) => c.title)).toEqual(['Pale hunters']);
  });

  it('keeps at most MAX_CHIPS and no duplicates', () => {
    const many = JSON.stringify({
      chips: Array.from({ length: 8 }, (_, i) => ({
        line: 1,
        type: 'generate',
        kind: 'npc',
        title: `NPC ${i % 6}`,
        request: 'x',
      })),
    });
    const chips = parseChips(many, lines, new Set());
    expect(chips).toHaveLength(MAX_CHIPS);
    expect(new Set(chips.map((c) => c.id)).size).toBe(MAX_CHIPS);
  });

  it('rejects a reply with no JSON', () => {
    expect(() => parseChips('no ideas', lines, new Set())).toThrow();
  });

  it('sends the party, known names and numbered lines to the fast model', async () => {
    const client = new FixtureAiClient([{ role: 'fast', match: 'Suggestions.', text: reply }]);
    const chips = await suggest(client, lines, context, new Set());
    expect(chips).toHaveLength(2);
    expect(client.requests[0]!.role).toBe('fast');
    expect(suggestPrompt(lines, context)).toContain(
      '1. [Jake] We should find an herbalist before the canyon.',
    );
    expect(suggestPrompt(lines, context)).toContain('Known: The Crown, Old Tam (NPC)');
  });

  it('makes no call with no new lines', async () => {
    const client = new FixtureAiClient([]);
    expect(await suggest(client, [], context, new Set())).toEqual([]);
    expect(client.requests).toHaveLength(0);
  });
});

describe('pacing (MC.8, D244)', () => {
  const base = { now: 1_000_000, intervalS: 90, newLines: 3, manual: false };
  it('is due at once the first time, then only after the interval', () => {
    expect(suggestDue({ ...base, lastCallAt: null })).toBe(true);
    expect(suggestDue({ ...base, lastCallAt: base.now - 89_000 })).toBe(false);
    expect(suggestDue({ ...base, lastCallAt: base.now - 90_000 })).toBe(true);
  });
  it('never calls without new talk', () => {
    expect(suggestDue({ ...base, newLines: 0, lastCallAt: null })).toBe(false);
  });
  it('clamps a too-short interval and limits manual calls to the minimum', () => {
    const shortly = base.now - (SUGGEST_INTERVAL_MIN_S - 1) * 1000;
    expect(suggestDue({ ...base, intervalS: 5, lastCallAt: shortly })).toBe(false);
    expect(suggestDue({ ...base, manual: true, lastCallAt: shortly })).toBe(false);
    expect(
      suggestDue({ ...base, manual: true, lastCallAt: base.now - SUGGEST_INTERVAL_MIN_S * 1000 }),
    ).toBe(true);
  });
});
