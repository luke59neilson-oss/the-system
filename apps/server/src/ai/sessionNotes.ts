// MC.9 (DESIGN §11 "Memory"): running notes from the transcript, and at
// session end a summary (what happened, who did what, open threads, NPCs
// met) for the session log and its export. GM-only data in the campaign
// folder; nothing here changes the campaign. Pure helpers (prompt, parse,
// render) plus a small per-session file store.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AiError, requireWhole, type AiClient } from './client';
import type { TranscriptLine } from '../speech/transcript';
import { SHARED_SYSTEM_LINES } from './setting';

export interface SessionSummary {
  readonly whatHappened: string;
  readonly whoDidWhat: readonly { readonly character: string; readonly did: string }[];
  readonly openThreads: readonly string[];
  readonly npcsMet: readonly string[];
}

export interface SessionNotesFile {
  /** Transcript lines already turned into notes. */
  readonly readUpTo: number;
  readonly notes: readonly string[];
  readonly summary: SessionSummary | null;
}

const EMPTY: SessionNotesFile = { readUpTo: 0, notes: [], summary: null };

/** The first JSON object in a reply (models sometimes wrap it in a code fence). */
const jsonIn = (text: string): unknown => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiError('The co-DM reply held no JSON', 'bad-reply');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError('The co-DM reply was not valid JSON', 'bad-reply');
  }
};

const heard = (lines: readonly TranscriptLine[]) =>
  lines.map((l, i) => `${i + 1}. ${l.speaker ? `${l.speaker}: ` : ''}${l.text}`);

export function notesPrompt(lines: readonly TranscriptLine[]): string {
  return [
    'Session notes.',
    'Write short running notes (one line each) of what happened in this stretch of play.',
    'Reply as JSON: {"notes": ["..."]}.',
    'Transcript:',
    ...heard(lines),
  ].join('\n');
}

/** One line of text: newlines and runs of spaces collapse, so model text cannot shape the markdown. */
const oneLine = (max: number) =>
  z
    .string()
    .transform((x) => x.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(max));
const line = oneLine(400);
const notesSchema = z.object({ notes: z.array(z.unknown()) });

/** Notes from a reply; non-string or empty items are dropped, not fatal. */
export function parseNotes(text: string): string[] {
  const parsed = notesSchema.safeParse(jsonIn(text));
  if (!parsed.success) throw new AiError('The co-DM reply had no notes list', 'bad-reply');
  return parsed.data.notes.flatMap((n) => {
    const ok = line.safeParse(n);
    return ok.success ? [ok.data] : [];
  });
}

export function summaryPrompt(notes: readonly string[], characters: readonly string[]): string {
  return [
    'Session summary.',
    `Party: ${characters.join(', ') || '(none)'}`,
    'From these running notes, write the session summary as JSON:',
    '{"whatHappened": "...", "whoDidWhat": [{"character": "...", "did": "..."}], "openThreads": ["..."], "npcsMet": ["..."]}',
    'Notes:',
    ...notes.map((n) => `- ${n}`),
  ].join('\n');
}

const listOf = (schema: z.ZodTypeAny) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x) => (schema.safeParse(x).success ? [schema.parse(x)] : [])));

const summarySchema = z.object({
  whatHappened: oneLine(4000),
  whoDidWhat: listOf(z.object({ character: line, did: line })),
  openThreads: listOf(line),
  npcsMet: listOf(line),
});

export function parseSummary(text: string): SessionSummary {
  const parsed = summarySchema.safeParse(jsonIn(text));
  if (!parsed.success) throw new AiError('The co-DM summary had no "whatHappened"', 'bad-reply');
  return parsed.data as SessionSummary;
}

/** Notes for the transcript lines not yet read. */
export async function takeNotes(
  client: AiClient,
  lines: readonly TranscriptLine[],
): Promise<string[]> {
  return (await takeNotesReply(client, lines)).notes;
}

export const NOTES_SYSTEM = [
  'You are the co-DM of a LitRPG tabletop game, keeping session notes for the GM.',
  ...SHARED_SYSTEM_LINES,
].join('\n');

export const SUMMARY_SYSTEM = [
  'You are the co-DM of a LitRPG tabletop game, summarising a session for the GM.',
  ...SHARED_SYSTEM_LINES,
].join('\n');

/** Notes, and how many items the reply listed before unusable ones were dropped (QF.49). */
export async function takeNotesReply(
  client: AiClient,
  lines: readonly TranscriptLine[],
): Promise<{ notes: string[]; listed: number }> {
  if (lines.length === 0) return { notes: [], listed: 0 };
  const reply = await client.complete({
    role: 'fast',
    system: NOTES_SYSTEM,
    messages: [{ role: 'user', content: notesPrompt(lines) }],
    maxTokens: 800,
  });
  const text = requireWhole(reply).text;
  const notes = parseNotes(text);
  const listed = notes.length > 0 ? notes.length : notesSchema.parse(jsonIn(text)).notes.length;
  return { notes, listed };
}

export async function summarise(
  client: AiClient,
  notes: readonly string[],
  characters: readonly string[],
): Promise<SessionSummary> {
  const reply = await client.complete({
    role: 'fast',
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: summaryPrompt(notes, characters) }],
    maxTokens: 1500,
  });
  return parseSummary(requireWhole(reply).text);
}

/** Markdown for the session log: running notes, then the summary once written. */
export function renderNotes(file: SessionNotesFile): string {
  if (file.notes.length === 0 && !file.summary) return '';
  const out: string[] = [];
  const s = file.summary;
  if (s) {
    out.push('## Co-DM summary', '', s.whatHappened, '');
    if (s.whoDidWhat.length) {
      out.push(
        '### Who did what',
        '',
        ...s.whoDidWhat.map((w) => `- ${w.character}: ${w.did}`),
        '',
      );
    }
    if (s.openThreads.length)
      out.push('### Open threads', '', ...s.openThreads.map((t) => `- ${t}`), '');
    if (s.npcsMet.length) out.push('### NPCs met', '', ...s.npcsMet.map((n) => `- ${n}`), '');
  }
  if (file.notes.length) out.push('## Co-DM notes', '', ...file.notes.map((n) => `- ${n}`), '');
  return out.join('\n');
}

// The stored file is checked in full on read, so a hand-edited or damaged
// file is refused rather than breaking the session log (D250).
const storedSummary = z.object({
  whatHappened: z.string(),
  whoDidWhat: z.array(z.object({ character: z.string(), did: z.string() })),
  openThreads: z.array(z.string()),
  npcsMet: z.array(z.string()),
});
const fileSchema = z.object({
  readUpTo: z.number().int().min(0),
  notes: z.array(z.string()),
  summary: storedSummary.nullable().default(null),
});

/** `<campaign>/codm/notes-<NN>.json`, one per play session. */
export class NotesStore {
  constructor(private readonly dir: string) {}

  file(session: number): string {
    return path.join(this.dir, `notes-${String(session).padStart(2, '0')}.json`);
  }

  read(session: number): SessionNotesFile {
    const f = this.file(session);
    if (!existsSync(f)) return EMPTY;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      throw new Error(`Damaged session notes file: ${f}`);
    }
    const parsed = fileSchema.safeParse(data);
    if (!parsed.success) throw new Error(`Damaged session notes file: ${f}`);
    return parsed.data;
  }

  write(session: number, value: SessionNotesFile): void {
    mkdirSync(this.dir, { recursive: true });
    const f = this.file(session);
    const tmp = `${f}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(tmp, f);
  }
}
