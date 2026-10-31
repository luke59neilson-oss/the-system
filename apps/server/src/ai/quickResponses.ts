// MD.1 (DESIGN §11 "Quick responses"; L22): five fixed buttons, keys 1–5,
// that answer the newest player question or attempt with one line the GM can
// say as-is plus 2–3 short beats. Pure helpers here: the default slots and
// their settings, finding the target line and the NPC in the scene, the
// prompt, and parsing the reply. Calls go through the co-DM client, so the
// spend counter sees them; answers are GM-only and never reach players.
import { z } from 'zod';
import type { TranscriptLine } from '../speech/transcript';
import { referencePromptBlock } from '../reference/reference';
import { SHARED_SYSTEM_LINES } from './setting';

export const QUICK_SLOT_IDS = ['yes-and', 'yes-but', 'no-but', 'in-character', 'twist'] as const;
export type QuickSlotId = (typeof QUICK_SLOT_IDS)[number];

export interface QuickSlot {
  readonly id: QuickSlotId;
  /** The button's name (the GM can rename it). */
  readonly label: string;
  /** The instruction behind the button (the GM can rewrite it). */
  readonly instruction: string;
}

/** DESIGN §11 defaults, in their fixed order (keys 1–5). */
export const DEFAULT_QUICK_SLOTS: readonly QuickSlot[] = [
  {
    id: 'yes-and',
    label: 'Yes, and…',
    instruction:
      'It works, and something extra comes of it: an opening, a find or a bonus the table did not ask for.',
  },
  {
    id: 'yes-but',
    label: 'Yes, but…',
    instruction: 'It works, at a cost: a price, a complication or something lost along the way.',
  },
  {
    id: 'no-but',
    label: 'No, but…',
    instruction:
      'It does not work, but give the players another way forward or something they learn from failing.',
  },
  {
    id: 'in-character',
    label: 'In character',
    instruction:
      'Answer in the voice of the NPC being spoken to, a few lines, with a legend, rumour or hook where it fits.',
  },
  {
    id: 'twist',
    label: 'Twist',
    instruction: 'Something unexpected happens right now that changes the scene.',
  },
];

export const quickSlotsSchema = z
  .array(
    z.strictObject({
      id: z.enum(QUICK_SLOT_IDS),
      label: z.string().trim().min(1).max(40),
      instruction: z.string().trim().min(1).max(600),
    }),
  )
  .length(5)
  .refine((slots) => new Set(slots.map((s) => s.id)).size === 5, 'Each of the five slots once');

/** How many of the newest transcript lines the model reads. */
export const QUICK_RECENT_LINES = 12;
/** Bounds on the campaign context (characters) so a prompt stays small and cheap. */
export const QUICK_NPC_NOTES_MAX = 400;
export const QUICK_LORE_MAX = 1200;

/**
 * A player question or attempt: a question, or a line that says what someone
 * does or tries ("I try…", "can we…", "Jake climbs…" is too loose, so the
 * verbs are the common table ones). Lines are only text; the GM has no
 * speaker label, so a labelled line counts as a player's.
 */
const ATTEMPT =
  /\b(?:i|we)(?:'ll| will| want to| wanna| try to| try| attempt to| attempt| go to| go| am going to|'m going to)\b|\b(?:can|could|may|should) (?:i|we)\b|\b(?:i|we) (?:attack|ask|cast|climb|grab|jump|look|open|run|search|sneak|use|shoot|swing|pick|push|pull|check|listen|hide|follow|throw|talk|tell|offer|draw|nock)\b/iu;

export function isQuestionOrAttempt(line: Pick<TranscriptLine, 'text' | 'speaker'>): boolean {
  const text = line.text.trim();
  if (text === '') return false;
  return text.endsWith('?') || ATTEMPT.test(text);
}

