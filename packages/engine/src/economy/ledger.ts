import type { Holdings, Trade } from './model';

/**
 * The GM's currency ledger (ROADMAP M6.3, DESIGN §7 "Items": a configurable
 * currency and giving between players and the GM). One entry per character
 * whose balance an event changed: grants and fines from the GM, gifts,
 * accepted trades and loot. Kept in state (latest LEDGER_LIMIT), so an undo
 * removes its entries with the event. GM-only.
 */
export type LedgerKind = 'grant' | 'fine' | 'gift' | 'trade' | 'loot';

export interface LedgerEntry {
  /** Id of the event that moved the currency. */
  readonly id: string;
  /** ISO-8601 UTC. */
  readonly at: string;
  readonly characterId: string;
  /** Signed change to the balance. */
  readonly delta: number;
  /** Balance after the change. */
  readonly balance: number;
  readonly kind: LedgerKind;
  /** The other party (a character id), or null for the GM. */
  readonly other: string | null;
  /** The GM's reason for a grant or fine; '' otherwise. */
  readonly reason: string;
}

/** Most ledger entries kept in state; older ones stay in the event log and reports. */
export const LEDGER_LIMIT = 300;

/** What the ledger needs from the event that changed balances. */
export type LedgerCause =
  | { readonly type: 'holdings.adjusted'; readonly reason: string }
  | { readonly type: 'gift.given'; readonly from: string | null; readonly to: string | null }
  | { readonly type: 'trade.accepted'; readonly trade: Trade }
  | { readonly type: 'loot.rolled' };

const balance = (h: Readonly<Record<string, Holdings>>, id: string) =>
  Object.prototype.hasOwnProperty.call(h, id) ? (h[id]?.currency ?? 0) : 0;

/**
 * Ledger entries for one event: every character (in `order`) whose balance
 * differs between `before` and `after`. Pure.
 */
export function ledgerEntries(
  before: Readonly<Record<string, Holdings>>,
  after: Readonly<Record<string, Holdings>>,
  order: readonly string[],
  event: { readonly id: string; readonly timestamp: string },
  cause: LedgerCause,
): LedgerEntry[] {
  if (before === after) return [];
  const out: LedgerEntry[] = [];
  for (const characterId of order) {
    const now = balance(after, characterId);
    const delta = now - balance(before, characterId);
    if (delta === 0) continue;
    let kind: LedgerKind;
    let other: string | null = null;
    let reason = '';
    switch (cause.type) {
      case 'holdings.adjusted':
        kind = delta > 0 ? 'grant' : 'fine';
        reason = cause.reason;
        break;
      case 'gift.given':
        kind = 'gift';
        other = cause.from === characterId ? cause.to : cause.from;
        break;
      case 'trade.accepted':
        kind = 'trade';
        other = cause.trade.from === characterId ? cause.trade.to : cause.trade.from;
        break;
      case 'loot.rolled':
        kind = 'loot';
        break;
    }
    out.push({
      id: event.id,
      at: event.timestamp,
      characterId,
      delta,
      balance: now,
      kind,
      other,
      reason,
    });
  }
  return out;
}

/** A character's ledger, newest first (`characterId` null = everyone). */
export function ledgerFor(
  ledger: readonly LedgerEntry[],
  characterId: string | null,
): LedgerEntry[] {
  return ledger.filter((e) => characterId === null || e.characterId === characterId).reverse();
}
