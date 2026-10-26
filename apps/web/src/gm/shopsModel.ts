import type { CampaignState, Command, Shop } from '@the-system/engine';

const own = <T>(record: Readonly<Record<string, T>> | undefined, id: string | null): T | null =>
  record !== undefined && id !== null && Object.prototype.hasOwnProperty.call(record, id)
    ? (record[id] ?? null)
    : null;

export interface ShopWareRow {
  readonly itemId: string;
  readonly name: string;
  /** The item's rarity id (for its colour token). */
  readonly rarity: string;
  readonly price: number;
}

export interface ShopRow {
  readonly id: string;
  readonly name: string;
  /** The region's name, or '' when the shop has no place. */
  readonly place: string;
  readonly keeper: string;
  readonly hook: string;
  readonly wares: readonly ShopWareRow[];
}

/** MC.3: the campaign's shops in the order they were added, wares with their item names. */
export function shopRows(state: CampaignState): ShopRow[] {
  const shops = state.shops ?? {};
  return (state.shopOrder ?? [])
    .map((id) => own(shops, id))
    .filter((s): s is Shop => s !== null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      place: own(state.regions, s.regionId)?.name ?? '',
      keeper: s.keeper,
      hook: s.hook,
      wares: s.wares.flatMap((w) => {
        const item = own(state.items, w.itemId);
        return item
          ? [{ itemId: w.itemId, name: item.name, rarity: item.rarity, price: w.price }]
          : [];
      }),
    }));
}

/**
 * MC.3 (DESIGN §11 "Shops"): a sale is a GM trade the price list fills in.
 * The GM offers one of the ware and asks the price; the player accepts or
 * declines on their screen. Null when no character is chosen.
 */
export function saleCommand(characterId: string, ware: ShopWareRow): Command | null {
  if (characterId === '') return null;
  return {
    type: 'trade.propose',
    characterId: null,
    to: characterId,
    give: { items: { [ware.itemId]: 1 } },
    get: ware.price > 0 ? { currency: ware.price } : {},
  };
}
