import { useRef, useState, type FormEvent } from 'react';
import { MAX_PROFESSION_SKILLS, type CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  KIND_LABEL,
  classRarities,
  draftOf,
  draftProblem,
  emptyDraft,
  entriesOf,
  missingDefaults,
  saveCommand,
  searchEntries,
  unsavedChanges,
  weightSummary,
  type OriginDef,
  type OriginDraft,
  type OriginKind,
} from './originLibraryModel';

const KINDS: readonly OriginKind[] = ['class', 'race', 'profession'];

/**
 * GM class, race and profession libraries (ROADMAP M4.2). New characters pick
 * their starting class and race from here; professions wait for the E-grade
 * evolution. Editing an entry never changes a character who already has it.
 */
export function OriginLibrary({ client, state }: { client: LiveClient; state: CampaignState }) {
  const rules = state.rules;
  const [kind, setKind] = useState<OriginKind>('class');
  const [query, setQuery] = useState('');
  // null = a new entry; otherwise the entry as it was when the draft was loaded.
  const [base, setBase] = useState<OriginDef | null>(null);
  const [draft, setDraft] = useState<OriginDraft>(() => emptyDraft('class', rules));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const label = KIND_LABEL[kind];

  const stored: OriginDef | null =
    base === null ? null : (entriesOf(state, kind).find((d) => d.id === base.id) ?? null);
  // Follow the entry when it changes elsewhere (another tab, an undo).
  if (base !== null && stored === null) {
    setBase(null);
    setResult({
      ok: false,
      text: `[${base.name}] is no longer in the library; the form now adds it as a new ${label.one}`,
    });
  } else if (base !== null && stored !== null && stored !== base) {
    if (!unsavedChanges(kind, draft, base, rules) || !unsavedChanges(kind, draft, stored, rules)) {
      setBase(stored);
      setDraft(draftOf(kind, stored, rules));
    }
  }
  const changedElsewhere = base !== null && stored !== null && stored !== base;
  const shown = searchEntries(state, kind, query);
  const total = entriesOf(state, kind).length;
  const command = saveCommand(kind, draft, base, rules);
  const problem = draftProblem(kind, draft);
  const missing = missingDefaults(state);
  const rarities =
    kind === 'class' ? classRarities(rules) : rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;

  // Unsaved work in the form: a second click on the same target discards it.
  const dirty =
    base === null
      ? JSON.stringify(draft) !== JSON.stringify(emptyDraft(kind, rules))
      : unsavedChanges(kind, draft, base, rules);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);
  const guard = (target: string) => {
    if (dirty && pendingDiscard !== target) {
      setPendingDiscard(target);
      return false;
    }
    setPendingDiscard(null);
    return true;
  };
  const switchKind = (next: OriginKind) => {
    if (next === kind || !guard(`kind:${next}`)) return;
    setKind(next);
    setBase(null);
    setDraft(emptyDraft(next, rules));
    setQuery('');
    setResult(null);
  };
  const open = (def: OriginDef | null, force = false) => {
    if (!force && !guard(`open:${def?.id ?? 'new'}`)) return;
    setPendingDiscard(null);
    setBase(def);
    setDraft(def ? draftOf(kind, def, rules) : emptyDraft(kind, rules));
    setResult(null);
    nameInput.current?.focus();
  };
  const setSkill = (index: number, field: 'name' | 'rarity', value: string) =>
    setDraft({
      ...draft,
      skills: draft.skills.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    });
  const send = async (cmd: { type: string } & Record<string, unknown>, okText: string) => {
    setBusy(true);
    const r = await client.command(cmd);
    setBusy(false);
    setResult(r.ok ? { ok: true, text: okText } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!command) return;
    const name = draft.name.trim();
    const saved = await send(command, base ? `[${name}] saved` : `[${name}] added to the library`);
    if (saved && !base) setDraft(emptyDraft(kind, rules));
  };

  return (
    <section className="window origin-library" aria-labelledby="origin-library">
      <h2 id="origin-library">Classes, races and professions</h2>
      <div className="library-tabs" role="group" aria-label="Library">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="secondary"
            aria-pressed={k === kind}
            onClick={() => switchKind(k)}
          >
            {KIND_LABEL[k].many} ({entriesOf(state, k).length})
          </button>
        ))}
        {missing > 0 && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void send(
                { type: 'library.seedDefaults' },
                `Added ${missing} default ${missing === 1 ? 'entry' : 'entries'}`,
              )
            }
          >
            Add the default set ({missing} missing)
          </button>
        )}
      </div>
      <div className="library-tools">
        <label>
          Search {label.many.toLowerCase()}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, description or skill"
          />
        </label>
        <button type="button" onClick={() => open(null)} aria-pressed={base === null}>
          New {label.one}
        </button>
      </div>
      {pendingDiscard !== null && dirty && (
        <p className="err" role="alert">
          The form has unsaved changes. Click again to discard them, or save first.
        </p>
      )}
      {total === 0 ? (
        <p
          className={kind === 'class' ? 'err' : 'muted'}
          role={kind === 'class' ? 'note' : undefined}
        >
          {kind === 'profession'
            ? 'No professions yet. There is no default list: professions are tailored to each character at the E-grade evolution. Add your ideas below.'
            : `No ${label.many.toLowerCase()} yet. Add one below or add the default set.`}
          {kind === 'class' && ' Until then new characters start from the six built-in classes.'}
        </p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing matches “{query.trim()}”.</p>
      ) : (
        <ul className="library-list" aria-label={`Library ${label.many.toLowerCase()}`}>
          {shown.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                className="library-item"
                aria-current={def.id === base?.id ? 'true' : undefined}
                onClick={() => open(def)}
              >
                <span className="skill-name">[{def.name}]</span>
                {def.description && <span className="library-desc">{def.description}</span>}
                {'skills' in def && def.skills.length > 0 && (
                  <span className="library-tags">
                    {def.skills.map((s) => (
                      <span key={s.name} className={`tag rarity-${cssToken(s.rarity)}`}>
                        {s.name} ({rarityName(s.rarity)})
                      </span>
                    ))}
                  </span>
                )}
                {'weights' in def && (
                  <span className="library-desc muted">{weightSummary(rules, def.weights)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} aria-labelledby="origin-library-form">
        <h3 id="origin-library-form">{base ? `Edit [${base.name}]` : `New ${label.one}`}</h3>
        <label>
          {label.title} name
          <input
            ref={nameInput}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            maxLength={200}
          />
        </label>
        <label>
          Description (GM only for now)
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            maxLength={2000}
            rows={2}
          />
        </label>
        {kind !== 'race' && (
          <fieldset className="library-skills">
            <legend>
              {kind === 'class'
                ? `Starting skills (exactly ${rules.skills.startingClassSkillCount})`
                : 'Skill ideas for selection menus'}
            </legend>
            {draft.skills.map((skill, i) => (
              <div className="library-skill-row" key={i}>
                <label>
                  Skill {i + 1}
                  <input
                    value={skill.name}
                    onChange={(e) => setSkill(i, 'name', e.target.value)}
                    maxLength={200}
                  />
                </label>
                <label>
                  Skill {i + 1} rarity
                  <select
                    value={skill.rarity}
                    onChange={(e) => setSkill(i, 'rarity', e.target.value)}
                  >
                    {rarities.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {kind === 'profession' && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove skill ${i + 1}`}
                    onClick={() =>
                      setDraft({ ...draft, skills: draft.skills.filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {kind === 'profession' && draft.skills.length < MAX_PROFESSION_SKILLS && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    skills: [...draft.skills, { name: '', rarity: rarities[0]?.id ?? '' }],
                  })
                }
              >
                Add a skill idea
              </button>
            )}
            {kind === 'class' && (
              <p className="muted hint">
                Rarities up to {rarityName(rules.grades[0]?.rarityCeiling ?? '')} (the{' '}
                {rules.grades[0]?.id}-grade ceiling). Skill text comes from the skill library.
              </p>
            )}
          </fieldset>
        )}
        {kind === 'class' && (
          <fieldset className="library-weights">
            <legend>Stat weights (share of each level’s class spread)</legend>
            {rules.stats.list.map((stat) => (
              <label key={stat.id}>
                {stat.name}
                <input
                  inputMode="numeric"
                  value={draft.weights[stat.id] ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, weights: { ...draft.weights, [stat.id]: e.target.value } })
                  }
                  maxLength={4}
                />
              </label>
            ))}
          </fieldset>
        )}
        <p className="muted hint">
          {kind === 'profession'
            ? 'Professions are offered at the evolution into the E-grade.'
            : `New characters copy the ${label.one} when they are created; editing it later does not change them.`}
        </p>
        {changedElsewhere && stored && (
          <p className="err" role="alert">
            [{stored.name}] changed elsewhere since you opened it. Saving sends only the fields you
            changed.{' '}
            <button type="button" className="secondary" onClick={() => open(stored, true)}>
              Reload
            </button>
          </p>
        )}
        {problem && draft.name.trim() !== '' && (
          <p className="muted" role="note">
            {problem}
          </p>
        )}
        <button type="submit" disabled={busy || command === null}>
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
