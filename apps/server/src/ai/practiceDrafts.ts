// MC.7 (DESIGN §11 "Practice drafts"): the fast model reads the transcript
// and drafts practice entries for the GM's end-of-session review. Nothing
// here changes the campaign: a draft is GM-only data in the campaign folder
// until the GM confirms it, which logs an ordinary `practice.log`. Pure
// helpers (prompt, parse, attribution) plus a small file store.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AiError, requireWhole, type AiClient } from './client';
import type { TranscriptLine } from '../speech/transcript';

export interface DraftCharacter {
  readonly id: string;
  readonly name: string;
  /** Names of the character's skills (official names). */
  readonly skills: readonly string[];
}

export type DraftConfidence = 'high' | 'medium' | 'low';

/**
 * Who the draft is about, by trust (DESIGN §11): something done in the app
 * beats the GM naming the character, which beats the voice match; `model`
 * is the model's own guess when none of those says, and is always low.
 */
export type Attribution = 'gm-named' | 'voice' | 'model';

export interface PracticeDraft {
  readonly id: string;
  readonly characterId: string;
  readonly skill: string;
  /** What happened, in a line. */
  readonly action: string;
  /** The transcript line behind it. */
  readonly quote: string;
  /** When the line was heard (ISO). */
  readonly at: string;
  readonly confidence: DraftConfidence;
  readonly attributedBy: Attribution;
  /**
   * The play session the line was heard in (MC.7 review M4), so confirming
   * it later still credits that session; null = no session was running.
   */
  readonly sessionId: string | null;
}

/**
 * An entry already logged in the app this session (contest rolls etc.).
 * One naming skills covers those skills for the session; one naming no
 * skill (a contest rolls a stat) covers that character's moment instead:
 * talk heard within `APP_ACTION_WINDOW_MS` of it is the same action, which
 * the app already logged (D245).
 */
export interface LoggedUse {
  readonly characterId: string;
  readonly skills: readonly string[];
  readonly at: string;
}

/** How near (either side) a line must be to a stat-only app action to count as that action (D245). */
export const APP_ACTION_WINDOW_MS = 2 * 60_000;

/** True when an app action with no skill covers this character's line (D245). */
export function coveredByAppAction(
  characterId: string,
  at: string,
  logged: readonly LoggedUse[],
): boolean {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return false;
  return logged.some(
    (u) =>
      u.characterId === characterId &&
      u.skills.length === 0 &&
      Math.abs(Date.parse(u.at) - t) <= APP_ACTION_WINDOW_MS,
  );
}

const RANK: Record<DraftConfidence, number> = { low: 0, medium: 1, high: 2 };
const lower = (a: DraftConfidence, b: DraftConfidence): DraftConfidence =>
  RANK[a] <= RANK[b] ? a : b;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Characters whose name the line says as a whole word. Unicode letter and
 * number boundaries, as `sceneNpc` uses, so "Zoë" matches (`\b` is ASCII-only; QF.34).
 */
