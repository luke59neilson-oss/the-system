// ME.4 (DESIGN §4 "Reference while building"): the Evolutions tab's
// reference table (the books' options and the campaign's earlier ones) and
// **Use this shape**, which fills an option's distribution with a row's shape
// scaled to the step's budget (`scaleShape`, in the engine: whole points,
// exact total, free points kept as free points). GM-only.
import type { ShapeReferenceRow, ShapeTrack } from '@the-system/engine';

export { scaleShape, type ShapeRow } from '@the-system/engine';

export interface EvolutionReference {
  readonly books: readonly ShapeReferenceRow[];
  readonly campaign: readonly ShapeReferenceRow[];
}

export const EVOLUTION_REFERENCE_URL = '/api/gm/evolution-reference';

/**
 * A row's shape in whole percent of its total, per stat in stat order then
 * free points; zeros left out. Rounded each on its own (a shape to read, not
 * to add up).
 */
export function shapePercent(
  row: ShapeReferenceRow,
  stats: readonly { readonly id: string; readonly name: string }[],
): { readonly label: string; readonly percent: number }[] {
  if (row.total <= 0) return [];
  const pct = (v: number) => Math.round((v * 100) / row.total);
  return [
    ...stats.flatMap((s) => {
      const v = row.stats[s.id] ?? 0;
      return v > 0 ? [{ label: s.name, percent: pct(v) }] : [];
    }),
    ...(row.free > 0 ? [{ label: 'Free', percent: pct(row.free) }] : []),
  ];
}

/**
 * The reference with every row cut to the campaign's own stats (ME.4 review):
 * a stat the rules do not have leaves the row, its total is recounted, and a
 * row left with no points is dropped, so the table, the percentages and Use
 * this shape all agree.
 */
export function fitReference(
  reference: EvolutionReference,
  statIds: readonly string[],
): EvolutionReference {
  const known = new Set(statIds);
  const fit = (rows: readonly ShapeReferenceRow[]) =>
    rows.flatMap((r) => {
      const stats = Object.fromEntries(Object.entries(r.stats).filter(([k]) => known.has(k)));
      const total = Object.values(stats).reduce((a, b) => a + b, 0) + r.free;
      return total > 0 ? [{ ...r, stats, total }] : [];
    });
  return { books: fit(reference.books), campaign: fit(reference.campaign) };
}

/** The rows a step's shape picker lists: that track's rows first, then the rest. */
export function rowsForStep(reference: EvolutionReference, track: ShapeTrack): ShapeReferenceRow[] {
  const all = [...reference.campaign, ...reference.books];
  return [...all.filter((r) => r.track === track), ...all.filter((r) => r.track !== track)];
}

/** "Archer (class · G · start · Jake Thayne)" for the picker. */
export function rowLabel(row: ShapeReferenceRow): string {
  const from = row.source === 'books' ? 'books' : 'campaign';
  return `${row.name} (${row.track}, ${from}: ${row.note}; ${row.total}/level)`;
}
