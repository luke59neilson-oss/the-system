import type { PlayerRules } from '@the-system/engine';

/**
 * Free-point assignment helpers (ROADMAP M3.4, DESIGN §4 "assigned once,
 * then locked; the GM can override"; D38). Pure.
 */

export interface Batch {
  readonly raceLevel: number;
  readonly points: number;
  readonly allocation: Readonly<Record<string, number>> | null;
  readonly locked: boolean;
}

/** The oldest unassigned batch (players assign one batch at a time), or null. */
export function nextBatch(batches: readonly Batch[]): Batch | null {
  return (
    batches
      .filter((b) => b.allocation === null)
      .slice()
      .sort((a, b) => a.raceLevel - b.raceLevel)[0] ?? null
  );
}

export function spent(allocation: Readonly<Record<string, number>>): number {
  return Object.values(allocation).reduce((a, b) => a + b, 0);
}

/** Adds `delta` to one stat, never below 0 and never past the batch's points. */
export function step(
  allocation: Readonly<Record<string, number>>,
  stat: string,
  delta: number,
  points: number,
): Record<string, number> {
  const current = allocation[stat] ?? 0;
  const next = current + delta;
  if (next < 0 || spent(allocation) + delta > points) return { ...allocation };
  const out: Record<string, number> = { ...allocation, [stat]: next };
  if (next === 0) delete out[stat];
  return out;
}

/** "+2 Agility, +1 Perception" in the rules' stat order. */
export function allocationText(
  rules: PlayerRules,
  allocation: Readonly<Record<string, number>>,
): string {
  const parts = rules.stats.list
    .filter((s) => (allocation[s.id] ?? 0) > 0)
    .map((s) => `+${allocation[s.id]} ${s.name}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

/** Batches already assigned (locked or GM-set), oldest first. */
export function assignedBatches(batches: readonly Batch[]): Batch[] {
  return batches.filter((b) => b.allocation !== null).sort((a, b) => a.raceLevel - b.raceLevel);
}
