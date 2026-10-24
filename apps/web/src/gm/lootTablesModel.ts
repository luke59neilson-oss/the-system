import type { Bundle, CampaignState, Command, LootEntry, LootTable } from '@the-system/engine';

/**
 * The GM's loot tables (ROADMAP M6.2, DESIGN §7 "Items"). Pure helpers; tested
 * in lootTablesModel.test.ts. A draft holds what the GM typed; a save sends
 * `lootTable.define` or `lootTable.edit` with the whole changed field.
 */

export type EntryKind = LootEntry['kind'];

export interface EntryDraft {
  kind: EntryKind;
  /** Item id ('' until chosen); used by item entries only. */
  itemId: string;
  weight: string;
  min: string;
  max: string;
}

export interface TableDraft {
  name: string;
  rolls: string;
  entries: EntryDraft[];
}

export const emptyEntry = (itemId = ''): EntryDraft => ({
  kind: itemId ? 'item' : 'currency',
  itemId,
  weight: '1',
  min: '1',
  max: '1',
});

export const emptyTableDraft = (itemId = ''): TableDraft => ({
  name: '',
  rolls: '1',
  entries: [emptyEntry(itemId)],
});

export function tableDraftOf(table: LootTable): TableDraft {
  return {
    name: table.name,
    rolls: String(table.rolls),
    entries: table.entries.map((e) =>
      e.kind === 'nothing'
        ? { kind: 'nothing', itemId: '', weight: String(e.weight), min: '', max: '' }
        : {
            kind: e.kind,
            itemId: e.kind === 'item' ? e.itemId : '',
            weight: String(e.weight),
            min: String(e.min),
            max: String(e.max),
          },
    ),
  };
}

const whole = (raw: string): number | null =>
  /^\d+$/u.test(raw.trim()) ? Number(raw.trim()) : null;

/** One entry as the engine takes it; null when a number is missing or not whole. */
export function parseEntry(draft: EntryDraft): LootEntry | null {
  const weight = whole(draft.weight);
  if (weight === null || weight < 1) return null;
  if (draft.kind === 'nothing') return { kind: 'nothing', weight };
  const min = whole(draft.min);
  const max = whole(draft.max);
  if (min === null || max === null || min > max) return null;
  if (draft.kind === 'currency') return { kind: 'currency', weight, min, max };
  if (draft.itemId === '' || min < 1) return null;
  return { kind: 'item', itemId: draft.itemId, weight, min, max };
}

/** Why a draft cannot be saved yet, or null when it can. */
export function draftProblem(draft: TableDraft): string | null {
  if (draft.name.trim() === '') return 'Name the table';
  const rolls = whole(draft.rolls);
  if (rolls === null || rolls < 1 || rolls > 20) return 'Rolls must be a whole number from 1 to 20';
  if (draft.entries.length === 0) return 'Add an entry';
  const bad = draft.entries.findIndex((e) => parseEntry(e) === null);
  if (bad >= 0) {
    const e = draft.entries[bad] as EntryDraft;
    const why =
      e.kind === 'item' && e.itemId === ''
        ? 'choose an item'
        : 'weight at least 1, whole numbers, min no more than max' +
          (e.kind === 'item' ? ', items at least 1' : '');
    return `Entry ${bad + 1}: ${why}`;
  }
  return null;
}

const sameEntries = (a: readonly LootEntry[], b: readonly LootEntry[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The command that saves the draft: `lootTable.define` for a new table, or a
 * `lootTable.edit` carrying only the fields changed since `base`. null when
 * nothing would change or the draft is not valid.
 */
export function tableSaveCommand(draft: TableDraft, base: LootTable | null): Command | null {
  if (draftProblem(draft) !== null) return null;
  const name = draft.name.trim();
  const rolls = Number(draft.rolls.trim());
  const entries = draft.entries.map((e) => parseEntry(e) as LootEntry);
  if (!base) return { type: 'lootTable.define', name, rolls, entries };
  const command: Extract<Command, { type: 'lootTable.edit' }> = {
    type: 'lootTable.edit',
    tableId: base.id,
  };
  if (name !== base.name) command.name = name;
  if (rolls !== base.rolls) command.rolls = rolls;
  if (!sameEntries(entries, base.entries)) command.entries = entries;
  return Object.keys(command).length > 2 ? command : null;
}

/** Each entry's chance per pick, as a whole percent ("—" when it cannot be worked out). */
export function entryChances(draft: TableDraft): string[] {
  const weights = draft.entries.map((e) => whole(e.weight) ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total > 0 && w > 0 ? `${Math.round((100 * w) / total)}%` : '—'));
}

/** "2 × [Pelt], 20 Credits", or "nothing". */
export function bundleText(state: Pick<CampaignState, 'items' | 'rules'>, bundle: Bundle): string {
  const parts = Object.entries(bundle.items).map(
    ([id, n]) => `${n} × [${state.items[id]?.name ?? id}]`,
  );
  if (bundle.currency > 0) parts.push(`${bundle.currency} ${state.rules.economy.currencyName}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

/** The latest rolls, newest first. */
export function recentRolls(
  state: Pick<CampaignState, 'lootLog' | 'characters' | 'items' | 'rules'>,
  limit = 10,
): { id: string; text: string }[] {
  return [...state.lootLog]
    .reverse()
    .slice(0, limit)
    .map((r) => {
      const who =
        r.characterId === null
          ? 'GM only'
          : `for ${state.characters[r.characterId]?.name ?? r.characterId}`;
      return { id: r.id, text: `[${r.tableName}] ${who}: ${bundleText(state, r.bundle)}` };
    });
}
