import { useState, type FormEvent } from 'react';
import { titleKey, type CampaignState, type TitleDef } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { bonusPreview } from './itemLibraryModel';
import {
  describeTitleBonuses,
  emptyTitleDraft,
  holdersOf,
  libraryTitles,
  savedTitle,
  titleChangedSince,
  titleDraftOf,
  titleSaveCommand,
  type TitleDraft,
} from './titleLibraryModel';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM title library (ROADMAP M6.4, DESIGN §4 "Bonuses", §7 "Titles"): define
 * and edit titles (System text, percentage and optional flat bonuses; an
 * edit reaches every holder), and award a library title to a character. The
 * holder gets a DING with the title's text; percentages add up and apply once.
 */
export function TitleLibrary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const stats = rules.stats.list;
  const display = rules.stats;
  const [query, setQuery] = useState('');
  const [baseId, setBaseId] = useState<string | null>(null);
  const base =
    baseId !== null && Object.prototype.hasOwnProperty.call(state.titleLibrary, baseId)
      ? (state.titleLibrary[baseId] ?? null)
      : null;
  const [loaded, setLoaded] = useState<TitleDef | null>(null);
  const [draft, setDraft] = useState<TitleDraft>(emptyTitleDraft);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [who, setWho] = useState('');
  const characterId = ids.includes(who) ? who : (ids[0] ?? '');
  const shown = libraryTitles(state, query);
  const command = titleSaveCommand(draft, base ? (loaded ?? base) : null, stats);
  const stale = base !== null && loaded !== null && titleChangedSince(loaded, base);
  const holders = base ? holdersOf(state, base.name) : [];
  const target = state.characters[characterId];
  const alreadyHeld =
    base !== null &&
    target !== undefined &&
    target.titles.some((t) => titleKey(t) === titleKey(base.name));

  const open = (def: TitleDef | null) => {
    setBaseId(def?.id ?? null);
    setLoaded(def);
    setDraft(def ? titleDraftOf(def) : emptyTitleDraft());
    setOutcome(null);
  };
  const edit = (change: Partial<TitleDraft>) => {
    setOutcome(null);
    setDraft({ ...draft, ...change });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!command || busy) return;
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    const name = draft.name.trim().replace(/\s+/gu, ' ');
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    setOutcome({ ok: true, text: base ? `[${name}] saved` : `[${name}] added to the library` });
    if (base) setLoaded(savedTitle(loaded ?? base, command));
    else setDraft(emptyTitleDraft());
  };
  const award = async () => {
    if (!base || !target || alreadyHeld || busy) return;
    setBusy(true);
    const r = await client.command({ type: 'title.award', characterId, title: base.name });
    setBusy(false);
    if (!r.ok) return setOutcome({ ok: false, text: friendlyError(r.error) });
    setOutcome({ ok: true, text: `${target.name} earned [${base.name}]` });
  };

  return (
    <section className="window title-library" aria-labelledby="title-library">
      <h2 id="title-library">Title library</h2>
      <div className="library-tools">
        <label>
          Search titles
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or text"
          />
        </label>
        <button type="button" onClick={() => open(null)} aria-pressed={base === null}>
          New title
        </button>
      </div>
      {state.titleLibraryOrder.length === 0 ? (
        <p className="muted">No titles yet. Add the first one below.</p>
      ) : shown.length === 0 ? (
        <p className="muted">No title matches “{query.trim()}”.</p>
      ) : (
        <ul className="library-list" aria-label="Library titles">
          {shown.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                className="library-item"
                aria-current={def.id === base?.id ? 'true' : undefined}
                onClick={() => open(def)}
              >
                <span className="skill-name">[{def.name}]</span>{' '}
                <span className="muted">
                  {describeTitleBonuses(def.bonuses, stats, display) || 'no bonus'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void save(e)} aria-labelledby="title-library-form">
        <h3 id="title-library-form">{base ? `Edit [${base.name}]` : 'New title'}</h3>
        <fieldset className="title-fields" disabled={busy}>
          <label>
            Title name
            <input
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
              required
              maxLength={80}
            />
          </label>
          <label>
            System text (the holder sees this)
            <textarea
              value={draft.text}
              onChange={(e) => edit({ text: e.target.value })}
              maxLength={2000}
              rows={2}
              placeholder="You have propagated through the Host faster than any before you."
            />
          </label>
        </fieldset>
        <fieldset className="title-bonuses" disabled={busy}>
          <legend>
            Bonuses: percent of the stat (titles add up, applied once) and optional flat stat points
          </legend>
          <table>
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">%</th>
                <th scope="col">Flat (stat points)</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`${s.name} percent`}
                      value={draft.percent[s.id] ?? ''}
                      onChange={(e) =>
                        edit({ percent: { ...draft.percent, [s.id]: e.target.value } })
                      }
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      aria-label={`${s.name} flat`}
                      value={draft.flat[s.id] ?? ''}
                      onChange={(e) => edit({ flat: { ...draft.flat, [s.id]: e.target.value } })}
                    />
                    <span className="muted bonus-preview">
                      {bonusPreview(draft.flat[s.id], display)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        {stale && (
          <p className="muted" role="note">
            Changed elsewhere since you opened it. Saving changes only the fields you edited.{' '}
            <button type="button" className="secondary" onClick={() => base && open(base)}>
              Reload
            </button>
          </p>
        )}
        {base && holders.length > 0 && (
          <p className="muted" data-testid="title-holders">
            Held by {holders.join(', ')}. Edits reach every holder.
          </p>
        )}
        <button type="submit" disabled={busy || command === null}>
          {base ? 'Save title' : 'Add title'}
        </button>
      </form>
      {base && ids.length > 0 && (
        <div className="title-award" role="group" aria-label={`Award [${base.name}]`}>
          <label>
            Character to award
            <select
              value={characterId}
              onChange={(e) => {
                setOutcome(null);
                setWho(e.target.value);
              }}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {state.characters[id]?.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || alreadyHeld}
            onClick={() => void award()}
            title={alreadyHeld ? `${target?.name ?? ''} already holds it` : undefined}
          >
            Award title
          </button>
          {alreadyHeld && (
            <span className="muted" data-testid="title-already-held">
              {target?.name} already holds [{base.name}]
            </span>
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
