import { useRef, useState, type FormEvent } from 'react';
import type { CampaignState, SkillDef } from '@the-system/engine';
import { friendlyError } from '../format';
import type { CommandResult, LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  draftOf,
  draftProblem,
  emptyDraft,
  librarySkills,
  saveCommand,
  type SkillDraft,
} from './skillLibraryModel';

/**
 * GM skill library (ROADMAP M4.1): browse, create and edit skills. A character
 * who gains a skill by this official name and rarity gets its text, and later
 * edits follow to copies the GM has not hand-edited (MQ.12). Effects reach the
 * skill's owner only; on rules stored before MQ.12 they stay GM-only (D90).
 */
export function SkillLibrary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const rarities = state.rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;
  const [query, setQuery] = useState('');
  // null = a new skill; otherwise the entry as it was when the draft was loaded.
  const [base, setBase] = useState<SkillDef | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(() => emptyDraft(rarities));
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const stored: SkillDef | null =
    base !== null && Object.prototype.hasOwnProperty.call(state.skillLibrary, base.id)
      ? (state.skillLibrary[base.id] ?? null)
      : null;
  // Follow the entry when it changes elsewhere (another tab, an undo).
  if (base !== null && stored === null) {
    setBase(null);
    setResult({
      ok: false,
      text: `[${base.name}] is no longer in the library; the form now adds it as a new skill`,
    });
  } else if (base !== null && stored !== null && stored !== base) {
    // No local edits, or the draft now matches (our own save): adopt the new entry.
    if (saveCommand(draft, base) === null || saveCommand(draft, stored) === null) {
      setBase(stored);
      setDraft(draftOf(stored));
    }
  }
  const changedElsewhere = base !== null && stored !== null && stored !== base;
  const shown = librarySkills(state, query);
  // Edits send only the fields changed since the draft was loaded (D90).
  const command = saveCommand(draft, base);

  const open = (def: SkillDef | null) => {
    setBase(def);
    setDraft(def ? draftOf(def) : emptyDraft(rarities));
    setResult(null);
    nameInput.current?.focus();
  };
  const set = (field: Exclude<keyof SkillDraft, 'spell'>, value: string) =>
    setDraft({ ...draft, [field]: value });
  const problem = draftProblem(draft);
  const pools = state.rules.pools;
  const poolName = (id: string) => pools.find((p) => p.id === id)?.name ?? id;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!command) return;
    setBusy(true);
    const r: CommandResult = await client.command(command);
    setBusy(false);
    if (!r.ok) {
      setResult({ ok: false, text: friendlyError(r.error) });
      return;
    }
    const name = draft.name.trim();
    setResult({ ok: true, text: base ? `[${name}] saved` : `[${name}] added to the library` });
    if (!base) setDraft(emptyDraft(rarities));
  };

  return (
    <section className="window skill-library" aria-labelledby="skill-library">
      <h2 id="skill-library">Skill library</h2>
      <div className="library-tools">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, rarity or tag"
          />
        </label>
        <button type="button" onClick={() => open(null)} aria-pressed={base === null}>
          New skill
        </button>
      </div>
      {state.skillLibraryOrder.length === 0 ? (
        <p className="muted">No skills yet. Add the first one below.</p>
      ) : shown.length === 0 ? (
        <p className="muted">No skill matches “{query.trim()}”.</p>
      ) : (
        <ul className="library-list" aria-label="Library skills">
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
                {def.cost && (
                  <span className="muted skill-cost" data-testid="library-cost">
                    {' '}
                    · {def.cost.amount} {poolName(def.cost.pool)}
                  </span>
                )}
                {def.tags.length > 0 && (
                  <span className="library-tags">
                    {def.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} aria-labelledby="skill-library-form">
        <h3 id="skill-library-form">{base ? `Edit [${base.name}]` : 'New skill'}</h3>
        <label>
          Official name
          <input
            ref={nameInput}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label>
          Rarity
          <select value={draft.rarity} onChange={(e) => set('rarity', e.target.value)}>
            {rarities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input
            value={draft.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="Bow, Ranged"
          />
        </label>
        <label>
          Description (players see this)
          <textarea
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <label>
          Flavour (players see this)
          <input
            value={draft.flavor}
            onChange={(e) => set('flavor', e.target.value)}
            maxLength={1000}
          />
        </label>
        <label>
          {state.rules.skills.libraryByRarity
            ? 'Effects (only the skill’s owner sees this)'
            : 'Effects (GM only)'}
          <textarea
            value={draft.effects}
            onChange={(e) => set('effects', e.target.value)}
            maxLength={4000}
            rows={3}
          />
        </label>
        <fieldset className="spell-fields" data-testid="spell-fields">
          <legend>Spell (optional)</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.spell}
              onChange={(e) => setDraft({ ...draft, spell: e.target.checked })}
            />{' '}
            Spell (adds the “spell” tag)
          </label>
          <div className="spell-cost">
            <label>
              Cost pool
              <select value={draft.costPool} onChange={(e) => set('costPool', e.target.value)}>
                <option value="">No cost</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cost per use
              <input
                inputMode="numeric"
                value={draft.costAmount}
                onChange={(e) => set('costAmount', e.target.value)}
                placeholder="15"
                aria-invalid={problem !== null}
                aria-describedby={problem !== null ? 'skill-cost-problem' : undefined}
              />
            </label>
          </div>
          <label>
            Cooldown (shown, not enforced)
            <input
              value={draft.cooldown}
              onChange={(e) => set('cooldown', e.target.value)}
              maxLength={80}
              placeholder="10 seconds"
            />
          </label>
          <label>
            Range
            <input
              value={draft.range}
              onChange={(e) => set('range', e.target.value)}
              maxLength={80}
              placeholder="30 m, Touch"
            />
          </label>
          <label>
            Casting notes
            <textarea
              value={draft.castingNotes}
              onChange={(e) => set('castingNotes', e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </label>
          <p className="muted hint">
            The skill’s owner sees the cost, cooldown, range and notes on their sheet. Other players
            never do.
          </p>
          {problem !== null && (
            <p className="err" id="skill-cost-problem" role="alert">
              {problem}
            </p>
          )}
        </fieldset>
        {state.rules.skills.libraryByRarity ? (
          <p className="muted hint">
            One entry per name and rarity. Every character’s copy at this rarity shows its text,
            including after an upgrade, and follows your edits here, unless you wrote that
            character’s text by hand (Skill text).
          </p>
        ) : (
          <p className="muted hint">
            Characters who gain a skill with this name get its description and flavour, unless the
            skill already has its own. Editing here does not change skills already granted.
          </p>
        )}
        {changedElsewhere && stored && (
          <p className="err" role="alert">
            [{stored.name}] changed elsewhere since you opened it. Saving sends only the fields you
            changed.{' '}
            <button type="button" className="secondary" onClick={() => open(stored)}>
              Reload
            </button>
          </p>
        )}
        <button type="submit" disabled={busy || command === null || draft.name.trim() === ''}>
          {base ? 'Save changes' : 'Add to library'}
        </button>
        {result && (
          <p className={result.ok ? 'ok' : 'err'} role={result.ok ? 'status' : 'alert'}>
            {result.text}
          </p>
        )}
      </form>
    </section>
  );
}
