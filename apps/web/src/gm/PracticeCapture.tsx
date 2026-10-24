import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CampaignState, PracticeEntry } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  actionCommand,
  actionTags,
  liveOffer,
  parseTags,
  signed,
  stabilityOffers,
  type PendingOffer,
  type StabilityOffer,
} from './questManagerModel';

type Outcome = { ok: boolean; text: string } | null;

/** Keyboard shortcut that jumps to the quick-add action field (Alt+P; by key position, so Option+P works on macOS). */
export const QUICK_ADD_CODE = 'KeyP';

/**
 * GM practice capture (ROADMAP M5.5, DESIGN §7): quick-add with a shortcut,
 * an end-of-scene prompt that walks the party one character at a time, and a
 * review of entries the GM has not looked at yet (player and montage
 * entries): correct, remove or mark them reviewed.
 */
export function PracticeCapture({ client, state }: { client: LiveClient; state: CampaignState }) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const [action, setAction] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [stat, setStat] = useState('');
  const [tags, setTags] = useState('');
  // M7.1 (D67): stability rules logged entries' tags match, kept until applied or dismissed.
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [scene, setScene] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAction, setEditAction] = useState('');
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [editStat, setEditStat] = useState('');
  const actionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === QUICK_ADD_CODE) {
        e.preventDefault();
        actionRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: string) => {
    setPicked(id);
    setSkills([]);
    setStat('');
  };
  const statName = (id: string | null) =>
    id === null ? '' : (state.rules.stats.list.find((s) => s.id === id)?.name ?? id);
  const nameOf = (id: string) => state.characters[id]?.name ?? id;
  const usesText = (e: PracticeEntry) =>
    [...e.skills.map((s) => `[${s}]`), statName(e.stat)].filter(Boolean).join(' + ');

  const run = async (command: Parameters<LiveClient['command']>[0], done: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: done } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || action.trim() === '') return;
    const entryTags = parseTags(tags);
    const ok = await run(
      {
        type: 'practice.log',
        characterId,
        action: action.trim(),
        skills,
        stat: stat === '' ? null : stat,
        ...(entryTags.length === 0 ? {} : { tags: entryTags }),
      },
      `Logged for ${character.name}: ${action.trim()}`,
    );
    if (!ok) return;
    const reason = `Practice: ${character.name}: ${action.trim()}`;
    const fresh = stabilityOffers(state, { tags: entryTags }).map((o, i) => ({
      key: `${Date.now()}-${i}-${o.questId}-${o.tag}`,
      reason,
      questId: o.questId,
      tag: o.tag,
    }));
    if (fresh.length > 0) setOffers((old) => [...old, ...fresh]);
    setAction('');
    setSkills([]);
    setStat('');
    setTags('');
    if (scene) {
      // End-of-scene prompt: move on to the next character, or finish.
      const next = ids[ids.indexOf(characterId) + 1];
      if (next) pick(next);
      else setScene(false);
    }
    actionRef.current?.focus();
  };

  const skipInScene = () => {
    const next = ids[ids.indexOf(characterId) + 1];
    if (next) pick(next);
    else setScene(false);
  };

  const pending = state.practice.filter((e) => !e.reviewed);
  const knownTags = actionTags(state);
  const shownOffers = offers
    .map((p) => ({ pending: p, live: liveOffer(state, p) }))
    .filter((x): x is { pending: PendingOffer; live: StabilityOffer } => x.live !== null);
  const applyOffer = async (p: PendingOffer, o: StabilityOffer) => {
    const c = actionCommand(o.questId, o.tag, '1', p.reason);
    if (typeof c === 'string') return;
    const ok = await run(c, `Applied "${o.tag}" (${signed(o.delta)}) to [${o.title}]`);
    if (ok) setOffers((old) => old.filter((x) => x.key !== p.key));
  };

  return (
    <section className="window practice-capture" aria-labelledby="practice-capture-heading">
      <h2 id="practice-capture-heading">Practice</h2>
      {ids.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <>
          {outcome && (
            <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
              {outcome.text}
            </p>
          )}
          {scene ? (
            <p className="scene-prompt" data-testid="scene-prompt">
              <strong>End of scene:</strong> what did {character?.name} practise? (
              {ids.indexOf(characterId) + 1} of {ids.length}){' '}
              <button type="button" onClick={skipInScene}>
                Nothing for {character?.name}
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setScene(true);
                pick(ids[0] ?? '');
                actionRef.current?.focus();
              }}
            >
              End scene: log practice
            </button>
          )}
          <form onSubmit={(e) => void add(e)} aria-label="Quick-add practice">
            <label>
              Character
              <select value={characterId} onChange={(e) => pick(e.target.value)}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action <span className="muted">(Alt+P)</span>
              <input ref={actionRef} value={action} onChange={(e) => setAction(e.target.value)} />
            </label>
            <fieldset>
              <legend>Skills used</legend>
              {character?.skills.map((s) => (
                <label key={s.name} className="check">
                  <input
                    type="checkbox"
                    checked={skills.includes(s.name)}
                    onChange={(e) =>
                      setSkills(
                        e.target.checked ? [...skills, s.name] : skills.filter((n) => n !== s.name),
                      )
                    }
                  />
                  [{s.name}]
                </label>
              ))}
            </fieldset>
            <label>
              Stat
              <select value={stat} onChange={(e) => setStat(e.target.value)}>
                <option value="">None</option>
                {state.rules.stats.list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action tags{' '}
              <span className="muted">(comma-separated; quest tags offer stability)</span>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                list="practice-quest-tags"
              />
              <datalist id="practice-quest-tags">
                {knownTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <button
              type="submit"
              disabled={busy || action.trim() === '' || (skills.length === 0 && stat === '')}
            >
              Log practice
            </button>
          </form>
          {shownOffers.length > 0 && (
            <div
              className="stability-offers"
              role="group"
              aria-label="Apply World Stability"
              data-testid="stability-offers"
            >
              <p>Practice carried a quest's action tag. Apply its World Stability rule?</p>
              <ul>
                {shownOffers.map(({ pending: p, live: o }) => (
                  <li key={p.key}>
                    <span className="muted">{p.reason.replace(/^Practice: /u, '')}</span>{' '}
                    <button type="button" disabled={busy} onClick={() => void applyOffer(p, o)}>
                      Apply "{o.tag}" ({signed(o.delta)}) to [{o.title}]
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="secondary" onClick={() => setOffers([])}>
                Not now
              </button>
            </div>
          )}
          <h3>To review ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="muted">Nothing waiting: player and montage entries appear here.</p>
          ) : (
            <>
              <ul className="practice-review" aria-label="Practice to review">
                {pending.map((e) => (
                  <li key={e.id}>
                    {editing === e.id ? (
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          void run(
                            {
                              type: 'practice.edit',
                              entryId: e.id,
                              action: editAction.trim(),
                              skills: editSkills,
                              stat: editStat === '' ? null : editStat,
                            },
                            `Corrected: ${editAction.trim()}`,
                          ).then((ok) => ok && setEditing(null));
                        }}
                      >
                        <label>
                          Action
                          <input
                            value={editAction}
                            onChange={(ev) => setEditAction(ev.target.value)}
                          />
                        </label>
                        <fieldset>
                          <legend>Skills used</legend>
                          {[
                            ...new Set([
                              ...(state.characters[e.characterId]?.skills.map((sk) => sk.name) ??
                                []),
                              ...e.skills,
                            ]),
                          ].map((n) => (
                            <label key={n} className="check">
                              <input
                                type="checkbox"
                                checked={editSkills.includes(n)}
                                onChange={(ev) =>
                                  setEditSkills(
                                    ev.target.checked
                                      ? [...editSkills, n]
                                      : editSkills.filter((x) => x !== n),
                                  )
                                }
                              />
                              [{n}]
                            </label>
                          ))}
                        </fieldset>
                        <label>
                          Stat
                          <select value={editStat} onChange={(ev) => setEditStat(ev.target.value)}>
                            <option value="">None</option>
                            {state.rules.stats.list.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          disabled={
                            busy ||
                            editAction.trim() === '' ||
                            (editSkills.length === 0 && editStat === '')
                          }
                        >
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span>
                          {nameOf(e.characterId)}: {e.action} · {usesText(e)}
                          {e.source === 'montage' ? ' (montage focus)' : ''}
                        </span>
                        <span className="practice-review-actions">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                { type: 'practice.review', entryIds: [e.id] },
                                `Reviewed: ${e.action}`,
                              )
                            }
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditing(e.id);
                              setEditAction(e.action);
                              setEditSkills([...e.skills]);
                              setEditStat(e.stat ?? '');
                            }}
                          >
                            Edit
                          </button>
                          {e.source !== 'montage' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  { type: 'practice.remove', entryId: e.id },
                                  `Removed: ${e.action}`,
                                )
                              }
                            >
                              Remove
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'practice.review', entryIds: pending.slice(0, 500).map((e) => e.id) },
                    `Marked ${Math.min(pending.length, 500)} reviewed`,
                  )
                }
              >
                Mark all reviewed
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
