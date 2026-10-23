import type { CampaignState, Command, ItemDef } from '@the-system/engine';

/**
 * The GM's item library form (ROADMAP M6.1, DESIGN §7 "Items"). Pure helpers;
 * tested in itemLibraryModel.test.ts. Items give flat stat bonuses only
 * (DESIGN §4), so the draft holds one whole number per stat.
 */

export interface ItemDraft {
  name: string;
  rarity: string;
  description: string;
  /** Equipment slot id, or '' when the item cannot be equipped. */
  slot: string;
  /** Stat id → flat bonus as typed ('' = none). */
  bonuses: Record<string, string>;
}

export function emptyItemDraft(rarities: readonly { id: string }[]): ItemDraft {
  return { name: '', rarity: rarities[0]?.id ?? '', description: '', slot: '', bonuses: {} };
}

export function itemDraftOf(def: ItemDef): ItemDraft {
  const bonuses: Record<string, string> = {};
  for (const b of def.bonuses) if (b.flat) bonuses[b.stat] = String(b.flat);
  return {
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    slot: def.slot ?? '',
    bonuses,
  };
}

/** Typed bonuses in the rules' stat order; blanks and zeros dropped. null when one is not a whole number. */
export function parseBonuses(
  draft: ItemDraft,
  stats: readonly { id: string }[],
): { stat: string; flat: number }[] | null {
  const out: { stat: string; flat: number }[] = [];
  for (const { id } of stats) {
    const raw = (draft.bonuses[id] ?? '').trim();
    if (raw === '') continue;
    if (!/^[+-]?\d+$/u.test(raw)) return null;
    const flat = Number(raw);
    if (flat !== 0) out.push({ stat: id, flat });
  }
  return out;
}

const sameBonuses = (a: readonly { stat: string; flat?: number }[], b: typeof a) =>
  a.length === b.length && a.every((x, i) => x.stat === b[i]?.stat && x.flat === b[i]?.flat);

/**
 * The command that saves the draft: `item.define` for a new item, or an
 * `item.edit` carrying only the fields changed since `base` was loaded.
 * null when nothing would change or the draft is not valid.
 */
export function itemSaveCommand(
  draft: ItemDraft,
  base: ItemDef | null,
  stats: readonly { id: string }[],
): Command | null {
  const name = draft.name.trim();
  const bonuses = parseBonuses(draft, stats);
  if (name === '' || bonuses === null) return null;
  const description = draft.description.trim();
  const slot = draft.slot === '' ? null : draft.slot;
  if (base === null) {
    return { type: 'item.define', name, rarity: draft.rarity, description, slot, bonuses };
  }
  const edit: Extract<Command, { type: 'item.edit' }> = { type: 'item.edit', itemId: base.id };
  if (name !== base.name) edit.name = name;
  if (draft.rarity !== base.rarity) edit.rarity = draft.rarity;
  if (description !== base.description) edit.description = description;
  if (slot !== base.slot) edit.slot = slot;
  const baseBonuses = parseBonuses(itemDraftOf(base), stats) ?? [];
  if (!sameBonuses(bonuses, baseBonuses)) edit.bonuses = bonuses;
  return Object.keys(edit).length > 2 ? edit : null;
}

/** Library items in definition order, filtered by name or rarity name (case-insensitive). */
export function libraryItems(
  state: Pick<CampaignState, 'items' | 'itemOrder'> & {
    rules: { skills: { rarities: readonly { id: string; name: string }[] } };
  },
  query: string,
): ItemDef[] {
  const q = query.trim().toLowerCase();
  const rarityName = (id: string) =>
    state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  return state.itemOrder.flatMap((id) => {
    const def = Object.prototype.hasOwnProperty.call(state.items, id) ? state.items[id] : undefined;
    if (!def) return [];
    if (q === '') return [def];
    return [def.name, rarityName(def.rarity)].some((s) => s.toLowerCase().includes(q)) ? [def] : [];
  });
}

/** A signed give (+) or take (-) of `count` copies, or null when the count is not a positive whole number. */
export function adjustCommand(
  characterId: string,
  itemId: string,
  count: string,
  sign: 1 | -1,
): Command | null {
  if (!/^\d+$/u.test(count.trim())) return null;
  const n = Number(count.trim());
  if (n < 1) return null;
  return { type: 'holdings.adjust', characterId, items: { [itemId]: sign * n } };
}

/**
 * The item as it will read once `command` (from `itemSaveCommand`, diffed
 * against `loaded`) is applied: the form's new baseline after a save, so a
 * second save sends nothing and later edits elsewhere are not overwritten.
 */
export function savedDef(loaded: ItemDef, command: Command): ItemDef {
  if (command.type !== 'item.edit') return loaded;
  const { name, rarity, description, slot, bonuses } = command;
  return {
    ...loaded,
    ...(name !== undefined && { name }),
    ...(rarity !== undefined && { rarity }),
    ...(description !== undefined && { description }),
    ...(slot !== undefined && { slot }),
    ...(bonuses !== undefined && {
      bonuses: bonuses.map((b) => ({
        stat: b.stat,
        ...(b.flat !== undefined && { flat: b.flat }),
      })),
    }),
  };
}

/** True when the live item differs from the copy the form was opened from (another GM edit). */
export function changedSince(loaded: ItemDef, live: ItemDef): boolean {
  return JSON.stringify(loaded) !== JSON.stringify(live);
}

/** Names of the characters wearing `itemId`, in character order. */
export function wearersOf(
  state: Pick<CampaignState, 'characterOrder' | 'characters' | 'holdings'>,
  itemId: string,
): string[] {
  return state.characterOrder.flatMap((id) => {
    const c = Object.prototype.hasOwnProperty.call(state.characters, id)
      ? state.characters[id]
      : undefined;
    const h = Object.prototype.hasOwnProperty.call(state.holdings, id)
      ? state.holdings[id]
      : undefined;
    if (!c || !h) return [];
    return Object.values(h.equipped).includes(itemId) ? [c.name] : [];
  });
}

/** How one typed bonus reads on a sheet ("+0.5"), or '' when blank or not a whole number. */
export function bonusPreview(
  raw: string | undefined,
  display: { displayDivisor: number; displayDecimals: number },
): string {
  const t = (raw ?? '').trim();
  if (!/^[+-]?\d+$/u.test(t) || Number(t) === 0) return '';
  const v = Number(t) / display.displayDivisor;
  return `${v > 0 ? '+' : ''}${v.toFixed(display.displayDecimals)}`;
}
