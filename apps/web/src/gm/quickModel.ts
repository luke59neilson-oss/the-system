// MD.1 (DESIGN §11 "Quick responses"): pure helpers for the quick-response
// row: which key presses which slot, when a key press belongs to a form
// field instead, splitting the streamed NDJSON answer, and folding its
// events into what the panel shows.

export interface QuickSlot {
  readonly id: string;
  readonly label: string;
  readonly instruction: string;
}

/** Keys 1–5 press slots 1–5; keys 6–9 and 0 are the co-DM's row (MD.2). */
export function slotForKey(key: string): number | null {
  if (!/^[0-9]$/u.test(key)) return null;
  return key === '0' ? 10 : Number(key);
}

/** The key that presses a slot (1–10), shown on its button. */
export const keyForSlot = (slot: number): string => (slot === 10 ? '0' : String(slot));

/** A key press inside a text field, a select or with a modifier is not a button press. */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean; type?: string } | null,
  mods: { altKey: boolean; ctrlKey: boolean; metaKey: boolean },
): boolean {
  if (mods.altKey || mods.ctrlKey || mods.metaKey) return true;
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target.type ?? 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'file'].includes(type);
  }
  return false;
}

/** Splits a growing NDJSON buffer into whole lines and the unfinished rest. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.trim() !== ''), rest };
}

export interface QuickAnswerView {
  readonly slotLabel: string;
  readonly quote: string;
  readonly npc: string | null;
  /** The NPC the answer was made for, so Richer asks about the same scene (review L5). */
  readonly npcId: string | null;
  readonly richer: boolean;
  /** The raw text as it streams in. */
  readonly text: string;
  readonly say: string | null;
  readonly beats: readonly string[];
  readonly error: string | null;
  readonly streaming: boolean;
}

export type QuickEvent =
  | {
      type: 'start';
      slot: { id: string; label: string };
      quote: string;
      npc: { id: string; name: string } | null;
      richer: boolean;
    }
  | { type: 'text'; delta: string }
  | { type: 'done'; say: string; beats: string[]; spend?: { calls: number; dollars: number } }
  | { type: 'error'; error: string; spend?: { calls: number; dollars: number } };

export function foldQuick(view: QuickAnswerView | null, event: QuickEvent): QuickAnswerView | null {
  switch (event.type) {
    case 'start':
      return {
        slotLabel: event.slot.label,
        quote: event.quote,
        npc: event.npc?.name ?? null,
        npcId: event.npc?.id ?? null,
        richer: event.richer,
        text: '',
        say: null,
        beats: [],
        error: null,
        streaming: true,
      };
    case 'text':
      return view ? { ...view, text: view.text + event.delta } : view;
    case 'done':
      return view ? { ...view, say: event.say, beats: event.beats, streaming: false } : view;
    case 'error':
      return view ? { ...view, error: event.error, streaming: false } : view;
  }
}

/**
 * While the answer streams, show it as it will read: the SAY line without
 * its tag and the beats as they arrive.
 */
export function streamingPreview(text: string): { say: string; beats: string[] } {
  const lines = text.split('\n').map((l) => l.trim());
  let say = '';
  const beats: string[] = [];
  for (const l of lines) {
    if (l === '') continue;
    const m = /^say:\s*(.*)$/iu.exec(l);
    if (m && say === '') say = m[1] ?? '';
    else if (/^[-•*]\s*/u.test(l)) beats.push(l.replace(/^[-•*]\s*/u, ''));
    else if (say === '' && !/^s(a(y)?)?$/iu.test(l)) say = l;
  }
  return { say, beats: beats.slice(0, 3) };
}

/** Moves a slot up or down in the GM's order (settings). */
export function moveSlot<T>(slots: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= slots.length) return [...slots];
  const out = [...slots];
  [out[index], out[to]] = [out[to] as T, out[index] as T];
  return out;
}

/**
 * MD.1 review M1: a stream that stops without its last event (a failed
 * request, a dropped connection) must not stay "writing…".
 */
