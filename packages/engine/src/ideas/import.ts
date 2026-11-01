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
    const id = pastedId(body);
    if (seen.has(id)) continue;
    seen.add(id);
    ideas.push({ id, text: body, kind: 'other', tags: [], source: '', created: null, used: false });
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
    if (raw['id'] === '' || text === '') {
      return { ok: false, error: `Idea ${i + 1} in this file has no id or text` };
    }
    if (seen.has(raw['id'])) continue;
    seen.add(raw['id']);
    const kind = IDEA_KINDS.find((k) => k === raw['kind']) ?? 'other';
    const tags = Array.isArray(raw['tags'])
      ? raw['tags'].filter((t): t is string => typeof t === 'string')
      : [];
    ideas.push({
      id: raw['id'],
      text,
      kind,
      tags,
      source: typeof raw['source'] === 'string' ? raw['source'] : '',
      created: typeof raw['created'] === 'string' ? raw['created'] : null,
      used: raw['used'] === true,
    });
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
