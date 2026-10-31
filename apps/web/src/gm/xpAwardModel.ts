import type { XpContext } from '@the-system/engine';

const n = (v: number) => v.toLocaleString('en-US');

/** One track's progress: "90/100 XP, 10 to next", or "at the grade's top" when capped. */
function track(xp: number, perLevel: number, toNext: number | null, unit: string): string {
  if (toNext === null) return 'at the grade’s top';
  return `${n(xp)}/${n(perLevel)}${unit}, ${n(toNext)} to next`;
}

/**
 * MU.3: the context under a participant's name in the award box, e.g.
 * "G-grade · Class 3 · 90/100 XP, 10 to next · Profession 2 · 40/100, 60 to next".
 * A capped track shows no fraction, since it cannot progress (review).
 */
export function xpContextText(x: XpContext): string {
  const parts = [
    `${x.grade}-grade`,
    `Class ${x.classLevel}`,
    track(x.xp.class, x.perLevel, x.toNext.class, ' XP'),
  ];
  if (x.professionLevel !== null && x.xp.profession !== null) {
    parts.push(`Profession ${x.professionLevel}`);
    parts.push(track(x.xp.profession, x.perLevel, x.toNext.profession, ''));
  }
  return parts.join(' · ');
}

/** MU.3: "1.5 levels", "1 level", "0 levels"; a real share too small to show is "under 0.1 levels". */
export function formatLevels(levels: number): string {
  const rounded = Math.round(levels * 10) / 10;
  if (rounded === 0 && levels > 0) return 'under 0.1 levels';
  return `${rounded.toLocaleString('en-US')} ${rounded === 1 ? 'level' : 'levels'}`;
}

/**
 * MV.2 (DESIGN §5 "Shares are percentages"): the even starting percentages
 * for `count` participants, whole numbers summing to 100, the remainder one
 * point each to the first participants (34/33/33).
 */
export function evenPercents(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const extra = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Each participant's XP for typed percentages, rounded so the shares add up
 * to `amount` exactly (largest remainder first, ties to the earlier row).
 * Null unless the percentages are whole, 0–100 and total exactly 100.
 */
export function percentShares(amount: number, percents: readonly number[]): number[] | null {
  if (percents.length === 0) return null;
  if (!percents.every((p) => Number.isInteger(p) && p >= 0 && p <= 100)) return null;
  if (percents.reduce((a, b) => a + b, 0) !== 100) return null;
  const parts = percents.map((p) => Math.floor((amount * p) / 100));
  let left = amount - parts.reduce((a, b) => a + b, 0);
  const order = percents
    .map((p, i) => ({ i, r: (amount * p) % 100 }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    parts[i] = (parts[i] as number) + 1;
    left -= 1;
  }
  return parts;
}
