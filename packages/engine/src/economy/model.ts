import { effectiveStats, statBreakdown, type BonusSource, type StatBonus } from '../bonuses';
import type { RulesConfig } from '../rules';

/**
 * Items and economy (ROADMAP M1.7, DESIGN §7 "Items"). Pure helpers over plain
 * data; the reducer turns their errors into event rejections.
 *
 * - Item definitions live in a campaign library; every copy of an item shares
 *   its definition, so a rarity edit changes every copy.
 * - Each character holds currency, an inventory (item id → count) and
 *   equipment (slot key "<slotId>:<index>" → item id). Equipped items are
 *   not in the inventory; only inventory items can be given or traded.
 * - The GM is a party with no holdings: what the GM gives comes from nowhere,
 *   what the GM receives leaves play. A party id of null means the GM.
 * - No balance or stack ever goes below zero; every transfer applies whole or
 *   not at all.
 */

export class EconomyRuleError extends Error {}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  /** Rarity id from the rules' rarity ladder. */
  readonly rarity: string;
  readonly description: string;
  /** Equipment slot id it goes in, or null when it cannot be equipped. */
  readonly slot: string | null;
  /** Stat bonuses while equipped (M1.6 order). */
  readonly bonuses: readonly StatBonus[];
}

export interface Holdings {
  readonly currency: number;
  /** Item id → count (never 0 or below; absent = none). */
  readonly inventory: Readonly<Record<string, number>>;
  /** Slot key "<slotId>:<index>" → item id. */
  readonly equipped: Readonly<Record<string, string>>;
}

/** Currency and items moving one way. */
export interface Bundle {
  readonly currency: number;
  readonly items: Readonly<Record<string, number>>;
}

export type TradeStatus = 'open' | 'accepted' | 'declined' | 'cancelled';

export interface Trade {
  readonly id: string;
  /** Proposer; null = the GM. */
  readonly from: string | null;
  /** Counterparty; null = the GM. */
  readonly to: string | null;
  /** What the proposer hands over. */
  readonly give: Bundle;
  /** What the proposer asks for in return. */
  readonly get: Bundle;
  readonly status: TradeStatus;
  readonly proposedAt: string;
  readonly closedAt: string | null;
}

export const EMPTY_HOLDINGS: Holdings = { currency: 0, inventory: {}, equipped: {} };

const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

export const slotKey = (slot: string, index: number): string => `${slot}:${index}`;

export const isEmptyBundle = (b: Bundle): boolean =>
  b.currency === 0 && Object.keys(b.items).length === 0;

/** Checks an item definition against the rules (rarity, slot, bonuses). */
export function validateItemDef(rules: RulesConfig, def: ItemDef): void {
  const rarity = rules.skills.rarities.find((r) => r.id === def.rarity);
  if (!rarity) throw new EconomyRuleError(`Unknown rarity "${def.rarity}"`);
  if (rarity.reserved) throw new EconomyRuleError(`Rarity "${def.rarity}" is reserved`);
  if (def.slot !== null && !rules.economy.equipmentSlots.some((s) => s.id === def.slot)) {
    throw new EconomyRuleError(`Unknown equipment slot "${def.slot}"`);
  }
  const stats = new Set<string>();
  for (const b of def.bonuses) {
    if (stats.has(b.stat)) throw new EconomyRuleError(`Stat "${b.stat}" is listed twice`);
    stats.add(b.stat);
  }
  try {
    statBreakdown(rules, zeroStats(rules), [itemSource(def, 'check')]);
  } catch (error) {
    throw new EconomyRuleError(error instanceof Error ? error.message : String(error));
  }
}

const zeroStats = (rules: RulesConfig): Record<string, number> =>
  Object.fromEntries(rules.stats.list.map((s) => [s.id, 0]));

const itemSource = (def: ItemDef, key: string): BonusSource => ({
  id: `item:${key}`,
  kind: 'item',
  name: def.name,
  bonuses: def.bonuses,
});

