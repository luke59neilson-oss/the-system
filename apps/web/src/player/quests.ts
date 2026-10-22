import type { PlayerQuest } from '@the-system/engine';

/**
 * Quest log helpers (ROADMAP M3.8, DESIGN §7 "Quests"). Pure.
 */

/** "Time remaining: 26 days", "… 1 day", "Time is up", or null for no timer. */
export function timeText(q: Pick<PlayerQuest, 'daysLeft' | 'status'>): string | null {
  if (q.daysLeft === null || q.status !== 'active') return null;
  if (q.daysLeft <= 0) return 'Time is up';
  return `Time remaining: ${q.daysLeft} ${q.daysLeft === 1 ? 'day' : 'days'}`;
}

export function statusText(status: PlayerQuest['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
  }
}

/** Active quests first (creation order), then finished ones, newest first. */
export function splitQuests(quests: readonly PlayerQuest[]) {
  return {
    active: quests.filter((q) => q.status === 'active'),
    finished: quests.filter((q) => q.status !== 'active').reverse(),
  };
}

/** A whole-or-one-decimal value for the gauge label (89, 88.5). */
export function stabilityLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