export function namedIn(text: string, characters: readonly DraftCharacter[]): DraftCharacter[] {
  return characters.filter(
    (c) =>
      c.name.trim() !== '' &&
      new RegExp(`(?<![\\p{L}\\p{N}])${escape(c.name.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text),
  );
}

/**
 * Who a line is about: the one character the line names (the GM naming
 * them), else the voice label, else the model's pick (low confidence).
 * null when nothing points at a known character.
 */
export function attribute(
  line: Pick<TranscriptLine, 'text' | 'speakerId'>,
  characters: readonly DraftCharacter[],
  modelPick: string | null,
): { characterId: string; by: Attribution } | null {
  const named = namedIn(line.text, characters);
  if (named.length === 1) return { characterId: named[0]!.id, by: 'gm-named' };
  if (named.length === 0 && line.speakerId && characters.some((c) => c.id === line.speakerId)) {
    return { characterId: line.speakerId, by: 'voice' };
  }
  const pick = characters.find((c) => c.id === modelPick || c.name === modelPick);
  // Several names on one line: only one of them may be the model's pick.
  if (pick && (named.length === 0 || named.includes(pick))) {
    return { characterId: pick.id, by: named.length > 1 ? 'gm-named' : 'model' };
  }
  return null;
}

export const DRAFT_SYSTEM = [
  'You help the GM of a LitRPG tabletop game keep the practice log.',
  'You read numbered transcript lines from the table and list each time a character USED one of their skills in a way that mattered.',
  'Talking about a skill, planning, or asking about it is not a use. GM narration that describes a character doing something is a use.',
  'Use only the characters and skill names given. Reply with JSON only:',
  '{"drafts":[{"line":<line number>,"character":"<name>","skill":"<skill name>","action":"<what happened, one short line>","confidence":"high"|"medium"|"low"}]}',
  'Reply {"drafts":[]} when nothing counts.',
].join('\n');

/** The user message: party with skills, then the numbered lines. */
export function draftPrompt(
  lines: readonly TranscriptLine[],
  characters: readonly DraftCharacter[],
): string {
  const party = characters.map((c) => `- ${c.name}: ${c.skills.join(', ') || '(no skills)'}`);
  const heard = lines.map(
    (l, i) => `${i + 1}. ${l.speaker ? `[${l.speaker}] ` : ''}${l.text.replace(/\s+/g, ' ')}`,
  );
  return ['Practice drafts.', 'Party and skills:', ...party, 'Transcript:', ...heard].join('\n');
}

const draftSchema = z.object({
  line: z.number().int(),
  character: z.string().max(200),
  skill: z.string().max(200),
  action: z.string().max(500),
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
});
// Each item is checked on its own, so one malformed draft does not lose the rest (MC.7 review M6).
const replySchema = z.object({ drafts: z.array(z.unknown()) });

/** The first JSON object in a reply (models sometimes wrap it in a code fence). */
const jsonIn = (text: string): unknown => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in the reply');
  return JSON.parse(text.slice(start, end + 1));
};

/**
 * Turns the model's reply into drafts the GM can trust as a starting point:
 * unknown lines, characters and skills are dropped; the character comes
 * from the attribution order, not the model; a use the app already logged
 * for that character and skill this session is not drafted again; one draft
 * per character and skill (marks stay one per skill per session).
 */
export function parseDrafts(
  text: string,
  lines: readonly TranscriptLine[],
  characters: readonly DraftCharacter[],
  logged: readonly LoggedUse[],
  newId: () => string,
  sessionId: string | null = null,
): PracticeDraft[] {
  const parsed = replySchema.parse(jsonIn(text));
  const out: PracticeDraft[] = [];
  const seen = new Set<string>(
    logged.flatMap((u) => u.skills.map((s) => JSON.stringify([u.characterId, s]))),
  );
  for (const item of parsed.drafts) {
    const checked = draftSchema.safeParse(item);
    if (!checked.success) continue;
    const d = checked.data;
    const line = lines[d.line - 1];
    if (!line) continue;
    const who = attribute(line, characters, d.character);
    if (!who) continue;
    const character = characters.find((c) => c.id === who.characterId)!;
    const skill = character.skills.find((s) => s.toLowerCase() === d.skill.trim().toLowerCase());
    if (!skill) continue;
    const key = JSON.stringify([character.id, skill]);
    if (seen.has(key)) continue;
    // App action first (DESIGN §11): a contest rolled in the app is this moment (D245).
    if (coveredByAppAction(character.id, line.at, logged)) continue;
    seen.add(key);
    const action = d.action.trim() || line.text;
    out.push({
      id: newId(),
      characterId: character.id,
      skill,
      action,
      quote: line.text,
      at: line.at,
      confidence:
        who.by === 'model'
          ? 'low'
          : who.by === 'voice'
            ? lower(d.confidence, 'medium')
            : d.confidence,
      attributedBy: who.by,
      sessionId,
    });
  }
  return out;
}

/** Asks the fast model for drafts from these lines. */
export async function draftPractice(
  client: AiClient,
  lines: readonly TranscriptLine[],
  characters: readonly DraftCharacter[],
  logged: readonly LoggedUse[],
  newId: () => string,
  sessionId: string | null = null,
): Promise<PracticeDraft[]> {
  if (lines.length === 0 || characters.length === 0) return [];
  const reply = await client.complete({
    role: 'fast',
    system: DRAFT_SYSTEM,
    messages: [{ role: 'user', content: draftPrompt(lines, characters) }],
    maxTokens: 2000,
  });
  requireWhole(reply);
  try {
    return parseDrafts(reply.text, lines, characters, logged, newId, sessionId);
  } catch {
    // QF.49: a reply without a drafts list is the model's fault, not the disk's.
    throw new AiError('The co-DM reply had no drafts list; try again', 'bad-reply');
  }
}

interface DraftFile {
  readonly version: 1;
  /** Transcript lines already read, per session number (so a re-run drafts only new talk). */
  readonly readUpTo: Record<string, number>;
  readonly drafts: PracticeDraft[];
}

/** GM-only drafts for one campaign, in `<dir>/practice-drafts.json`. */
export class DraftStore {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'practice-drafts.json');
  }

  private read(): DraftFile {
    if (!existsSync(this.file)) return { version: 1, readUpTo: {}, drafts: [] };
    // A damaged file throws, so it is never overwritten (as D241 for voices).
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<DraftFile> | null;
    if (!data || !Array.isArray(data.drafts) || typeof data.readUpTo !== 'object') {
      throw new Error('The practice drafts file is damaged; move it aside to start over');
    }
    return { version: 1, readUpTo: data.readUpTo ?? {}, drafts: data.drafts };
  }

  list(): PracticeDraft[] {
    // Drafts saved before MC.7 review M4 carry no session: null (none known).
    return this.read().drafts.map((d) => ({ ...d, sessionId: d.sessionId ?? null }));
  }

  readUpTo(session: number): number {
    return this.read().readUpTo[String(session)] ?? 0;
  }

  add(session: number, readUpTo: number, drafts: readonly PracticeDraft[]): void {
    const f = this.read();
    this.write({
      version: 1,
      readUpTo: { ...f.readUpTo, [String(session)]: readUpTo },
      drafts: [...f.drafts, ...drafts],
    });
  }

  /** Removes a draft (confirmed or dismissed); false when there was none. */
  remove(id: string): boolean {
    const f = this.read();
    const rest = f.drafts.filter((d) => d.id !== id);
    if (rest.length === f.drafts.length) return false;
    this.write({ ...f, drafts: rest });
    return true;
  }

  private write(body: DraftFile): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
    renameSync(tmp, this.file);
  }
}
