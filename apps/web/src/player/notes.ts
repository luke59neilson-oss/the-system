import { searchNotes, type PlayerNote } from '@the-system/engine';

/**
 * Notes window helpers (ROADMAP M3.10, DESIGN §7 Notes): filtering, tags,
 * labels and a small, safe Markdown subset. Pure, so they are unit tested.
 */

export type NoteFilter = 'all' | 'journal' | 'party';

export const NOTE_FILTERS: readonly { id: NoteFilter; label: string }[] = [
  { id: 'all', label: 'All notes' },
  { id: 'journal', label: 'My journal' },
  { id: 'party', label: 'Party notes' },
];

/**
 * The notes to list: kind filter, words (title, text, tags) and one tag;
 * newest change first, ties (same second) newest-created first. `notes` is
 * in creation order, as the projection sends it.
 */
export function visibleNotes(
  notes: readonly PlayerNote[],
  filter: NoteFilter,
  query: string,
  tag: string | null,
): PlayerNote[] {
  const created = new Map(notes.map((n, i) => [n.id, i]));
  return searchNotes(notes, {
    text: query,
    tags: tag === null ? [] : [tag],
    ...(filter === 'all' ? {} : { kinds: [filter] }),
  }).sort(
    (a, b) =>
      (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) ||
      (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0),
  );
}

/** Most tags a note may carry (the event limit) and the longest tag a player types (UI limit). */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 60;

/** "npc:Casper, region:forest" → trimmed tags, duplicates (any case) dropped. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Why the tags cannot be saved, or null. */
export function tagProblem(tags: readonly string[]): string | null {
  if (tags.length > MAX_TAGS) return `At most ${MAX_TAGS} tags`;
  const long = tags.find((t) => t.length > MAX_TAG_LENGTH);
  return long ? `Tags are at most ${MAX_TAG_LENGTH} characters` : null;
}

/** Can this player edit, share or delete the note? Only their own (DESIGN §7, D62). */
export const isOwnNote = (note: PlayerNote, viewerId: string): boolean => note.author === viewerId;

/** "Journal · private", "Journal · shared with the GM", "Party · by Miranda". */
export function noteLabel(
  note: PlayerNote,
  viewerId: string,
  names: Readonly<Record<string, string>>,
): string {
  if (note.kind === 'journal') {
    return note.shareable ? 'Journal · shared with the GM' : 'Journal · private';
  }
  const by =
    note.author === null
      ? 'the GM'
      : note.author === viewerId
        ? 'you'
        : (names[note.author] ?? 'a former party member');
  return `Party · by ${by}`;
}

/** A note's heading: its title, else the start of its text. */
export function noteTitle(note: Pick<PlayerNote, 'title' | 'body'>): string {
  if (note.title.trim() !== '') return note.title;
  const first = note.body.trim().split('\n')[0] ?? '';
  const plain = first.replace(/^#+\s*|^[-*]\s+|^>\s*/, '').replace(/[*_`]/g, '');
  return plain.length > 60 ? `${plain.slice(0, 59)}…` : plain || 'Untitled';
}

/** "14:05" today, else "Oct 21" (browser's locale and time zone). */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// --- Markdown subset -------------------------------------------------------

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; lines: Inline[][] };

/**
 * Parses the Markdown players are likely to type: `#` headings, `-`/`*`/`1.`
 * lists, `>` quotes, paragraphs (single newlines kept as line breaks),
 * `**bold**`, `*italic*`/`_italic_` and `` `code` ``. Everything else is
 * plain text: no HTML and no links are ever produced, so a note cannot
 * inject markup into another player's screen.
 */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1]?.length ?? 1) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2] ?? '') });
      i++;
      continue;
    }
    const listKind = listItem(line);
    if (listKind) {
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = listItem(lines[i] ?? '');
        if (!item || item.ordered !== listKind.ordered) break;
        items.push(parseInline(item.text));
        i++;
      }
      blocks.push({ kind: 'list', ordered: listKind.ordered, items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: Inline[][] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quoted.push(parseInline((lines[i] ?? '').replace(/^>\s?/, '')));
        i++;
      }
      blocks.push({ kind: 'quote', lines: quoted });
      continue;
    }
    const para: Inline[][] = [];
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '' || /^#{1,6}\s/.test(next) || listItem(next) || /^>/.test(next)) {
        break;
      }
      para.push(parseInline(next));
      i++;
    }
    blocks.push({ kind: 'paragraph', lines: para });
  }
  return blocks;
}

function listItem(line: string): { ordered: boolean; text: string } | null {
  const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
  if (bullet) return { ordered: false, text: bullet[1] ?? '' };
  const numbered = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(line);
  return numbered ? { ordered: true, text: numbered[1] ?? '' } : null;
}

/** Inline emphasis and code; unmatched markers stay as typed. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern =
    /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s][^*]*?)\*|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g;
  let last = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined)
      out.push({ kind: 'strong', text: m[2] ?? m[3] ?? '' });
    else out.push({ kind: 'em', text: m[4] ?? m[5] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
