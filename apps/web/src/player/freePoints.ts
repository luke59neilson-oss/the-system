import type { PlayerRules } from '@the-system/engine';

/**
 * Free-point assignment helpers (ROADMAP M3.4, MV.1; DESIGN §4: any amount at
 * once, assigned points lock, the GM can override; D38). Pure.
 */

export interface Batch {
  readonly raceLevel: number;
  readonly points: number;
  readonly allocation: Readonly<Record<string, number>> | null;
  readonly locked: boolean;
}

/** Points of one level-up still unassigned (MV.1: a level-up can be partly used). */
export function remaining(batch: Batch): number {
  if (batch.locked) return 0;
  return Math.max(0, batch.points - spent(batch.allocation ?? {}));
}

/** Every unassigned point, across all waiting level-ups. */
export function unassignedTotal(batches: readonly Batch[]): number {
  return batches.reduce((a, b) => a + remaining(b), 0);
}

/** How many level-ups still have points waiting. */
export function waitingCount(batches: readonly Batch[]): number {
  return batches.filter((b) => remaining(b) > 0).length;
}

export function spent(allocation: Readonly<Record<string, number>>): number {
  return Object.values(allocation).reduce((a, b) => a + b, 0);
}

/** Adds `delta` to one stat, never below 0 and never past the points available. */
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

/** Level-ups with points assigned (locked, GM-set or partly used), oldest first. */
export function assignedBatches(batches: readonly Batch[]): Batch[] {
  return batches.filter((b) => b.allocation !== null).sort((a, b) => a.raceLevel - b.raceLevel);
}
