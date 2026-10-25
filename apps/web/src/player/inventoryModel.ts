import type {
  PlayerCreditEntry,
  PlayerInventory,
  PlayerItem,
  PlayerRules,
  PlayerView,
} from '@the-system/engine';
import { formatStatValue, rarityName } from './sheet';

/**
 * Inventory screen helpers (ROADMAP M3.7, DESIGN §7 "Items"). Pure: they only
 * read the player's own projection.
 */

/** A party a gift or trade can go to; `null` = the GM. */
export interface Party {
  readonly id: string | null;
  readonly name: string;
}

/** Everyone the viewer can give to or trade with: the GM first, then the party. */
export function parties(view: Pick<PlayerView, 'party'>): Party[] {
  return [{ id: null, name: 'the GM' }, ...view.party.map((m) => ({ id: m.id, name: m.name }))];
}

export function partyName(view: Pick<PlayerView, 'party' | 'viewerId'>, id: string | null): string {
  if (id === null) return 'the GM';
  if (id === view.viewerId) return 'you';
  return view.party.find((m) => m.id === id)?.name ?? id;
}

/**
 * One line of the player's Credits history (MT.4, Q65): what changed, why and
 * the balance after, e.g. "+50 Credits from the GM: Bounty · balance 50".
 */
export function creditText(
  view: Pick<PlayerView, 'party' | 'viewerId'>,
  entry: PlayerCreditEntry,
  currencyName: string,
): string {
  const amount = `${entry.delta > 0 ? '+' : '−'}${Math.abs(entry.delta)} ${currencyName}`;
  const who = partyName(view, entry.other);
  const reason = entry.reason.trim() === '' ? '' : `: ${entry.reason.trim()}`;
  let what: string;
  switch (entry.kind) {
    case 'grant':
      what = `${amount} from the GM${reason}`;
      break;
    case 'fine':
      what = `${amount}, fined by the GM${reason}`;
      break;
    case 'gift':
      what = entry.delta > 0 ? `${amount}, a gift from ${who}` : `${amount}, given to ${who}`;
      break;
    case 'trade':
      what = `${amount} in a trade with ${who}`;
      break;
    case 'loot':
      what = `${amount} from loot`;
      break;
  }
  return `${what} · balance ${entry.balance}`;
}

/** `[Name (Rarity)]` for an item the viewer may see, or a placeholder. */
export function itemLabel(rules: PlayerRules, def: PlayerItem | undefined, id: string): string {
  return def ? `[${def.name} (${rarityName(rules, def.rarity)})]` : `[${id}]`;
}

/** "Agility +0.5, +5%" for an item's bonuses, in display units. */
export function bonusText(rules: PlayerRules, def: PlayerItem): string {
  return def.bonuses
    .map((b) => {
      const name = rules.stats.list.find((s) => s.id === b.stat)?.name ?? b.stat;
      const parts: string[] = [];
      if (b.flat !== undefined && b.flat !== 0) {
        parts.push(`${b.flat > 0 ? '+' : '−'}${formatStatValue(rules, Math.abs(b.flat))}`);
      }
      if (b.percent !== undefined && b.percent !== 0) {
        const pct = Math.round(Math.abs(b.percent) * 1000) / 10;
        parts.push(`${b.percent > 0 ? '+' : '−'}${pct}%`);
      }
      return `${name} ${parts.join(', ')}`;
    })
    .join(' · ');
}

/** The slot rows the player sees: every slot of the rules, with what is in it. */
export function slotRows(
  rules: PlayerRules,
  inv: PlayerInventory,
): { key: string; slot: string; index: number; label: string; itemId: string | null }[] {
  return rules.equipmentSlots.flatMap((s) =>
    Array.from({ length: s.count }, (_, index) => {
      const key = `${s.id}:${index}`;
      return {
        key,
        slot: s.id,
        index,
        label: s.count > 1 ? `${s.name} ${index + 1}` : s.name,
        itemId: Object.prototype.hasOwnProperty.call(inv.equipped, key)
          ? (inv.equipped[key] ?? null)
          : null,
      };
    }),
  );
}

/**
 * Where [Equip] puts an item: the first empty slot of its kind, else the first
 * slot (the item there goes back to the inventory). Null when it can't be worn.
 */
export function equipTarget(
  rules: PlayerRules,
  inv: PlayerInventory,
  def: PlayerItem,
): { slot: string; index: number } | null {
  if (def.slot === null) return null;
  const rule = rules.equipmentSlots.find((s) => s.id === def.slot);
  if (!rule || rule.count < 1) return null;
  for (let index = 0; index < rule.count; index++) {
    if (!Object.prototype.hasOwnProperty.call(inv.equipped, `${def.slot}:${index}`)) {
      return { slot: def.slot, index };
    }
  }
  return { slot: def.slot, index: 0 };
}

/** "[Potion (Common)] ×2 and 30 Credits", or "nothing". */
export function bundleText(
  rules: PlayerRules,
  inv: PlayerInventory,
  bundle: { currency: number; items: Readonly<Record<string, number>> },
): string {
  const parts = Object.entries(bundle.items).map(([id, n]) => {
    const label = itemLabel(rules, inv.itemDefs[id], id);
    return n > 1 ? `${label} ×${n}` : label;
  });
  if (bundle.currency > 0) parts.push(`${bundle.currency} ${rules.currencyName}`);
  if (parts.length === 0) return 'nothing';
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    : (parts[0] ?? '');
}

/** Open trades split by who must act: offers to the viewer, and the viewer's own. */
export function openTrades(inv: PlayerInventory, viewerId: string) {
  const open = inv.trades.filter((t) => t.status === 'open');
  return {
    incoming: open.filter((t) => t.to === viewerId),
    outgoing: open.filter((t) => t.from === viewerId),
    closed: inv.trades.filter((t) => t.status !== 'open'),
  };
}

/** A whole number from a form field, or null when it isn't one in 0..max. */
export function wholeNumber(text: string, max: number): number | null {
  if (!/^\d+$/u.test(text.trim())) return null;
  const n = Number(text.trim());
  return Number.isSafeInteger(n) && n <= max ? n : null;
}
