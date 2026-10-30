// MU.6: the GM-only Reference view's search, served by /api/gm/reference.

export interface ReferenceRow {
  readonly id: string;
  readonly list: string;
  readonly name: string;
  readonly kind: string;
  readonly rarity: string;
  readonly grade: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly godTied: boolean;
  readonly details: readonly string[];
  readonly confidence: string;
  readonly source: string;
}

export interface ReferenceResult {
  readonly lists: readonly { readonly id: string; readonly label: string }[];
  readonly total: number;
  readonly entries: readonly ReferenceRow[];
}

export interface ReferenceQuery {
  readonly q: string;
  readonly list: string;
  readonly godTied: boolean;
}

/** The route's query string for a search ('' list = every list). */
export function referenceUrl(query: ReferenceQuery): string {
  const p = new URLSearchParams();
  const q = query.q.trim();
  if (q) p.set('q', q.slice(0, 200));
  if (query.list) p.set('list', query.list);
  if (!query.godTied) p.set('godTied', '0');
  const s = p.toString();
  return `/api/gm/reference${s ? `?${s}` : ''}`;
}

/** "kind · rarity · grade", skipping blanks. */
export function referenceMeta(row: ReferenceRow): string {
  return [row.kind, row.rarity, row.grade].filter((x) => x !== '').join(' · ');
}

/** Only http(s) sources become links. */
export function safeSource(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}
