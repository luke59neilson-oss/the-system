// MC.10 (DESIGN §11 "Prepare ahead"): optional and off by default. When the
// table heads somewhere, the fast model names the destination from the
// recent talk, and the strong model drafts likely content for it in the
// background, in the content format, ready for the GM to review in the
// existing import preview. A prepared draft never changes the campaign and
// never reaches players: it is a GM-only file until the GM approves it in
// Import content. Pure helpers here (prompt, parse, pacing); calls go
// through the co-DM client, so the spend counter counts both (D249).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GENERATE_KINDS, type GenerateKind } from './generate';
import type { TranscriptLine } from '../speech/transcript';

/** Where the table is heading, from one transcript line. */
export interface Heading {
  /** Stable id from kind and normalised place, so one destination is drafted once (D249). */
  readonly id: string;
  readonly kind: GenerateKind;
  /** Short name of the destination ("Herbalist", "Rake Canyons"). */
  readonly place: string;
  /** The request the strong model gets, as an MC.2 generate prompt. */
  readonly request: string;
  /** The transcript line that showed it, verbatim. */
  readonly quote: string;
}

/** A prepared draft: the heading plus the content file the strong model wrote. */
export interface PreparedDraft extends Heading {
  readonly file: unknown;
  /** When it was prepared (ms since epoch). */
  readonly at: number;
  /** Sent to Import by Review; no longer holds the MAX_PREPARED queue. */
  readonly taken?: boolean;
}

/** Pacing (D249): default 5 minutes between looks, never under 2. */
export const PREPARE_INTERVAL_DEFAULT_S = 300;
export const PREPARE_INTERVAL_MIN_S = 120;
export const PREPARE_INTERVAL_MAX_S = 1800;
/** No new draft while this many are waiting for the GM. */
export const MAX_PREPARED = 3;

export const PREPARE_SYSTEM = [
  'You are the co-DM for a LitRPG tabletop game. You read the latest table talk and decide whether the party has decided to head somewhere specific next (a shop, a person, a place, a fight, a lead).',
  'Only say so when the talk shows they are going there, not when it is only mentioned.',
  'Reply with JSON only:',
  '{"heading":{"line":<line number that shows it>,"kind":"shop"|"npc"|"place"|"encounter"|"item"|"questHook","place":"<2-5 words>","request":"<one sentence for the content generator>"}}',
  'or {"heading":null} when they are not heading anywhere new.',
].join('\n');

export function preparePrompt(
  lines: readonly TranscriptLine[],
  context: { readonly party: readonly string[]; readonly known: readonly string[] },
): string {
  return [
    'Prepare ahead.',
    `Party: ${context.party.join(', ') || '(none)'}`,
    `Known: ${context.known.join(', ') || '(nothing yet)'}`,
    'Transcript:',
    ...lines.map(
      (l, i) => `${i + 1}. ${l.speaker ? `[${l.speaker}] ` : ''}${l.text.replace(/\s+/g, ' ')}`,
    ),
  ].join('\n');
}

const replySchema = z.object({
  heading: z
    .object({
      line: z.number().int(),
      kind: z.enum(GENERATE_KINDS),
      place: z.string().trim().min(1).max(80),
      request: z.string().trim().min(1).max(500),
    })
    .nullable(),
});

export const headingId = (kind: GenerateKind, place: string): string =>
  createHash('sha256')
    .update(JSON.stringify([kind, place.trim().toLowerCase().replace(/\s+/g, ' ')]))
    .digest('hex')
    .slice(0, 16);

/**
 * The destination the reply names, or null: it must point at a real line
 * (the quote is that line, never the model's words), and a destination
 * already prepared or dismissed is not drafted again.
 */
export function parseHeading(
  text: string,
  lines: readonly TranscriptLine[],
  seen: ReadonlySet<string>,
): Heading | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in the reply');
  const parsed = replySchema.parse(JSON.parse(text.slice(start, end + 1)));
  const h = parsed.heading;
  if (!h) return null;
  const line = lines[h.line - 1];
  if (!line) return null;
  const id = headingId(h.kind, h.place);
  if (seen.has(id)) return null;
  return { id, kind: h.kind, place: h.place, request: h.request, quote: line.text };
}

/**
 * Rate limit (D249): a look is due only when prepare-ahead is on, fewer than
 * MAX_PREPARED drafts are waiting, there is new talk, and the interval has
 * passed since the last look (a manual look still waits the minimum).
 */
export function prepareDue(args: {
  readonly enabled: boolean;
  readonly waiting: number;
  readonly now: number;
  readonly lastCallAt: number | null;
  readonly intervalS: number;
  readonly newLines: number;
  readonly manual: boolean;
}): boolean {
  if (!args.enabled || args.waiting >= MAX_PREPARED || args.newLines === 0) return false;
  if (args.lastCallAt === null) return true;
  const waitS = args.manual
    ? PREPARE_INTERVAL_MIN_S
    : Math.min(PREPARE_INTERVAL_MAX_S, Math.max(PREPARE_INTERVAL_MIN_S, args.intervalS));
  return args.now - args.lastCallAt >= waitS * 1000;
}
