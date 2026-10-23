import { useState, type FormEvent } from 'react';
import { holdingsOf, type CampaignState, type ItemDef } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  adjustCommand,
  emptyItemDraft,
  itemDraftOf,
  itemSaveCommand,
  libraryItems,
  type ItemDraft,
} from './itemLibraryModel';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM item library (ROADMAP M6.1, DESIGN §7 "Items"): browse, create and edit
 * items (rarity changes reach every copy, D58), and give or take copies.
 * Items give flat stat bonuses only; the item cap (DESIGN §4) applies on the
 * sheet, not here.
 */
export function ItemLibrary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const rarities = rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;
  const stats = rules.stats.list;
  const slots = rules.economy.equipmentSlots;
  const [query, setQuery] = useState('');
  // The item being edited, read live so a saved edit leaves nothing to save.
  const [baseId, setBaseId] = useState<string | null>(null);
  const base =
    baseId !== null && Object.prototype.hasOwnProperty.call(state.items, baseId)
      ? (state.items[baseId] ?? null)
      : null;
  const [draft, setDraft] = useState<ItemDraft>(() => emptyItemDraft(rarities));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [who, setWho] = useState('');
  const characterId = ids.includes(who) ? who : (ids[0] ?? '');
  const [count, setCount] = useState('1');
  const shown = libraryItems(state, query);
  const command = itemSaveCommand(draft, base, stats);

  const open = (def: ItemDef | null) => {
    setBaseId(def?.id ?? null);
    setDraft(def ? itemDraftOf(def) : emptyItemDraft(rarities));
    setOutcome(null);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!command) return;
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    const name = draft.name.trim();
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    setOutcome({ ok: true, text: base ? `[${name}] saved` : `[${name}] added to the library` });
    if (!base) setDraft(emptyItemDraft(rarities));
  };
  const adjust = async (sign: 1 | -1) => {
    if (!base) return;
    const c = adjustCommand(characterId, base.id, count, sign);
    if (!c) return;
    setBusy(true);
    const r = await client.command(c);
    setBusy(false);
    const name = state.characters[characterId]?.name ?? '';
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    setOutcome({
      ok: true,
      text:
        sign === 1
          ? `Gave ${count.trim()} × [${base.name}] to ${name}`
          : `Took ${count.trim()} × [${base.name}] from ${name}`,
    });
  };
  const held = base && characterId ? (holdingsOf(state, characterId).inventory[base.id] ?? 0) : 0;

  return (
    <section className="window item-library" aria-labelledby="item-library">
      <h2 id="item-library">Item library</h2>
      <div className="library-tools">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or rarity"
          />
        </label>
        <button type="button" onClick={() => open(null)} aria-pressed={base === null}>
          New item
        </button>
      </div>
      {state.itemOrder.length === 0 ? (
        <p className="muted">No items yet. Add the first one below.</p>
      ) : shown.length === 0 ? (
        <p className="muted">No item matches “{query.trim()}”.</p>
      ) : (
        <ul className="library-list" aria-label="Library items">
          {shown.map((def) => (
            <li key={def.id} className={`rarity-${cssToken(def.rarity)}`}>
              <button
                type="button"
                className="library-item"
                aria-current={def.id === base?.id ? 'true' : undefined}
                onClick={() => open(def)}
              >
                <span className="skill-name">[{def.name}]</span>{' '}
                <span className="muted">({rarityName(def.rarity)})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void save(e)} aria-labelledby="item-library-form">
        <h3 id="item-library-form">{base ? `Edit [${base.name}]` : 'New item'}</h3>
        <label>
          Name
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            maxLength={200}
          />
        </label>
        <label>
          Rarity
          <select
            value={draft.rarity}
            onChange={(e) => setDraft({ ...draft, rarity: e.target.value })}
          >
            {rarities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Slot
          <select value={draft.slot} onChange={(e) => setDraft({ ...draft, slot: e.target.value })}>
            <option value="">Not equippable</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description (players see this)
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            maxLength={2000}
            rows={2}
          />
        </label>
        <fieldset className="item-bonuses">
          <legend>Flat stat bonuses while equipped</legend>
          {stats.map((s) => (
            <label key={s.id}>
              {s.name}
              <input
                inputMode="numeric"
                value={draft.bonuses[s.id] ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, bonuses: { ...draft.bonuses, [s.id]: e.target.value } })
                }
              />
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={busy || command === null}>
          {base ? 'Save changes' : 'Add to library'}
        </button>
      </form>
      {base && ids.length > 0 && (
        <div className="item-give" role="group" aria-label={`Give or take [${base.name}]`}>
          <label>
            Character
            <select value={characterId} onChange={(e) => setWho(e.target.value)}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {state.characters[id]?.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Count
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <p className="muted" data-testid="item-held">
            {state.characters[characterId]?.name} holds {held}
          </p>
          <button type="button" disabled={busy} onClick={() => void adjust(1)}>
            Give
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || held === 0}
            onClick={() => void adjust(-1)}
          >
            Take
          </button>
        </div>
      )}
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
    </section>
  );
}
