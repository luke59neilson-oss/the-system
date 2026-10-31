import { useState, type FormEvent } from 'react';
import type { CampaignState, Command, Entity } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  emptyEntityDraft,
  entityDefineCommand,
  entityDraftOf,
  entityEditCommand,
  identifiedOutcome,
  labelLeaks,
  type EntityDraft,
} from './bestiaryModel';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM bestiary and NPCs (ROADMAP M7.2, DESIGN §7 "Identify", D84, D123, D181):
 * every Identify entity with its GM name, player label, grade and level (the
 * Identify range), GM-only stats and notes, its one Identify text and its
 * category (MV.3); **Identified by…** ticks the characters who identified it at
 * the table, decides each result now and sends them an Identify notification.
 */
export function Bestiary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const nameOf = (id: string) => state.characters[id]?.name ?? id;
  const [query, setQuery] = useState('');
  const [entityId, setEntityId] = useState<string | null>(null);
  const current: Entity | null =
    entityId !== null && Object.prototype.hasOwnProperty.call(state.entities, entityId)
      ? (state.entities[entityId] ?? null)
      : null;
  const [draft, setDraft] = useState<EntityDraft>(emptyEntityDraft);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const categories = state.bestiaryCategoryOrder
    .map((id) => state.bestiaryCategories[id])
    .filter((c) => c !== undefined);
  const categoryName = (id: string | null) =>
    (id !== null ? state.bestiaryCategories[id]?.name : undefined) ?? 'Uncategorized';

  if (entityId !== null && current === null) {
    setEntityId(null);
    setDraft(emptyEntityDraft());
    setOutcome(null);
  }

  const command: Command | string | null = current
    ? entityEditCommand(state, current, draft)
    : entityDefineCommand(state, draft);
  const problem = typeof command === 'string' ? command : null;
  const leaks = labelLeaks(state, draft, current?.knownBy ?? []);
  const q = query.trim().toLowerCase();
  const shown = state.entityOrder
    .map((id) => state.entities[id])
    .filter((e): e is Entity => e !== undefined)
    .filter(
      (e) =>
        q === '' ||
        e.name.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q),
    );
  const tickedNow = ticked.filter((id) => ids.includes(id));

  const open = (e: Entity | null) => {
    setEntityId(e?.id ?? null);
    setDraft(e ? entityDraftOf(e) : emptyEntityDraft());
    setTicked([]);
    setOutcome(null);
  };
  const edit = (change: Partial<EntityDraft>) => {
    setOutcome(null);
    setDraft({ ...draft, ...change });
  };
  const run = async (c: Command, done: string) => {
    setBusy(true);
    const r = await client.command(c);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: done } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (command === null || typeof command === 'string' || busy) return;
    const name = draft.name.trim().replace(/\s+/gu, ' ');
    const ok = await run(command, current ? `${name} saved` : `${name} added to the bestiary`);
    if (ok && !current) setDraft(emptyEntityDraft());
  };
  const identified = async () => {
    if (!current || tickedNow.length === 0) return;
    const ok = await run(
      { type: 'entity.identify', entityId: current.id, characterIds: tickedNow },
      identifiedOutcome(state, current, tickedNow),
    );
    if (ok) setTicked([]);
  };
  const addCategory = async () => {
    const name = newCategory.trim();
    if (name === '') return;
    if (await run({ type: 'bestiary.categoryDefine', name }, `Category ${name} added`))
      setNewCategory('');
  };
  const removeCategory = (id: string, name: string) =>
    void run(
      { type: 'bestiary.categoryRemove', categoryId: id },
      `Category ${name} removed; its entries are Uncategorized`,
    );
  const knownLine = (e: Entity) =>
    e.knownBy.length === 0
      ? 'identified by nobody'
      : `identified by ${e.knownBy
          .map((id) => (e.worked[id] === true ? nameOf(id) : `${nameOf(id)} (???)`))
          .join(', ')}`;
  const rank = (e: Entity) =>
    e.grade === null || e.level === null ? 'no grade' : `(${e.grade}) lvl ${e.level}`;

  return (
    <section className="window bestiary" aria-labelledby="bestiary">
      <h2 id="bestiary">Bestiary and NPCs</h2>
      <div className="library-tools">
        <label>
          Search the bestiary
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, label or notes"
          />
        </label>
        <button type="button" onClick={() => open(null)} aria-pressed={current === null}>
          New entry
        </button>
      </div>
      <div className="bestiary-categories" role="group" aria-label="Bestiary categories">
        <span className="muted">Categories:</span>
        {categories.length === 0 && <span className="muted">none yet (all Uncategorized)</span>}
        {categories.map((c) => (
          <span key={c.id} className="bestiary-chip" data-testid="gm-bestiary-category">
            {c.name}{' '}
            <button
              type="button"
              className="bestiary-chip-remove"
              disabled={busy}
              aria-label={`Remove category ${c.name}`}
              onClick={() => removeCategory(c.id, c.name)}
            >
              ×
            </button>
          </span>
        ))}
        <label>
          <span className="sr-only">New category</span>
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addCategory();
              }
            }}
            placeholder="New category"
            maxLength={60}
          />
        </label>
        <button
          type="button"
          disabled={busy || newCategory.trim() === ''}
          onClick={() => void addCategory()}
        >
          Add category
        </button>
      </div>
      {state.entityOrder.length === 0 ? (
        <p className="muted">Nothing in the bestiary yet. Add the first entry below.</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing matches “{query.trim()}”.</p>
      ) : (
        <ul className="library-list" aria-label="Bestiary entries">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="library-item"
                aria-current={e.id === current?.id ? 'true' : undefined}
                onClick={() => open(e)}
              >
                <span className="skill-name">{e.name}</span>{' '}
                <span className="muted">
                  {[
                    e.label === e.name ? null : `players see “${e.label}”`,
                    rank(e),
                    categoryName(e.categoryId),
                    knownLine(e),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void save(e)} aria-labelledby="bestiary-form">
        <h3 id="bestiary-form">{current ? `Edit ${current.name}` : 'New entry'}</h3>
        <fieldset className="bestiary-fields" disabled={busy}>
          <label>
            Name (GM only)
            <input
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
              required
              maxLength={120}
            />
          </label>
          <label>
            Label players see (blank: the name)
            <input
              value={draft.label}
              onChange={(e) => edit({ label: e.target.value })}
              maxLength={120}
            />
          </label>
          <label>
            Category
            <select value={draft.categoryId} onChange={(e) => edit({ categoryId: e.target.value })}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="bestiary-rank">
            <label>
              Grade
              <select value={draft.grade} onChange={(e) => edit({ grade: e.target.value })}>
                <option value="">None (a place or energy)</option>
                {rules.grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Level
              <input
                inputMode="numeric"
                value={draft.level}
                onChange={(e) => edit({ level: e.target.value })}
                size={5}
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="bestiary-stats" disabled={busy}>
          <legend>Stats (GM only; blank: not given)</legend>
          {rules.stats.list.map((s) => (
            <label key={s.id}>
              {s.name}
              <input
                inputMode="numeric"
                value={draft.stats[s.id] ?? ''}
                onChange={(e) => edit({ stats: { ...draft.stats, [s.id]: e.target.value } })}
                size={6}
              />
            </label>
          ))}
        </fieldset>
        <label>
          Identify text (what the System tells whoever identifies it)
          <textarea
            value={draft.text}
            onChange={(e) => edit({ text: e.target.value })}
            rows={2}
            maxLength={1000}
            disabled={busy}
          />
        </label>
        <label>
          Notes (GM only)
          <textarea
            value={draft.notes}
            onChange={(e) => edit({ notes: e.target.value })}
            rows={2}
            maxLength={4000}
            disabled={busy}
          />
        </label>
        {leaks.length > 0 && (
          <p className="warn" role="note" data-testid="bestiary-label-leak">
            {leaks.join(', ')} cannot Identify it yet but still see its label: “
            {draft.label.trim() || draft.name.trim()}” gives away what it is. Use a vaguer label.
          </p>
        )}
        {problem && draft.name.trim() !== '' && (
          <p className="err" data-testid="bestiary-problem">
            {problem}
          </p>
        )}
        <button type="submit" disabled={busy || command === null || problem !== null}>
          {current ? 'Save entry' : 'Add entry'}
        </button>
      </form>
      {current && ids.length > 0 && (
        <fieldset
          className="title-award identified-by"
          aria-label={`Identified by… ${current.name}`}
          disabled={busy}
        >
          <legend>Identified by…</legend>
          {ids.map((id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={tickedNow.includes(id)}
                onChange={(e) =>
                  setTicked(
                    e.target.checked ? [...tickedNow, id] : tickedNow.filter((t) => t !== id),
                  )
                }
              />{' '}
              {nameOf(id)}
            </label>
          ))}
          <button type="button" disabled={tickedNow.length === 0} onClick={() => void identified()}>
            Mark identified
          </button>
          <span className="muted">
            Each result is decided now by the Identify range and kept; each gets a notification.
          </span>
        </fieldset>
      )}
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
    </section>
  );
}
