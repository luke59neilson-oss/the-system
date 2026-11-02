// MW.3 (DESIGN §11 "Story ideas"): reading what the phone page exports, or
// pasted text. Pure: the caller previews the result and applies it.

export const IDEA_KINDS = ['hook', 'npc', 'place', 'item', 'quest', 'twist', 'other'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];

export interface ImportedIdea {
  readonly id: string;
  readonly text: string;
  readonly kind: IdeaKind;
  readonly tags: readonly string[];
  readonly source: string;
  readonly created: string | null;
  readonly used: boolean;
}

export type IdeaParse =
  | { readonly ok: true; readonly ideas: readonly ImportedIdea[] }
  | { readonly ok: false; readonly error: string };

/** What one idea and one import may hold (the event payload refuses more). */
export const IDEA_TEXT_MAX = 5_000;
export const IDEA_SOURCE_MAX = 500;
export const IDEA_TAGS_MAX = 20;
export const IDEA_ID_MAX = 100;
export const IDEAS_IMPORT_MAX = 2_000;
const IDEA_CREATED_MAX = 40;

const IDEAS_FORMAT = 'the-system-ideas';
const IDEAS_VERSION = 1;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stable id for pasted text, so pasting the same paragraph again skips it. */
function pastedId(text: string): string {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return `pasted-${(h >>> 0).toString(36)}`;
}

function fromPaste(text: string): IdeaParse {
  const seen = new Set<string>();
  const ideas: ImportedIdea[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/u)) {
    const body = block.trim();
    if (body === '') continue;
    if (body.length > IDEA_TEXT_MAX) {
      return { ok: false, error: `An idea is over ${IDEA_TEXT_MAX} characters; shorten it first` };
    }
    const id = pastedId(body);
    if (seen.has(id)) continue;
    seen.add(id);
    ideas.push({ id, text: body, kind: 'other', tags: [], source: '', created: null, used: false });
  }
  if (ideas.length > IDEAS_IMPORT_MAX) {
    return { ok: false, error: `Import at most ${IDEAS_IMPORT_MAX} ideas at a time` };
  }
  return ideas.length === 0
    ? { ok: false, error: 'There is nothing to import' }
    : { ok: true, ideas };
}

function fromExport(data: Record<string, unknown>): IdeaParse {
  if (data['format'] !== IDEAS_FORMAT) {
    return { ok: false, error: 'This is not an ideas export file' };
  }
  if (data['version'] !== IDEAS_VERSION) {
    return {
      ok: false,
      error: `This ideas file is version ${String(data['version'])}; this app reads version ${IDEAS_VERSION}`,
    };
  }
  if (!Array.isArray(data['ideas']))
    return { ok: false, error: 'This ideas file has no ideas list' };
  const ideas: ImportedIdea[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of (data['ideas'] as unknown[]).entries()) {
    if (!isRecord(raw) || typeof raw['id'] !== 'string' || typeof raw['text'] !== 'string') {
      return { ok: false, error: `Idea ${i + 1} in this file has no id or text` };
    }
    const text = raw['text'].trim();
    if (raw['id'].trim() === '' || text === '') {
      return { ok: false, error: `Idea ${i + 1} in this file has no id or text` };
    }
    if (text.length > IDEA_TEXT_MAX || raw['id'].length > IDEA_ID_MAX) {
      return { ok: false, error: `Idea ${i + 1} in this file is too long` };
    }
    if (seen.has(raw['id'])) continue;
    seen.add(raw['id']);
    const kind = IDEA_KINDS.find((k) => k === raw['kind']) ?? 'other';
    const tags = Array.isArray(raw['tags'])
      ? [
          ...new Set(
            raw['tags']
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim())
              .filter((t) => t !== ''),
          ),
        ].slice(0, IDEA_TAGS_MAX)
      : [];
    ideas.push({
      id: raw['id'],
      text,
      kind,
      tags,
      source: typeof raw['source'] === 'string' ? raw['source'].slice(0, IDEA_SOURCE_MAX) : '',
      created:
        typeof raw['created'] === 'string' && raw['created'].length <= IDEA_CREATED_MAX
          ? raw['created']
          : null,
      used: raw['used'] === true,
    });
  }
  if (ideas.length > IDEAS_IMPORT_MAX) {
    return { ok: false, error: `Import at most ${IDEAS_IMPORT_MAX} ideas at a time` };
  }
  return { ok: true, ideas };
}

/**
 * Reads an export file's text, or pasted text with one idea per paragraph.
 * Text that parses as a JSON object must be a version 1 export; anything else
 * that is not JSON is taken as pasted ideas.
 */
export function parseIdeas(input: string): IdeaParse {
  const text = input.trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return text.startsWith('{')
        ? { ok: false, error: 'This is not an ideas export file' }
        : fromPaste(input);
    }
    return isRecord(data)
      ? fromExport(data)
      : { ok: false, error: 'This is not an ideas export file' };
  }
  return fromPaste(input);
}

/** The ideas a preview would add: those not already held, by id. */
export function newIdeas(
  parsed: readonly ImportedIdea[],
  heldIds: ReadonlySet<string>,
): readonly ImportedIdea[] {
  return parsed.filter((idea) => !heldIds.has(idea.id));
}
