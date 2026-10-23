import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type CampaignState, type LootTable } from '@the-system/engine';
import {
  bundleText,
  draftProblem,
  emptyTableDraft,
  entryChances,
  parseEntry,
  recentRolls,
  tableDraftOf,
  tableSaveCommand,
  type TableDraft,
} from '../src/gm/lootTablesModel';

const table: LootTable = {
  id: 'hunter',
  name: 'Pale hunter drop',
  rolls: 2,
  entries: [
    { kind: 'item', itemId: 'pelt', weight: 6, min: 1, max: 3 },
    { kind: 'currency', weight: 3, min: 5, max: 20 },
    { kind: 'nothing', weight: 1 },
  ],
};

describe('loot tables model (M6.2)', () => {
  it('round-trips a table through its draft; an unchanged draft saves nothing', () => {
    const draft = tableDraftOf(table);
    expect(draft.entries.map(parseEntry)).toEqual(table.entries);
    expect(tableSaveCommand(draft, table)).toBeNull();
  });

  it('a new table defines; an edit sends only changed fields', () => {
    const draft: TableDraft = { ...tableDraftOf(table), name: ' Hunter ' };
    expect(tableSaveCommand(draft, null)).toEqual({
      type: 'lootTable.define',
      name: 'Hunter',
      rolls: 2,
      entries: table.entries,
    });
    expect(tableSaveCommand(draft, table)).toEqual({
      type: 'lootTable.edit',
      tableId: 'hunter',
      name: 'Hunter',
    });
    const fewer = {
      ...tableDraftOf(table),
      rolls: '1',
      entries: tableDraftOf(table).entries.slice(0, 1),
    };
    expect(tableSaveCommand(fewer, table)).toEqual({
      type: 'lootTable.edit',
      tableId: 'hunter',
      rolls: 1,
      entries: [table.entries[0]],
    });
  });

  it('names the first problem; invalid drafts save nothing', () => {
    const ok = tableDraftOf(table);
    expect(draftProblem(ok)).toBeNull();
    const cases: [TableDraft, string][] = [
      [{ ...ok, name: ' ' }, 'Name the table'],
      [{ ...ok, rolls: '0' }, 'Rolls'],
      [{ ...ok, rolls: '21' }, 'Rolls'],
      [{ ...ok, rolls: '1.5' }, 'Rolls'],
      [{ ...ok, entries: [] }, 'Add an entry'],
      [
        { ...emptyTableDraft(), name: 'X', entries: [{ ...ok.entries[0]!, itemId: '' }] },
        'choose an item',
      ],
      [{ ...ok, entries: [{ ...ok.entries[1]!, min: '9', max: '3' }] }, 'Entry 1'],
      [{ ...ok, entries: [{ ...ok.entries[0]!, min: '0' }] }, 'items at least 1'],
      [{ ...ok, entries: [ok.entries[0]!, { ...ok.entries[2]!, weight: '0' }] }, 'Entry 2'],
    ];
    for (const [draft, why] of cases) {
      expect(draftProblem(draft), why).toContain(why);
      expect(tableSaveCommand(draft, null)).toBeNull();
    }
  });

  it('shows each entry’s chance per pick', () => {
    expect(entryChances(tableDraftOf(table))).toEqual(['60%', '30%', '10%']);
    const d = tableDraftOf(table);
    expect(entryChances({ ...d, entries: [{ ...d.entries[0]!, weight: 'x' }] })).toEqual(['—']);
  });

  it('describes bundles and the latest rolls, newest first', () => {
    const state = {
      rules: DEFAULT_RULES,
      items: {
        pelt: {
          id: 'pelt',
          name: 'Pelt',
          rarity: 'common',
          description: '',
          slot: null,
          bonuses: [],
        },
      },
      characters: { jake: { name: 'Jake' } },
      lootLog: [
        {
          id: 'a',
          at: '',
          tableId: 'hunter',
          tableName: 'Drop',
          characterId: null,
          bundle: { currency: 0, items: {} },
        },
        {
          id: 'b',
          at: '',
          tableId: 'hunter',
          tableName: 'Drop',
          characterId: 'jake',
          bundle: { currency: 7, items: { pelt: 2 } },
        },
      ],
    } as unknown as CampaignState;
    expect(bundleText(state, { currency: 0, items: {} })).toBe('nothing');
    expect(recentRolls(state)).toEqual([
      { id: 'b', text: '[Drop] for Jake: 2 × [Pelt], 7 Credits' },
      { id: 'a', text: '[Drop] GM only: nothing' },
    ]);
  });
});
