import { useState, type FormEvent } from 'react';
import type { CampaignState, SkillDef } from '@the-system/engine';
import { friendlyError } from '../format';
import type { CommandResult, LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  draftOf,
  emptyDraft,
  librarySkills,
  saveCommand,
  type SkillDraft,
} from './skillLibraryModel';

/**
 * GM skill library (ROADMAP M4.1): browse, create and edit skills. A character
 * who gains a skill by this official name gets its description and flavour
 * (D90). Effects text stays GM-only.
 */
export function SkillLibrary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const rarities = state.rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;
  const [query, setQuery] = useState('');
  // null = a new skill; otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(() => emptyDraft(rarities));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const editing: SkillDef | null =
    editingId !== null && Object.prototype.hasOwnProperty.call(state.skillLibrary, editingId)
      ? (state.skillLibrary[editingId] ?? null)
      : null;
  const shown = librarySkills(state, query);
  const command = saveCommand(draft, editing);

  const open = (def: SkillDef | null) => {
    setEditingId(def?.id ?? null);
    setDraft(def ? draftOf(def) : emptyDraft(rarities));
    setResult(null);
  };
  const set = (field: keyof SkillDraft, value: string) => setDraft({ ...draft, [field]: value });
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
    setResult({ ok: true, text: editing ? `[${name}] saved` : `[${name}] added to the library` });
    if (!editing) setDraft(emptyDraft(rarities));
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
        <button type="button" onClick={() => open(null)} aria-pressed={editingId === null}>
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
                aria-current={def.id === editingId ? 'true' : undefined}
                onClick={() => open(def)}
              >
                <span className="skill-name">[{def.name}]</span>{' '}
                <span className="muted">({rarityName(def.rarity)})</span>
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
        <h3 id="skill-library-form">{editing ? `Edit [${editing.name}]` : 'New skill'}</h3>
        <label>
          Official name
          <input
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
          Effects (GM only)
          <textarea
            value={draft.effects}
            onChange={(e) => set('effects', e.target.value)}
            maxLength={4000}
            rows={3}
          />
        </label>
        <p className="muted hint">
          Characters who gain a skill with this name get its description and flavour, unless the
          skill already has its own. Editing here does not change skills already granted.
        </p>
        <button type="submit" disabled={busy || command === null || draft.name.trim() === ''}>
          {editing ? 'Save changes' : 'Add to library'}
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
