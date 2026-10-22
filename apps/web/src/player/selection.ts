import type { OwnSheet, PlayerRules } from '@the-system/engine';
import { friendlyError } from '../format';
import { rarityName } from './sheet';

/**
 * Skill selection helpers (ROADMAP M3.6, DESIGN §6 "menu of 3–4 options …
 * the choice can wait for downtime"). Pure.
 */

export type Selection = OwnSheet['selections'][number];
export type Offer = Selection['options'][number];

/** Offered menus still waiting for the player's pick, lowest level first. */
export function pendingSelections(selections: readonly Selection[]): Selection[] {
  return selections.filter((s) => s.chosen === null).sort((a, b) => a.level - b.level);
}

/** The badge text beside "Skill selection", e.g. "1 waiting". */
export function pendingText(count: number): string {
  return `${count} waiting`;
}

/** "Class skill" / "Profession skill" for an offered option. */
export function offerKindLabel(kind: Offer['kind']): string {
  return kind === 'profession' ? 'Profession skill' : 'Class skill';
}

/** `[Name (Rarity)]`, the bracketed System form used on the sheet. */
export function offerLabel(rules: PlayerRules, offer: Offer): string {
  return `[${offer.name} (${rarityName(rules, offer.rarity)})]`;
}

/** Why an open menu closed on its own, or null while it is still the same menu. */
export function closedReason(
  pending: readonly Selection[],
  level: number,
  offerId: string,
): 'gone' | 'changed' | null {
  const now = pending.find((s) => s.level === level);
  if (now === undefined) return 'gone';
  return now.offerId === offerId ? null : 'changed';
}

/** True for the errors after which a command may or may not have been applied. */
export function isConnectionError(error: string | undefined): boolean {
  return error === 'Connection lost' || error === 'Not connected to the System';
}

/** The sheet notice for a choice refused after its dialog had closed. */
export function settleNotice(level: number, error: string | undefined): string {
  if (isConnectionError(error))
    return `Connection lost. Check your skills once you are back: the level ${level} choice may already be saved.`;
  return `Your level ${level} skill choice was not saved: ${friendlyError(error ?? 'refused')}`;
}