export function endQuick(view: QuickAnswerView | null, error: string): QuickAnswerView | null {
  return view?.streaming ? { ...view, error, streaming: false } : view;
}

/** MD.3: the tag every kept-lore note carries (mirrors the server's LORE_TAG). */
export const LORE_TAG = 'lore';

/** MD.3: the tags a kept answer gets: lore, the NPC, the place and the session (D260). */
export function keepTags(scene: {
  readonly npc: string | null;
  readonly place: string | null;
  readonly session: number | null;
}): string[] {
  return [
    LORE_TAG,
    ...(scene.npc ? [`npc:${scene.npc}`] : []),
    ...(scene.place ? [`place:${scene.place}`] : []),
    ...(scene.session ? [`session:${scene.session}`] : []),
  ];
}

/** MD.3: the text Keep starts from: the sayable line, then each beat on its own line. */
export function keepText(answer: {
  readonly say: string | null;
  readonly beats: readonly string[];
}): string {
  return [answer.say ?? '', ...answer.beats.map((b) => `- ${b}`)]
    .filter((l) => l.trim() !== '')
    .join('\n');
}

/** MD.3: a kept note's title: the NPC, else the place, else "Lore". */
export const keepTitle = (scene: {
  readonly npc: string | null;
  readonly place: string | null;
}): string => scene.npc ?? scene.place ?? 'Lore';

/**
 * MD.3: Keep on a generated item starts from its names and descriptions: one
 * line per named entry in any section ("Name: text"), plus the names, so the
 * GM can tag the note to an NPC. Unknown shapes are skipped, never thrown on.
 */
export function generatedLore(file: unknown): { text: string; names: string[] } {
  const lines: string[] = [];
  const names: string[] = [];
  if (file && typeof file === 'object') {
    for (const section of Object.values(file as Record<string, unknown>)) {
      if (!Array.isArray(section)) continue;
      for (const entry of section as unknown[]) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const name = [e.name, e.title].find((v): v is string => typeof v === 'string');
        if (!name) continue;
        const said = [e.description, e.body, e.notes, e.gmNotes].find(
          (v): v is string => typeof v === 'string' && v.trim() !== '',
        );
        names.push(name);
        lines.push(said ? `${name}: ${said.replace(/\s+/g, ' ').trim()}` : name);
      }
    }
  }
  return { text: lines.join('\n'), names };
}

/** MD.3 Lore view: GM notes tagged lore, newest first. */
export function loreNotes<
  N extends {
    readonly id: string;
    readonly kind: string;
    readonly tags: readonly string[];
    readonly updatedAt: string;
  },
>(notes: readonly N[]): N[] {
  return notes
    .filter((n) => n.kind === 'gm' && n.tags.some((t) => t.toLowerCase() === LORE_TAG))
    .slice()
    .sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1,
    );
}

/** MD.3 review M3: the NPC and place a kept note is tagged to (first of each). */
export function loreScope(tags: readonly string[]): { npc: string; place: string } {
  const pick = (prefix: string): string =>
    tags.find((t) => t.toLowerCase().startsWith(prefix))?.slice(prefix.length) ?? '';
  return { npc: pick('npc:'), place: pick('place:') };
}

/**
 * MD.3 review M3: a note's tags after the GM retags it in the Lore view: the
 * NPC and place tags are replaced (blank removes them), every other tag (lore,
 * session, the GM's own) is kept in place, and the lore tag is never lost.
 */
export function retagLore(
  tags: readonly string[],
  scope: { readonly npc: string; readonly place: string },
): string[] {
  const npc = scope.npc.trim();
  const place = scope.place.trim();
  const kept = tags.filter((t) => !/^(npc|place):/iu.test(t));
  const out = kept.some((t) => t.toLowerCase() === LORE_TAG) ? kept : [LORE_TAG, ...kept];
  const at = out.findIndex((t) => t.toLowerCase() === LORE_TAG) + 1;
  out.splice(at, 0, ...(npc ? [`npc:${npc}`] : []), ...(place ? [`place:${place}`] : []));
  return out;
}
