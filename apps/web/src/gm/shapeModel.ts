// ME.4 (DESIGN §4 "Reference while building"): **Use this shape** fills an
// option's distribution with a reference row's shape scaled to the step's
// budget: whole points, exact total (largest remainder, ties in stat order),
// free points kept as free points.

export interface ShapeRow {
  readonly stats: Readonly<Record<string, number>>;
  readonly free: number;
}

/** The row scaled to `budget`, or null for a row with no points. */
export function scaleShape(
  row: ShapeRow,
  budget: number,
  statOrder: readonly string[],
): ShapeRow | null {
  const keys = [...statOrder.filter((k) => (row.stats[k] ?? 0) > 0), '__free'];
  const raw = keys.map((k) => (k === '__free' ? row.free : (row.stats[k] ?? 0)));
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= 0 || budget < 0) return null;
  const exact = raw.map((v) => (v * budget) / total);
  const whole = exact.map((v) => Math.floor(v));
  let left = budget - whole.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    whole[i]! += 1;
    left -= 1;
  }
  const stats: Record<string, number> = {};
  keys.forEach((k, i) => {
    if (k !== '__free' && whole[i]! > 0) stats[k] = whole[i]!;
  });
  return { stats, free: whole[keys.length - 1]! };
}
