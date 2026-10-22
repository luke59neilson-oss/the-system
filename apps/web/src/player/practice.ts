import type { PlayerPractice, PlayerRules } from '@the-system/engine';

/**
 * Practice window helpers (ROADMAP M3.11, DESIGN §7 "Practice log",
 * "Montage"). Pure, so they are unit tested.
 */

/** Longest action or focus line: the practice event limit (envelope.ts). */
export const MAX_ACTION = 200;

/** How many of the player's own entries the window lists (UI choice). */
export const RECENT_PRACTICE = 8;

/** Why the entry cannot be sent yet, or null. */
export function practiceProblem(
  action: string,
  skills: readonly string[],
  stat: string | null,
  /** Practice entries need a skill or stat; a montage focus is just a line (DESIGN §7). */
  needSkillOrStat = true,
): string | null {
  if (action.trim() === '') return 'Say what you did';
  if (action.trim().length > MAX_ACTION) return `At most ${MAX_ACTION} characters`;
  if (needSkillOrStat && skills.length === 0 && stat === null) return 'Pick a skill or a stat';
  return null;
}

/** "Basic Archery + Keen Shot · Perception" (skills, then the stat's name). */
export function practiceWhat(entry: Pick<PlayerPractice, 'skills' | 'stat'>, rules: PlayerRules) {
  const stat =
    entry.stat === null
      ? null
      : (rules.stats.list.find((s) => s.id === entry.stat)?.name ?? entry.stat);
  return [entry.skills.join(' + '), stat].filter((p) => p !== null && p !== '').join(' · ');
}

const SOURCE_LABEL: Record<PlayerPractice['source'], string> = {
  player: 'by you',
  gm: 'by the GM',
  montage: 'montage focus',
};

export const sourceLabel = (source: PlayerPractice['source']): string => SOURCE_LABEL[source];

/** The newest entries first, at most RECENT_PRACTICE. */
export function recentPractice(entries: readonly PlayerPractice[]): PlayerPractice[] {
  return [...entries].reverse().slice(0, RECENT_PRACTICE);
}
