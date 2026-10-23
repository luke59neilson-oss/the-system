import { useState, type FormEvent } from 'react';
import type { CampaignState, LootTable } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  draftProblem,
  emptyEntry,
  emptyTableDraft,
  entryChances,
  recentRolls,
  tableDraftOf,
  tableSaveCommand,
  type EntryDraft,
  type EntryKind,
  type TableDraft,
} from './lootTablesModel';

type Outcome = { ok: boolean; text: string } | null;

const KINDS: readonly { id: EntryKind; label: string }[] = [
  { id: 'item', label: 'Item' },
  { id: 'currency', label: 'Currency' },
  { id: 'nothing', label: 'Nothing' },
];

/**
 * GM loot tables (ROADMAP M6.2, DESIGN §7 "Items"): define weighted tables of
 * items, currency and "nothing", then roll one for the GM's eyes or straight
 * into a character's inventory (a gift from the GM). Tables and rolls are GM-only.
 */
export function LootTables({ client, state }: { client: LiveClient; state: CampaignState }) {
  const currency = state.rules.economy.currencyName;
  const items = state.itemOrder.flatMap((id) => (state.items[id] ? [state.items[id]] : []));
  const firstItem = items[0]?.id ?? '';
  const [baseId, setBaseId] = useState<string | null>(null);
  const base =
    baseId !== null && Object.prototype.hasOwnProperty.call(state.lootTables, baseId)
      ? (state.lootTables[baseId] ?? null)
      : null;
  const [draft, setDraft] = useState<TableDraft>(() => emptyTableDraft(firstItem));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [who, setWho] = useState('');
  const recipient = who === '' || ids.includes(who) ? who : '';
  const command = tableSaveCommand(draft, base);
  const problem = draftProblem(draft);
  const chances = entryChances(draft);
  const rolls = recentRolls(state);

  const open = (table: LootTable | null) => {
    setBaseId(table?.id ?? null);
    setDraft(table ? tableDraftOf(table) : emptyTableDraft(firstItem));
    setOutcome(null);
  };
  const setEntry = (i: number, change: Partial<EntryDraft>) =>
    setDraft({
      ...draft,
      entries: draft.entries.map((e, j) => (j === i ? { ...e, ...change } : e)),
    });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!command) return;
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    const name = draft.name.trim();
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    setOutcome({ ok: true, text: base ? `[${name}] saved` : `[${name}] added` });
    if (!base) setDraft(emptyTableDraft(firstItem));
  };
  const roll = async () => {
    if (!base) return;
    setBusy(true);
    const r = await client.command({
      type: 'loot.roll',
      tableId: base.id,
      characterId: recipient === '' ? null : recipient,
    });
    setBusy(false);
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    const to = recipient === '' ? '' : ` for ${state.characters[recipient]?.name ?? ''}`;
    setOutcome({ ok: true, text: `Rolled [${base.name}]${to}` });
  };

  return (
    <section className="window loot-tables" aria-labelledby="loot-tables">
      <h2 id="loot-tables">Loot tables</h2>
      <div className="library-tools">
        <button type="button" onClick={() => open(null)} aria-pressed={base === null}>
          New table
        </button>
      </div>
      {state.lootTableOrder.length === 0 ? (
        <p className="muted">No loot tables yet. Add the first one below.</p>
      ) : (
        <ul className="library-list" aria-label="Loot tables">
          {state.lootTableOrder.map((id) => {
            const t = state.lootTables[id];
            if (!t) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="library-item"
                  aria-current={id === base?.id ? 'true' : undefined}
                  onClick={() => open(t)}
                >
                  [{t.name}]{' '}
                  <span className="muted">
                    ({t.entries.length} {t.entries.length === 1 ? 'entry' : 'entries'}, {t.rolls}{' '}
                    {t.rolls === 1 ? 'pick' : 'picks'})
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={(e) => void save(e)} aria-labelledby="loot-table-form">
        <h3 id="loot-table-form">{base ? `Edit [${base.name}]` : 'New loot table'}</h3>
        <label>
          Table name
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            maxLength={200}
          />
        </label>
        <label>
          Picks per roll
          <input
            inputMode="numeric"
            value={draft.rolls}
            onChange={(e) => setDraft({ ...draft, rolls: e.target.value })}
          />
        </label>
        <ol className="loot-entries" aria-label="Entries">
          {draft.entries.map((entry, i) => (
            <li key={i} role="group" aria-label={`Entry ${i + 1}`}>
              <label>
                Kind
                <select
                  aria-label="Kind"
                  value={entry.kind}
                  onChange={(e) => {
                    const kind = e.target.value as EntryKind;
                    setEntry(i, {
                      kind,
                      itemId: kind === 'item' && entry.itemId === '' ? firstItem : entry.itemId,
                      min: entry.min === '' ? '1' : entry.min,
                      max: entry.max === '' ? '1' : entry.max,
                    });
                  }}
                >
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.id === 'currency' ? currency : k.label}
                    </option>
                  ))}
                </select>
              </label>
              {entry.kind === 'item' && (
                <label>
                  Item
                  <select
                    aria-label="Item"
                    value={entry.itemId}
                    onChange={(e) => setEntry(i, { itemId: e.target.value })}
                  >
                    {entry.itemId === '' && <option value="">Choose an item</option>}
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Weight
                <input
                  inputMode="numeric"
                  value={entry.weight}
                  onChange={(e) => setEntry(i, { weight: e.target.value })}
                />
              </label>
              {entry.kind !== 'nothing' && (
                <>
                  <label>
                    Min
                    <input
                      inputMode="numeric"
                      value={entry.min}
                      onChange={(e) => setEntry(i, { min: e.target.value })}
                    />
                  </label>
                  <label>
                    Max
                    <input
                      inputMode="numeric"
                      value={entry.max}
                      onChange={(e) => setEntry(i, { max: e.target.value })}
                    />
                  </label>
                </>
              )}
              <span className="muted" data-testid="loot-chance">
                {chances[i]} per pick
              </span>
              <button
                type="button"
                className="secondary"
                aria-label={`Remove entry ${i + 1}`}
                disabled={draft.entries.length === 1}
                onClick={() =>
                  setDraft({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="secondary"
          disabled={draft.entries.length >= 50}
          onClick={() => setDraft({ ...draft, entries: [...draft.entries, emptyEntry(firstItem)] })}
        >
          Add entry
        </button>
        {problem && draft.name.trim() !== '' && (
          <p className="muted" role="note">
            {problem}
          </p>
        )}
        <button type="submit" disabled={busy || command === null}>
          {base ? 'Save changes' : 'Add table'}
        </button>
      </form>
      {base && (
        <div className="loot-roll" role="group" aria-label={`Roll [${base.name}]`}>
          <label>
            Roll for
            <select value={recipient} onChange={(e) => setWho(e.target.value)}>
              <option value="">GM only (nobody gets it)</option>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {state.characters[id]?.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void roll()}>
            Roll
          </button>
        </div>
      )}
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
      {rolls.length > 0 && (
        <>
          <h3 id="loot-recent">Recent rolls</h3>
          <ul aria-labelledby="loot-recent" className="loot-recent">
            {rolls.map((r) => (
              <li key={r.id} data-testid="loot-roll">
                {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
