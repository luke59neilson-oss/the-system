import type { PlayerContest } from '@the-system/engine';

/**
 * Contest result pop-up (ROADMAP M7.3, D88): a contest the GM shares while the
 * page is open pops up for each character on either side. Contests already in
 * the view when the page first loaded never pop up.
 */
export function newContests(
  contests: readonly PlayerContest[],
  known: ReadonlySet<string>,
): PlayerContest[] {
  return contests.filter((c) => !known.has(c.id));
}

/** "75%" with the extremes kept visible ("<1%", ">99%"). */
export function chanceText(chance: number): string {
  if (chance > 0 && chance < 0.01) return '<1%';
  if (chance < 1 && chance > 0.99) return '>99%';
  return `${Math.round(chance * 100)}%`;
}

/** The pop-up's lines: the contest, the odds, and the outcome in System words. */
export function contestLines(c: PlayerContest): { title: string; odds: string; result: string } {
  return {
    title: `[${c.yours.label}] vs [${c.theirs}]`,
    odds: c.walled ? 'A grade wall decides it: no roll.' : `Your chance: ${chanceText(c.chance)}`,
    result: c.won ? 'Success.' : 'Failure.',
  };
}
