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
