import {
  ledgerFor,
  type CampaignState,
  type Command,
  type LedgerEntry,
  type LedgerKind,
} from '@the-system/engine';

/**
 * The GM's currency window (ROADMAP M6.3, DESIGN §7 "Items"): grants, fines
 * and the ledger. Pure helpers; tested in currencyModel.test.ts.
 */

/** Largest amount one grant or fine may move (the event schema's bound). */
export const MAX_AMOUNT = 1_000_000_000;

/** A positive whole number as typed, or null. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/u.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_AMOUNT ? n : null;
}

const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

export interface BalanceRow {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
}

/** Every character's balance, in character order. */
export function balances(
  state: Pick<CampaignState, 'characterOrder' | 'characters' | 'holdings'>,
): BalanceRow[] {
  return state.characterOrder.flatMap((id) => {
    const c = own(state.characters, id);
    return c ? [{ id, name: c.name, balance: own(state.holdings, id)?.currency ?? 0 }] : [];
  });
}

/**
 * One `holdings.adjust` per chosen character: +amount for a grant, -amount for
 * a fine, each with the reason. Or the reason it cannot be sent: no one
 * chosen, an amount that is not a positive whole number, or a fine larger
 * than someone's balance (nothing is sent then, so a party fine is all or none).
 */
export function currencyCommands(
  state: Pick<CampaignState, 'characterOrder' | 'characters' | 'holdings'> & {
    rules: { economy: { currencyName: string } };
  },
  chosen: readonly string[],
  rawAmount: string,
  sign: 1 | -1,
  reason: string,
): { commands: Command[] } | { problem: string } {
  const rows = balances(state).filter((r) => chosen.includes(r.id));
  if (rows.length === 0) return { problem: 'Choose who it is for' };
  const amount = parseAmount(rawAmount);
  if (amount === null) return { problem: 'Enter a whole number above 0' };
  const currency = state.rules.economy.currencyName;
  if (sign < 0) {
    const short = rows.filter((r) => r.balance < amount);
    if (short.length > 0) {
      const names = short.map((r) => `${r.name} has ${r.balance}`).join(', ');
      return { problem: `Not enough ${currency}: ${names}` };
    }
  }
  const why = reason.trim().slice(0, 200);
  return {
    commands: rows.map((r) => ({
      type: 'holdings.adjust',
      characterId: r.id,
      currency: sign * amount,
      reason: why,
    })),
  };
}

const KIND_LABELS: Readonly<Record<LedgerKind, string>> = {
  grant: 'Grant',
  fine: 'Fine',
  gift: 'Gift',
  trade: 'Trade',
  loot: 'Loot',
};

/** "+50" / "−20" (a true minus sign). */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${-n}`;
}

export interface LedgerRow {
  readonly key: string;
  readonly at: string;
  readonly name: string;
  readonly kind: string;
  readonly delta: string;
  readonly balance: number;
  /** "from the GM", "to Mara", or a reason; '' when there is nothing to add. */
  readonly detail: string;
}

function detailOf(state: Pick<CampaignState, 'characters'>, e: LedgerEntry): string {
  if (e.kind === 'grant' || e.kind === 'fine') return e.reason;
  if (e.kind === 'loot') return 'from a loot roll';
  const other = e.other === null ? 'the GM' : (own(state.characters, e.other)?.name ?? 'someone');
  return e.delta > 0 ? `from ${other}` : `to ${other}`;
}

/** The ledger as the window shows it, newest first (`characterId` null = everyone). */
export function ledgerRows(
  state: Pick<CampaignState, 'characters' | 'ledger'>,
  characterId: string | null,
): LedgerRow[] {
  return ledgerFor(state.ledger, characterId).map((e) => ({
    key: `${e.id}:${e.characterId}`,
    at: e.at,
    name: own(state.characters, e.characterId)?.name ?? 'Removed character',
    kind: KIND_LABELS[e.kind],
    delta: signed(e.delta),
    balance: e.balance,
    detail: detailOf(state, e),
  }));
}
