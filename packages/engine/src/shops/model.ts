/**
 * Shops (MC.3, DESIGN §11): GM-side bookkeeping for a place that sells
 * things. The GM narrates the shop; a purchase is a GM trade that the shop's
 * price list fills in. Nothing here reaches players.
 */

/** One thing a shop sells: an item from the library at a price in the campaign currency. */
export interface ShopWare {
  readonly itemId: string;
  /** Whole units of the campaign currency (rules.economy.currencyName). */
  readonly price: number;
}

export interface Shop {
  readonly id: string;
  readonly name: string;
  /** The region it stands in, or null. */
  readonly regionId: string | null;
  /** The keeper NPC in the GM's words (name, look, manner). */
  readonly keeper: string;
  readonly wares: readonly ShopWare[];
  /** An optional quest hook or complication; empty when none. */
  readonly hook: string;
  readonly createdAt: string;
}