/** Adds (sign 1) or removes (sign -1) a bundle; throws rather than go negative. */
export function applyBundle(
  holdings: Holdings,
  bundle: Bundle,
  sign: 1 | -1,
  names: Readonly<Record<string, ItemDef>>,
  currencyName: string,
): Holdings {
  const currency = holdings.currency + sign * bundle.currency;
  if (currency < 0) {
    throw new EconomyRuleError(`Not enough ${currencyName} (has ${holdings.currency})`);
  }
  if (!Number.isSafeInteger(currency)) throw new EconomyRuleError(`${currencyName} overflow`);
  const inventory: Record<string, number> = { ...holdings.inventory };
  for (const [itemId, count] of Object.entries(bundle.items)) {
    const def = own(names, itemId);
    if (!def) throw new EconomyRuleError(`Unknown item "${itemId}"`);
    const next = (own(inventory, itemId) ?? 0) + sign * count;
    if (next < 0) {
      throw new EconomyRuleError(
        `Not enough [${def.name}] (has ${own(inventory, itemId) ?? 0}, needs ${count})`,
      );
    }
    if (!Number.isSafeInteger(next)) throw new EconomyRuleError(`[${def.name}] overflow`);
    if (next === 0) delete inventory[itemId];
    else inventory[itemId] = next;
  }
  return { ...holdings, currency, inventory };
}

/** Equips one item from the inventory; an item already in the slot goes back to it. */
export function equip(
  rules: RulesConfig,
  holdings: Holdings,
  def: ItemDef,
  slot: string,
  index: number,
): Holdings {
  const slotRule = rules.economy.equipmentSlots.find((s) => s.id === slot);
  if (!slotRule) throw new EconomyRuleError(`Unknown equipment slot "${slot}"`);
  if (!Number.isInteger(index) || index < 0 || index >= slotRule.count) {
    throw new EconomyRuleError(`${slotRule.name} slot ${index + 1} does not exist`);
  }
  if (def.slot !== slot) {
    throw new EconomyRuleError(
      def.slot === null
        ? `[${def.name}] cannot be equipped`
        : `[${def.name}] goes in a ${def.slot} slot, not ${slot}`,
    );
  }
  const key = slotKey(slot, index);
  const current = own(holdings.equipped, key);
  if (current === def.id) throw new EconomyRuleError(`[${def.name}] is already equipped there`);
  const have = own(holdings.inventory, def.id) ?? 0;
  if (have < 1) throw new EconomyRuleError(`No [${def.name}] in the inventory`);
  const inventory: Record<string, number> = { ...holdings.inventory };
  if (have === 1) delete inventory[def.id];
  else inventory[def.id] = have - 1;
  if (current !== undefined) inventory[current] = (own(inventory, current) ?? 0) + 1;
  return { ...holdings, inventory, equipped: { ...holdings.equipped, [key]: def.id } };
}

/** Moves the item in a slot back to the inventory. */
export function unequip(holdings: Holdings, slot: string, index: number): Holdings {
  const key = slotKey(slot, index);
  const current = own(holdings.equipped, key);
  if (current === undefined) throw new EconomyRuleError(`Nothing is equipped in ${key}`);
  const equipped: Record<string, string> = { ...holdings.equipped };
  delete equipped[key];
  return {
    ...holdings,
    equipped,
    inventory: { ...holdings.inventory, [current]: (own(holdings.inventory, current) ?? 0) + 1 },
  };
}

/** Bonus sources of a character's equipped items, in rules slot order. */
export function equippedSources(
  rules: RulesConfig,
  holdings: Holdings,
  items: Readonly<Record<string, ItemDef>>,
): BonusSource[] {
  const out: BonusSource[] = [];
  for (const slot of rules.economy.equipmentSlots) {
    for (let i = 0; i < slot.count; i++) {
      const key = slotKey(slot.id, i);
      const itemId = own(holdings.equipped, key);
      const def = itemId === undefined ? undefined : own(items, itemId);
      if (def && def.bonuses.length > 0) out.push(itemSource(def, key));
    }
  }
  return out;
}

/** Effective stats with equipped item bonuses (base → flat → percent → cap). */
export function itemEffectiveStats(
  rules: RulesConfig,
  base: Readonly<Record<string, number>>,
  holdings: Holdings,
  items: Readonly<Record<string, ItemDef>>,
): Record<string, number> {
  return effectiveStats(rules, base, equippedSources(rules, holdings, items));
}
