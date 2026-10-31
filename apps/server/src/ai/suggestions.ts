// MC.8 (DESIGN §11 "Suggestions"): every minute or two the fast model reads
// the recent transcript plus the campaign context and offers a few chips,
// each with the quote that prompted it: Generate (a shop, NPC, place,
// encounter, item or quest hook the table just mentioned), Complication
// (chaos to throw in) or Callback (bring back an earlier NPC or thread). A
// chip never changes the campaign: clicking it only fills in the MC.2
// generate request. Pure helpers here (prompt, parse, dismissal, pacing);
// calls go through the co-DM client, so the spend counter sees them.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AiClient } from './client';
import { GENERATE_KINDS, type GenerateKind } from './generate';
import type { TranscriptLine } from '../speech/transcript';
import { SHARED_SYSTEM_LINES } from './setting';

export const CHIP_TYPES = ['generate', 'complication', 'callback'] as const;
export type ChipType = (typeof CHIP_TYPES)[number];

export interface SuggestionChip {
  /** Stable id from type, kind and title, so a dismissed chip never returns (D244). */
  readonly id: string;
  readonly type: ChipType;
  /** The generate kind the chip fills in (Generate chips; others default to a fitting kind). */
  readonly kind: GenerateKind;
  /** Short label on the chip. */
  readonly title: string;
  /** The request it fills into the MC.2 text box. */
  readonly request: string;
  /** The transcript line that prompted it, verbatim. */
  readonly quote: string;
}

export interface SuggestionContext {
  readonly party: readonly string[];
  /** Region, NPCs, shops, quests the table already has (names only). */
  readonly known: readonly string[];
}

/** At most this many chips per call: enough to fill the row of five and offer one more (D258). */
export const MAX_CHIPS = 6;
/** MD.2: the co-DM's row on the quick-response panel (keys 6–9 and 0). */
export const PICK_SLOTS = 5;
/** MD.2: chips waiting in the "more" list beyond the five slots. */
export const MORE_MAX = 7;
/**
 * MD.2 (D258): a new player question or attempt makes a call due after this
 * many seconds instead of the GM's interval, so the row refreshes on what
 * the table just asked while spend stays bounded (at most 2 calls a minute).
 */
export const SUGGEST_QUESTION_WAIT_S = 30;
/** Default pace and the allowed range, in seconds (settable; D244). */
export const SUGGEST_INTERVAL_DEFAULT_S = 90;
export const SUGGEST_INTERVAL_MIN_S = 60;
export const SUGGEST_INTERVAL_MAX_S = 600;

export const SUGGEST_SYSTEM = [
  ...SHARED_SYSTEM_LINES,
  'You are the co-DM for a LitRPG tabletop game. You read the latest table talk and offer the GM a few ideas.',
  'Each idea is one of: "generate" (a shop, npc, place, encounter, item or questHook the table just mentioned or needs),',
  '"complication" (chaos to throw in now), "callback" (bring back an earlier NPC or thread from the known list).',
  'Every idea must quote one transcript line exactly, by its number.',
  `Reply with JSON only, at most ${MAX_CHIPS} ideas:`,
  '{"chips":[{"line":<line number>,"type":"generate"|"complication"|"callback","kind":"shop"|"npc"|"place"|"encounter"|"item"|"questHook","title":"<2-6 words>","request":"<one sentence for the generator>"}]}',
  'Reply {"chips":[]} when nothing fits.',
].join('\n');

export function suggestPrompt(
  lines: readonly TranscriptLine[],
  context: SuggestionContext,
): string {
  const heard = lines.map(
    (l, i) => `${i + 1}. ${l.speaker ? `[${l.speaker}] ` : ''}${l.text.replace(/\s+/g, ' ')}`,
  );
  return [
    'Suggestions.',
    `Party: ${context.party.join(', ') || '(none)'}`,
    `Known: ${context.known.join(', ') || '(nothing yet)'}`,
    'Transcript:',
    ...heard,
  ].join('\n');
}

const replySchema = z.object({
  chips: z.array(
    z.object({
      line: z.number().int(),
      type: z.enum(CHIP_TYPES),
      kind: z.enum(GENERATE_KINDS).catch('npc'),
      title: z.string().min(1).max(80),
      request: z.string().min(1).max(500),
    }),
  ),
});

const jsonIn = (text: string): unknown => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in the reply');
  return JSON.parse(text.slice(start, end + 1));
};