/** The newest player question or attempt; the newest line when none looks like one. */
export function findTarget(lines: readonly TranscriptLine[]): TranscriptLine | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i] as TranscriptLine;
    if (isQuestionOrAttempt(l)) return l;
  }
  return lines.at(-1) ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The NPC in the scene (D256): the last one the GM named in the recent
 * transcript, by name or by the label players know it by. Transcript lines
 * do not say who is voicing whom, so naming is what the laptop can see; the
 * GM changes it from the picker.
 */
export function sceneNpc(
  lines: readonly TranscriptLine[],
  npcs: readonly { readonly id: string; readonly names: readonly string[] }[],
): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = (lines[i] as TranscriptLine).text;
    let best: { id: string; at: number } | null = null;
    for (const npc of npcs) {
      for (const name of npc.names) {
        if (name.trim().length < 2) continue;
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name.trim())}(?![\\p{L}\\p{N}])`, 'giu');
        for (const m of text.matchAll(re)) {
          if (best === null || m.index > best.at) best = { id: npc.id, at: m.index };
        }
      }
    }
    if (best) return best.id;
  }
  return null;
}

export interface QuickContext {
  readonly party: readonly string[];
  readonly region: string | null;
  readonly npc: { readonly name: string; readonly notes: string } | null;
  /** Kept lore for the NPC and place (MD.3), newest first; empty until then. */
  readonly lore: readonly string[];
}

export const QUICK_SYSTEM = [
  ...SHARED_SYSTEM_LINES,
  'You are the co-DM for a LitRPG tabletop game in the style of The Primal Hunter. The GM pressed a quick-response button at the table and will read your answer aloud.',
  'Answer in exactly this shape and nothing else:',
  'SAY: <one line the GM can say as-is, under 35 words>',
  '- <a short beat to riff on: a hook, a detail or a name>',
  '- <another beat>',
  '- <an optional third beat>',
  'Never contradict the kept lore. Never decide numbers, rolls or rewards: the app does those.',
].join('\n');

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** QF.50: no one kept-lore note takes more than this share of the budget. */
export const QUICK_LORE_NOTE_MAX = 400;
/** QF.50: a clipped note shorter than this says too little to be worth sending. */
const LORE_MIN_CLIP = 60;

/**
 * MD.3: kept lore as prompt lines, newest first, bounded by QUICK_LORE_MAX
 * characters. QF.50: a long note is clipped (to QUICK_LORE_NOTE_MAX, or to
 * what is left of the budget), never dropped whole, so the newest lore for
 * the NPC always reaches the prompt; a note that would be clipped below
 * LORE_MIN_CLIP is skipped and shorter, older notes still get their turn.
 */
export function loreLines(notes: readonly string[]): string[] {
  const lore: string[] = [];
  let used = 0;
  for (const note of notes) {
    const line = clip(oneLine(note), QUICK_LORE_NOTE_MAX);
    const left = QUICK_LORE_MAX - used;
    if (line.length <= left) {
      lore.push(`- ${line}`);
      used += line.length;
    } else if (left >= LORE_MIN_CLIP) {
      lore.push(`- ${clip(line, left)}`);
      used = QUICK_LORE_MAX;
    }
  }
  return lore;
}

export function quickPrompt(args: {
  readonly slot: QuickSlot;
  readonly target: string;
  readonly recent: readonly TranscriptLine[];
  readonly context: QuickContext;
}): string {
  const { slot, target, recent, context } = args;
  const lore = loreLines(context.lore);
  return [
    'Quick response.',
    `Button: ${oneLine(slot.label)}`,
    `Instruction: ${oneLine(slot.instruction)}`,
    `Answer this line: "${oneLine(target)}"`,
    `Party: ${context.party.join(', ') || '(none)'}`,
    `Region: ${context.region ?? '(unknown)'}`,
    context.npc
      ? `NPC in the scene: ${context.npc.name}${context.npc.notes ? ` (${clip(oneLine(context.npc.notes), QUICK_NPC_NOTES_MAX)})` : ''}`
      : 'NPC in the scene: (none)',
    ...(lore.length ? ['Kept lore (do not contradict):', ...lore] : []),
    // MU.6: a few book names as naming and tone examples (never god-tied).
    ...[
      referencePromptBlock(
        'quick',
        [target, context.region ?? '', context.npc?.name ?? ''].join(' '),
      ),
    ].filter((b) => b !== ''),
    'Recent table talk:',
    ...(recent.length
      ? recent.map((l) => `${l.speaker ? `[${l.speaker}] ` : ''}${oneLine(l.text)}`)
      : ['(none)']),
  ].join('\n');
}

export interface QuickAnswer {
  readonly say: string;
  readonly beats: readonly string[];
}

/** One sayable line plus at most three beats; tolerant of a model that drifts from the shape. */
export function parseQuick(text: string): QuickAnswer {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  let say = '';
  const beats: string[] = [];
  for (const l of lines) {
    const m = /^(?:\*\*)?say:(?:\*\*)?\s*(.*)$/iu.exec(l);
    if (m && say === '') {
      say = (m[1] ?? '').trim();
      continue;
    }
    const b = /^(?:[-•*]|\d+[.)])\s+(.*)$/u.exec(l);
    if (b) {
      if (beats.length < 3 && (b[1] ?? '').trim() !== '') beats.push((b[1] ?? '').trim());
      continue;
    }
    if (say === '') say = l;
  }
  return { say: say.replace(/^"(.*)"$/u, '$1'), beats };
}

/** MD.3: the tag every kept-lore note carries (a GM note; D260 when done). */
export const LORE_TAG = 'lore';

/**
 * MD.3 (DESIGN §11 "Keep"): the kept lore for the NPC and place in the scene,
 * newest first: GM notes tagged `lore` and `npc:<name>` or `place:<name>`
 * (case-insensitive). Bounding happens in the prompt (QUICK_LORE_MAX).
 */
export function loreFor(
  notes: readonly {
    readonly kind: string;
    readonly tags: readonly string[];
    readonly body: string;
    readonly updatedAt: string;
  }[],
  scene: { readonly npc: string | null; readonly place: string | null },
): string[] {
  const want = new Set(
    [scene.npc && `npc:${scene.npc}`, scene.place && `place:${scene.place}`]
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toLowerCase()),
  );
  if (want.size === 0) return [];
  return notes
    .filter((n) => n.kind === 'gm')
    .filter((n) => n.tags.some((t) => t.toLowerCase() === LORE_TAG))
    .filter((n) => n.tags.some((t) => want.has(t.toLowerCase())))
    .filter((n) => n.body.trim() !== '')
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((n) => n.body.trim());
}

/**
 * MD.3: kept lore for a generation request: the current place's lore, plus
 * the lore of every NPC whose name the GM's request mentions
 * (case-insensitive), newest first, each note once.
 */
function wholeWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

export function loreForRequest(
  notes: Parameters<typeof loreFor>[0],
  place: string | null,
  request: string,
): string[] {
  const asked = request.toLowerCase();
  const wanted = (tag: string): boolean => {
    const t = tag.toLowerCase();
    if (place && t === `place:${place.toLowerCase()}`) return true;
    const name = /^npc:(.+)$/u.exec(t)?.[1]?.trim();
    // Review M2: a whole-word match, Unicode-aware, so "Al" is not "also".
    return !!name && wholeWord(asked, name);
  };
  const bodies = notes
    .filter((n) => n.kind === 'gm')
    .filter((n) => n.tags.some((t) => t.toLowerCase() === LORE_TAG))
    .filter((n) => n.tags.some(wanted))
    .filter((n) => n.body.trim() !== '')
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((n) => n.body.trim());
  return [...new Set(bodies)];
}

/** MD.3: the tags a kept answer gets: lore, the NPC, the place and the session. */
export function loreTags(scene: {
  readonly npc: string | null;
  readonly place: string | null;
  readonly session: number | null;
}): string[] {
  return [
    LORE_TAG,
    ...(scene.npc ? [`npc:${scene.npc}`] : []),
    ...(scene.place ? [`place:${scene.place}`] : []),
    ...(scene.session !== null ? [`session:${scene.session}`] : []),
  ];
}
