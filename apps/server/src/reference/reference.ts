// MU.6 (DESIGN §9a, §11; L23): the Primal Hunter reference lists as GM-only
// reference. The GM searches them in Library & settings; the co-DM gets a
// small, relevant sample as naming and tone examples, never `god-tied` rows
// (the campaign's Earth has no gods, DESIGN §1). Nothing here is ever sent
// to a player: it is served only on GM routes and inside co-DM prompts.
import { csvRecords } from './csv';
import { REFERENCE_CSV } from './lists.generated';

export const REFERENCE_LISTS = ['skills', 'items', 'creatures', 'classes'] as const;
export type ReferenceList = (typeof REFERENCE_LISTS)[number];

export const REFERENCE_LIST_LABELS: Readonly<Record<ReferenceList, string>> = {
  skills: 'Skills',
  items: 'Items',
  creatures: 'Creatures',
  classes: 'Classes and professions',
};

export interface ReferenceEntry {
  readonly id: string;
  readonly list: ReferenceList;
  readonly name: string;
  readonly kind: string;
  /** Rarity as the books give it ('' when unknown). */
  readonly rarity: string;
  /** Grade or tier note ('' when unknown). */
  readonly grade: string;
  /** One line in our own words. */
  readonly summary: string;
  /** Theme tags, lower case. */
  readonly tags: readonly string[];
  readonly godTied: boolean;
  /** The list's other columns, "label: value", for the Reference view. */
  readonly details: readonly string[];
  /** `verified` or `recall`. */
  readonly confidence: string;
  readonly source: string;
}

const SHARED = new Set([
  'name',
  'kind',
  'rarity',
  'grade',
  'grade_or_tier',
  'summary',
  'theme_tags',
  'confidence',
  'source_url',
]);
export const GOD_TIED = 'god-tied';
/**
 * Words that tie a row to the books' gods or their worship. A row whose
 * prompt line (name, kind, rarity, summary: everything the co-DM reads) uses
 * one stays out of samples even when untagged.
 */
export const GOD_WORDS =
  /\b(gods?|godless|goddess(es)?|godhood|primordials?|divine|deity|deities|patron|malefic|viper's|chosen|heretic\w*|bless\w*|cult\w*|sacrific\w*|altars?|worship\w*|pantheon)\b/i;

const label = (column: string) => column.replace(/_/g, ' ');

/** Parse one list's CSV text into entries (rows without a name are skipped). */
export function parseReferenceList(list: ReferenceList, csv: string): ReferenceEntry[] {
  return csvRecords(csv)
    .filter((r) => (r['name'] ?? '') !== '')
    .map((r, i) => {
      const tags = (r['theme_tags'] ?? '')
        .split(';')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t !== '');
      return {
        id: `${list}-${i + 1}`,
        list,
        name: r['name'] ?? '',
        kind: r['kind'] ?? '',
        rarity: r['rarity'] ?? '',
        grade: r['grade'] ?? r['grade_or_tier'] ?? '',
        summary: r['summary'] ?? '',
        tags,
        godTied: tags.includes(GOD_TIED),
        details: Object.entries(r)
          .filter(([k, v]) => !SHARED.has(k) && v !== '')
          .map(([k, v]) => `${label(k)}: ${v}`),
        confidence: r['confidence'] ?? '',
        source: r['source_url'] ?? '',
      };
    });
}

let cache: readonly ReferenceEntry[] | null = null;

/** Every entry of every list, in list then file order. */
export function referenceEntries(): readonly ReferenceEntry[] {
  cache ??= REFERENCE_LISTS.flatMap((list) => parseReferenceList(list, REFERENCE_CSV[list]));
  return cache;
}

export const REFERENCE_SEARCH_MAX = 60;