export const chipId = (type: ChipType, kind: GenerateKind, title: string): string =>
  createHash('sha256')
    .update(JSON.stringify([type, kind, title.trim().toLowerCase().replace(/\s+/g, ' ')]))
    .digest('hex')
    .slice(0, 16);

/**
 * Chips the GM can use: a chip must point at a real line (its quote is that
 * line, never the model's wording); dismissed and duplicate chips are
 * dropped; at most MAX_CHIPS.
 */
export function parseChips(
  text: string,
  lines: readonly TranscriptLine[],
  dismissed: ReadonlySet<string>,
): SuggestionChip[] {
  const parsed = replySchema.parse(jsonIn(text));
  const out: SuggestionChip[] = [];
  const seen = new Set<string>();
  for (const c of parsed.chips) {
    const line = lines[c.line - 1];
    if (!line) continue;
    const title = c.title.trim();
    const id = chipId(c.type, c.kind, title);
    if (dismissed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      type: c.type,
      kind: c.kind,
      title,
      request: c.request.trim(),
      quote: line.text,
    });
    if (out.length === MAX_CHIPS) break;
  }
  return out;
}

/** Asks the fast model for chips from the recent lines. */
export async function suggest(
  client: AiClient,
  lines: readonly TranscriptLine[],
  context: SuggestionContext,
  dismissed: ReadonlySet<string>,
): Promise<SuggestionChip[]> {
  if (lines.length === 0) return [];
  const reply = await client.complete({
    role: 'fast',
    system: SUGGEST_SYSTEM,
    messages: [{ role: 'user', content: suggestPrompt(lines, context) }],
    maxTokens: 800,
  });
  return parseChips(reply.text, lines, dismissed);
}

/**
 * Rate limit (D244): a call is due only when there are new lines since the
 * last call and the interval has passed; a manual "Suggest now" still waits
 * at least the minimum interval, so clicks cannot run up the bill.
 */
export function suggestDue(args: {
  readonly now: number;
  readonly lastCallAt: number | null;
  readonly intervalS: number;
  readonly newLines: number;
  readonly manual: boolean;
  /** MD.2: the new lines include a player question or attempt. */
  readonly question?: boolean;
}): boolean {
  if (args.newLines === 0) return false;
  if (args.lastCallAt === null) return true;
  let waitS = args.manual
    ? SUGGEST_INTERVAL_MIN_S
    : Math.min(SUGGEST_INTERVAL_MAX_S, Math.max(SUGGEST_INTERVAL_MIN_S, args.intervalS));
  if (args.question === true) waitS = Math.min(waitS, SUGGEST_QUESTION_WAIT_S);
  return args.now - args.lastCallAt >= waitS * 1000;
}

/** MD.2: the row of five (chip or empty) and the chips waiting below it. */
export interface PickRow {
  readonly slots: (SuggestionChip | null)[];
  readonly more: SuggestionChip[];
}

/**
 * MD.2 (DESIGN §11 "Slots 6–10"): stable slots. A chip that is still live
 * keeps its slot; an empty or dismissed slot takes the first waiting chip
 * (the list is newest first); nothing else moves. Waiting chips beyond
 * MORE_MAX are dropped; a slotted chip never is.
 */
export function arrangePicks(
  slotIds: readonly (string | null)[] | undefined,
  chips: readonly SuggestionChip[],
): PickRow {
  const byId = new Map(chips.map((c) => [c.id, c]));
  const used = new Set<string>();
  const slots: (SuggestionChip | null)[] = [];
  for (let i = 0; i < PICK_SLOTS; i++) {
    const id = slotIds?.[i] ?? null;
    const chip = id === null ? undefined : byId.get(id);
    if (chip && !used.has(chip.id)) {
      used.add(chip.id);
      slots.push(chip);
    } else {
      slots.push(null);
    }
  }
  const waiting = chips.filter(
    (c, i) => !used.has(c.id) && chips.findIndex((d) => d.id === c.id) === i,
  );
  for (let i = 0; i < PICK_SLOTS; i++) {
    if (slots[i] === null && waiting.length > 0) slots[i] = waiting.shift() as SuggestionChip;
  }
  return { slots, more: waiting.slice(0, MORE_MAX) };
}

/** The live chips of a row, slots first (in slot order), then the waiting ones. */
export const rowChips = (row: PickRow): SuggestionChip[] => [
  ...row.slots.filter((c): c is SuggestionChip => c !== null),
  ...row.more,
];
