import type { PlayerContest, PlayerDie, PlayerView } from '@the-system/engine';

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

const signed = (n: number): string => (n < 0 ? `−${-n}` : `+${n}`);

/**
 * MK.2 (DESIGN §7 "Dice"): one line per d20 round from the viewer's side:
 * each die (thrown and typed, or rolled by the app), modifier and total.
 * Empty for app odds and grade walls.
 */
export function diceLines(c: PlayerContest): string[] {
  const d = c.d20;
  if (!d) return [];
  const last = d.rounds.length - 1;
  return d.rounds.map((r, i) => {
    const side = (die: PlayerDie, mod: number) =>
      `${die.die} (${die.how === 'typed' ? 'typed' : 'app'}) ${signed(mod)} = ${die.total}`;
    const text = `You: d20 ${side(r.yours, d.yourModifier)} · They: d20 ${side(r.theirs, d.theirModifier)}`;
    return i < last ? `${text} (tie, roll again)` : text;
  });
}

/**
 * MK.2: the phone's roll prompt: "Roll d20 for Perception (+14)" and, once
 * answered, "You rolled 17 (typed) +14 = 31. The GM has it."
 */
export function rollPromptText(
  view: Pick<PlayerView, 'rules' | 'me'>,
  req: NonNullable<PlayerView['rollRequest']>,
): { title: string; answer: string | null } {
  const label = view.rules.stats.list.find((s) => s.id === req.stat)?.name ?? req.stat;
  const mod = view.me.rollModifiers?.[req.stat] ?? 0;
  const title = `Roll d20 for ${label} (${signed(mod)})`;
  if (req.answer === null) return { title, answer: null };
  const a = req.answer;
  return {
    title,
    answer: `You rolled ${a.die} (${a.how === 'typed' ? 'typed' : 'app'}) ${signed(mod)} = ${a.die + mod}. The GM has it.`,
  };
}