export interface ReferenceSearch {
  readonly q?: string | undefined;
  readonly list?: ReferenceList | null | undefined;
  /** Default true: the GM sees god-tied rows, flagged. */
  readonly godTied?: boolean | undefined;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .filter((w) => w.length > 0);

/** Every search word must appear in the name, kind, rarity, summary, tags or details. */
export function searchReference(
  entries: readonly ReferenceEntry[],
  search: ReferenceSearch,
): { readonly total: number; readonly entries: readonly ReferenceEntry[] } {
  const terms = words(search.q ?? '');
  const hits = entries.filter((e) => {
    if (search.list && e.list !== search.list) return false;
    if (search.godTied === false && e.godTied) return false;
    if (!terms.length) return true;
    const hay = [e.name, e.kind, e.rarity, e.grade, e.summary, e.tags.join(' '), ...e.details]
      .join(' ')
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  // Name matches first, then file order.
  const named = (e: ReferenceEntry) => terms.some((t) => e.name.toLowerCase().includes(t));
  const ordered = terms.length ? [...hits.filter(named), ...hits.filter((e) => !named(e))] : hits;
  return { total: hits.length, entries: ordered.slice(0, REFERENCE_SEARCH_MAX) };
}

/** Which lists suit each kind of co-DM request (first is weighted most). */
export const SAMPLE_LISTS: Readonly<Record<string, readonly ReferenceList[]>> = {
  shop: ['items'],
  item: ['items'],
  npc: ['classes', 'creatures', 'skills'],
  place: ['creatures', 'items'],
  encounter: ['creatures', 'skills'],
  questHook: ['creatures', 'items', 'classes'],
  quick: ['creatures', 'items', 'skills', 'classes'],
};

export const REFERENCE_SAMPLE_MAX = 8;
/** Characters of sample lines at most, so a prompt stays small. */
export const REFERENCE_SAMPLE_CHARS = 1_200;

/** A stable 32-bit hash, so the same request picks the same sample. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A small sample for a co-DM prompt: never god-tied; rows of the kind's lists
 * whose tags or name share a word with the request rank first, the rest fill
 * in, rotated by a hash of the request so different requests see different
 * examples. Deterministic; at most REFERENCE_SAMPLE_MAX rows and
 * REFERENCE_SAMPLE_CHARS characters.
 */
export function referenceSample(
  entries: readonly ReferenceEntry[],
  kind: string,
  request: string,
): ReferenceEntry[] {
  const lists = SAMPLE_LISTS[kind] ?? SAMPLE_LISTS['quick'] ?? [];
  const asked = new Set(words(request).flatMap((w) => [w, w.replace(/s$/, '')]));
  const score = (e: ReferenceEntry) =>
    e.tags.filter((t) => asked.has(t)).length * 2 +
    words(e.name).filter((w) => asked.has(w)).length;
  const pool = entries.filter(
    (e) =>
      !e.godTied && !GOD_WORDS.test(sampleLine(e)) && lists.includes(e.list) && e.summary !== '',
  );
  if (!pool.length) return [];
  const start = hash(`${kind}\n${request}`) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  // Stable sort: relevance first, then the rotation; spread over the lists.
  const ranked = rotated
    .map((e, i) => ({ e, s: score(e), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
  const picked: ReferenceEntry[] = [];
  const perList = Math.max(2, Math.ceil(REFERENCE_SAMPLE_MAX / lists.length));
  let chars = 0;
  for (const e of ranked) {
    if (picked.length >= REFERENCE_SAMPLE_MAX) break;
    if (picked.filter((p) => p.list === e.list).length >= perList) continue;
    if (picked.some((p) => p.name.toLowerCase() === e.name.toLowerCase())) continue;
    const line = sampleLine(e);
    if (chars + line.length > REFERENCE_SAMPLE_CHARS) continue;
    picked.push(e);
    chars += line.length;
  }
  return picked;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export function sampleLine(e: ReferenceEntry): string {
  const what = [e.kind, e.rarity].filter((x) => x !== '').join(', ');
  return `- ${oneLine(e.name)}${what ? ` (${oneLine(what)})` : ''}: ${oneLine(e.summary)}`;
}

/** The prompt block for a sample, or '' when there is none. */
export function referencePromptBlock(kind: string, request: string): string {
  const sample = referenceSample(referenceEntries(), kind, request);
  if (!sample.length) return '';
  return [
    'Naming and tone examples from The Primal Hunter (match the style; invent your own names, do not reuse these):',
    ...sample.map(sampleLine),
  ].join('\n');
}
