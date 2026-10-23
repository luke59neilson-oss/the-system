import { EconomyRuleError, type Bundle, type ItemDef } from './model';

/**
 * Loot tables (ROADMAP M6.2, DESIGN §7 "Items"). A table is a list of weighted
 * entries; a roll picks `rolls` entries with replacement, each with a count
 * between its min and max. Pure: the random source is injected, and a roll
 * is recorded as the picks it made so replay never rolls again.
 */

export type LootEntry =
  | {
      readonly kind: 'item';
      readonly itemId: string;
      readonly weight: number;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: 'currency';
      readonly weight: number;
      readonly min: number;
      readonly max: number;
    }
  | { readonly kind: 'nothing'; readonly weight: number };

export interface LootTable {
  readonly id: string;
  readonly name: string;
  /** Entries picked per roll (with replacement). */
  readonly rolls: number;
  readonly entries: readonly LootEntry[];
}

/** One pick of a roll: which entry, and how many of it. */
export interface LootPick {
  readonly entry: number;
  readonly count: number;
}

/** A loot roll as kept in state (GM-only). */
export interface LootRecord {
  readonly id: string;
  /** ISO-8601 UTC. */
  readonly at: string;
  readonly tableId: string;
  /** The table's name when rolled. */
  readonly tableName: string;
  /** Who received it; null = rolled for the GM only. */
  readonly characterId: string | null;
  readonly bundle: Bundle;
}

/** Most loot rolls kept in state; older ones stay in the event log. */
export const LOOT_LOG_LIMIT = 50;

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Checks a table against the item library: known items, positive weights, min ≤ max. */
export function validateLootTable(
  table: LootTable,
  items: Readonly<Record<string, ItemDef>>,
): void {
  if (table.entries.length === 0) throw new EconomyRuleError('A loot table needs an entry');
  table.entries.forEach((e, i) => {
    const at = `Entry ${i + 1}`;
    if (e.weight <= 0) throw new EconomyRuleError(`${at}: weight must be above 0`);
    if (e.kind === 'nothing') return;
    if (e.kind === 'item' && !own(items, e.itemId)) {
      throw new EconomyRuleError(`${at}: unknown item "${e.itemId}"`);
    }
    if (e.min > e.max) throw new EconomyRuleError(`${at}: min ${e.min} is above max ${e.max}`);
    if (e.kind === 'item' && e.min < 1) throw new EconomyRuleError(`${at}: items need min 1`);
  });
}

/** Rolls a table: `rolls` weighted picks, each with a count from min to max. `random` is in [0, 1). */
export function rollLoot(table: LootTable, random: () => number): LootPick[] {
  const total = table.entries.reduce((sum, e) => sum + e.weight, 0);
  const picks: LootPick[] = [];
  for (let r = 0; r < table.rolls; r++) {
    let ticket = unit(random) * total;
    let entry = table.entries.length - 1;
    for (let i = 0; i < table.entries.length; i++) {
      ticket -= (table.entries[i] as LootEntry).weight;
      if (ticket < 0) {
        entry = i;
        break;
      }
    }
    const e = table.entries[entry] as LootEntry;
    const count = e.kind === 'nothing' ? 0 : e.min + Math.floor(unit(random) * (e.max - e.min + 1));
    picks.push({ entry, count });
  }
  return picks;
}

function unit(random: () => number): number {
  const x = random();
  if (!(x >= 0 && x < 1)) throw new EconomyRuleError('The random source must return [0, 1)');
  return x;
}

/** What a roll's picks hand over; throws when a pick does not fit the table. */
export function lootBundle(table: LootTable, picks: readonly LootPick[]): Bundle {
  if (picks.length !== table.rolls) {
    throw new EconomyRuleError(`The table rolls ${table.rolls} times, not ${picks.length}`);
  }
  let currency = 0;
  // A Map, so no item id (not even "__proto__") can clash with an object key.
  const items = new Map<string, number>();
  for (const pick of picks) {
    const e = table.entries[pick.entry];
    if (!e) throw new EconomyRuleError(`No entry ${pick.entry + 1} on the table`);
    if (e.kind === 'nothing') {
      if (pick.count !== 0) throw new EconomyRuleError('A "nothing" pick has count 0');
      continue;
    }
    if (pick.count < e.min || pick.count > e.max) {
      throw new EconomyRuleError(
        `Entry ${pick.entry + 1} gives ${e.min}–${e.max}, not ${pick.count}`,
      );
    }
    if (pick.count === 0) continue;
    if (e.kind === 'currency') currency += pick.count;
    else items.set(e.itemId, (items.get(e.itemId) ?? 0) + pick.count);
  }
  return { currency, items: Object.fromEntries(items) };
}
