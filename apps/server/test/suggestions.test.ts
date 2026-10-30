import { describe, expect, it } from 'vitest';
import { FixtureAiClient } from '../src/ai/fake';
import {
  MAX_CHIPS,
  MORE_MAX,
  PICK_SLOTS,
  SUGGEST_INTERVAL_MIN_S,
  SUGGEST_QUESTION_WAIT_S,
  arrangePicks,
  chipId,
  rowChips,
  type SuggestionChip,
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

describe('a new question or attempt (MD.2, D258)', () => {
  const base = { now: 1_000_000, intervalS: 300, newLines: 1, manual: false };
  it('makes a call due after the short wait, not the interval', () => {
    const at = (s: number) => base.now - s * 1000;
    expect(
      suggestDue({ ...base, question: true, lastCallAt: at(SUGGEST_QUESTION_WAIT_S - 1) }),
    ).toBe(false);
    expect(suggestDue({ ...base, question: true, lastCallAt: at(SUGGEST_QUESTION_WAIT_S) })).toBe(
      true,
    );
    expect(suggestDue({ ...base, question: false, lastCallAt: at(SUGGEST_QUESTION_WAIT_S) })).toBe(
      false,
    );
    // A manual ask on a question waits the short time too, never less.
    expect(
      suggestDue({
        ...base,
        manual: true,
        question: true,
        lastCallAt: at(SUGGEST_QUESTION_WAIT_S),
      }),
    ).toBe(true);
    expect(
      suggestDue({
        ...base,
        manual: true,
        question: true,
        lastCallAt: at(SUGGEST_QUESTION_WAIT_S - 1),
      }),
    ).toBe(false);
  });
  it('still needs new talk', () => {
    expect(suggestDue({ ...base, question: true, newLines: 0, lastCallAt: null })).toBe(false);
  });
});

describe('stable slots for the co-DM row (MD.2)', () => {
  const chip = (title: string): SuggestionChip => ({
    id: chipId('generate', 'npc', title),
    type: 'generate',
    kind: 'npc',
    title,
    request: title,
    quote: 'q',
  });
  const titles = (row: ReturnType<typeof arrangePicks>) => ({
    slots: row.slots.map((c) => c?.title ?? null),
    more: row.more.map((c) => c.title),
  });
  const [a, b, c, d, e, f, g] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(chip) as SuggestionChip[];

  it('fills empty slots in order and puts the rest in more', () => {
    expect(PICK_SLOTS).toBe(5);
    expect(titles(arrangePicks(undefined, [a!, b!]))).toEqual({
      slots: ['A', 'B', null, null, null],
      more: [],
    });
    expect(titles(arrangePicks(undefined, [a!, b!, c!, d!, e!, f!, g!]))).toEqual({
      slots: ['A', 'B', 'C', 'D', 'E'],
      more: ['F', 'G'],
    });
  });

  it('never reorders: new chips (listed first) fill only empty slots', () => {
    const first = arrangePicks(undefined, [a!, b!, c!]);
    const slots = first.slots.map((x) => x?.id ?? null);
    // A later call offers D and E first; A, B, C keep their slots.
    const next = arrangePicks(slots, [d!, e!, ...rowChips(first)]);
    expect(titles(next)).toEqual({ slots: ['A', 'B', 'C', 'D', 'E'], more: [] });
    // And one more call: F waits, nothing moves.
    const again = arrangePicks(
      next.slots.map((x) => x?.id ?? null),
      [f!, ...rowChips(next)],
    );
    expect(titles(again)).toEqual({ slots: ['A', 'B', 'C', 'D', 'E'], more: ['F'] });
  });

  it('a dismissed slot takes the first waiting chip; others stay put', () => {
    const full = arrangePicks(undefined, [a!, b!, c!, d!, e!, f!, g!]);
    const ids = full.slots.map((x) => x?.id ?? null);
    const without = rowChips(full).filter((x) => x.id !== b!.id);
    expect(titles(arrangePicks(ids, without))).toEqual({
      slots: ['A', 'F', 'C', 'D', 'E'],
      more: ['G'],
    });
    // With nothing waiting, the slot stays empty.
    const few = arrangePicks(undefined, [a!, b!, c!]);
    const left = rowChips(few).filter((x) => x.id !== a!.id);
    expect(
      titles(
        arrangePicks(
          few.slots.map((x) => x?.id ?? null),
          left,
        ),
      ),
    ).toEqual({
      slots: [null, 'B', 'C', null, null],
      more: [],
    });
  });

  it('bounds the more list, never drops a slotted chip, and ignores duplicates', () => {
    const many = Array.from({ length: 20 }, (_, i) => chip(`N${i}`));
    const row = arrangePicks(undefined, many);
    expect(row.more).toHaveLength(MORE_MAX);
    // The oldest slotted chips sit at the end of a newest-first list; they stay.
    const ids = row.slots.map((x) => x?.id ?? null);
    const fresh = Array.from({ length: 20 }, (_, i) => chip(`M${i}`));
    const later = arrangePicks(ids, [...fresh, ...rowChips(row)]);
    expect(later.slots.map((x) => x?.title)).toEqual(['N0', 'N1', 'N2', 'N3', 'N4']);
    expect(later.more.map((x) => x.title)).toEqual(fresh.slice(0, MORE_MAX).map((x) => x.title));
    expect(titles(arrangePicks([a!.id, a!.id], [a!, a!, b!]))).toEqual({
      slots: ['A', 'B', null, null, null],
      more: [],
    });
  });
});
