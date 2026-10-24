import { useState, type FormEvent } from 'react';
import type { CampaignState, Command, Entity } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  emptyEntityDraft,
  entityDefineCommand,
  entityDraftOf,
  entityEditCommand,
  labelLeaks,
  revealOutcome,
  type EntityDraft,
} from './bestiaryModel';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM bestiary and NPCs (ROADMAP M7.2, DESIGN §7 "Identify", D84, D123, D181):
 * every Identify entity with its GM name, player label, grade and level (the
 * Identify range), GM-only stats and notes, and one Identify text per
 * rarity; reveal it to characters so they can Identify it.
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
  const [revealTo, setRevealTo] = useState('');

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
  const unknownTo = current ? ids.filter((id) => !current.knownBy.includes(id)) : [];
  const pickedReveal = revealTo === '' || unknownTo.includes(revealTo) ? revealTo : '';

  const open = (e: Entity | null) => {
    setEntityId(e?.id ?? null);
    setDraft(e ? entityDraftOf(e) : emptyEntityDraft());
    setRevealTo('');
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
  const reveal = () => {
    if (!current) return;
    const who = pickedReveal === '' ? unknownTo : [pickedReveal];
    void run(
      { type: 'entity.reveal', entityId: current.id, characterIds: who },
      revealOutcome(state, current, who),
    );
  };
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
                    e.knownBy.length === 0
                      ? 'known by nobody'
                      : `known by ${e.knownBy.map(nameOf).join(', ')}`,
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
        <fieldset className="bestiary-tiers" disabled={busy}>
          <legend>Identify text by the viewer’s Identify rarity (blank: none)</legend>
          {rules.skills.rarities
            .filter((r) => !r.reserved)
            .map((r) => (
              <label key={r.id}>
                {r.name}
                <textarea
                  value={draft.tiers[r.id] ?? ''}
                  onChange={(e) => edit({ tiers: { ...draft.tiers, [r.id]: e.target.value } })}
                  rows={1}
                  maxLength={2000}
                />
              </label>
            ))}
        </fieldset>
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
        <div className="title-award" role="group" aria-label={`Reveal ${current.name}`}>
          {unknownTo.length === 0 ? (
            <span className="muted">Every character can look it up.</span>
          ) : (
            <>
              <label>
                Reveal to
                <select value={pickedReveal} onChange={(e) => setRevealTo(e.target.value)}>
                  <option value="">Everyone who does not know it</option>
                  {unknownTo.map((id) => (
                    <option key={id} value={id}>
                      {nameOf(id)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy} onClick={reveal}>
                Reveal
              </button>
            </>
          )}
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
