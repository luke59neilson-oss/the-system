// ME.4 (DESIGN §4 "Reference while building"): **Use this shape** fills an
// option's distribution with a reference row's shape scaled to the step's
// budget: whole points, exact total (largest remainder, ties in stat order),
// free points kept as free points.

import { distributionTotal, scaleDistribution } from '../progression/budget';

export interface ShapeRow {
  readonly stats: Readonly<Record<string, number>>;
  readonly free: number;
}

/** The row scaled to `budget`, or null for a row with no points or a budget that is not a whole number ≥ 0. */
export function scaleShape(
  row: ShapeRow,
  budget: number,
  statOrder: readonly string[],
): ShapeRow | null {
  if (!Number.isInteger(budget) || budget < 0) return null;
  // Only the listed stats with points count, as in the engine's own scaling.
  const stats = Object.fromEntries(
    statOrder.flatMap((k) => ((row.stats[k] ?? 0) > 0 ? [[k, row.stats[k] as number]] : [])),
  );
  if (distributionTotal({ stats, free: row.free }) <= 0) return null;
  // One rounding for the builder and the engine (QF.68): whole-number remainders, ties in stat order.
  return scaleDistribution({ stats, free: row.free }, budget, statOrder);
}
