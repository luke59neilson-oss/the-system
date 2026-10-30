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
