import { useState, type FormEvent } from 'react';
import { daysLeft, type CampaignState, type Command, type Quest } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  actionCommand,
  emptyQuestDraft,
  nudgeCommand,
  questCreateCommand,
  questDraftOf,
  questEditCommand,
  signed,
  type QuestDraft,
} from './questManagerModel';

type Outcome = { ok: boolean; text: string } | null;

/** Same editable fields (the stability value and status move without the form). */
const sameForm = (a: Quest, b: Quest) =>
  JSON.stringify(questDraftOf(a)) === JSON.stringify(questDraftOf(b));

function timeText(q: Quest, day: number): string {
  const left = daysLeft(q, day);
  if (left === null) return 'No timer';
  if (left <= 0) return 'Time is up';
  return `${left} ${left === 1 ? 'day' : 'days'} left`;
}

/**
 * GM quest manager (ROADMAP M7.1, DESIGN §7 "Quests", D67, D122, D180): list
 * every quest, create and edit them (text, timer, visibility, World
 * Stability rules and gauge visibility, and for a hidden quest who gets the
 * notice), complete, fail or reopen them, and move stability by a tagged
 * action or a manual nudge.
 */
export function QuestManager({ client, state }: { client: LiveClient; state: CampaignState }) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const nameOf = (id: string) => state.characters[id]?.name ?? id;
  const [questId, setQuestId] = useState<string | null>(null);
  const current =
    questId !== null && Object.prototype.hasOwnProperty.call(state.quests, questId)
      ? (state.quests[questId] ?? null)
      : null;
  const [loaded, setLoaded] = useState<Quest | null>(null);
  const [draft, setDraft] = useState<QuestDraft>(() =>
    emptyQuestDraft(state.rules.stability.visibleToPlayersByDefault),
  );
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [tag, setTag] = useState('');
  const [count, setCount] = useState('1');
  const [actionReason, setActionReason] = useState('');
  const [delta, setDelta] = useState('');
  const [nudgeReason, setNudgeReason] = useState('');

  const baseline = current ? (loaded ?? current) : null;
  const command: Command | string | null = baseline
    ? questEditCommand(baseline, draft)
    : questCreateCommand(draft);
  const problem = typeof command === 'string' ? command : null;
  const stale = current !== null && loaded !== null && !sameForm(loaded, current);
  const rulesOf = current?.stability?.rules ?? {};
  const tags = Object.keys(rulesOf);
  const pickedTag = tags.includes(tag) ? tag : (tags[0] ?? '');
  const hasStability = current ? current.stability !== null : draft.rules.trim() !== '';

  const open = (q: Quest | null) => {
    setQuestId(q?.id ?? null);
    setLoaded(q);
    setDraft(
      q ? questDraftOf(q) : emptyQuestDraft(state.rules.stability.visibleToPlayersByDefault),
    );
    setTag('');
    setCount('1');
    setDelta('');
    setActionReason('');
    setNudgeReason('');
    setOutcome(null);
  };
  const edit = (change: Partial<QuestDraft>) => {
    setOutcome(null);
    if (current && loaded === null) setLoaded(current);
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
    const title = draft.title.trim().replace(/\s+/gu, ' ');
    const ok = await run(command, current ? `[${title}] saved` : `[${title}] added`);
    if (!ok) return;
    if (current) setLoaded(null);
    else setDraft(emptyQuestDraft(state.rules.stability.visibleToPlayersByDefault));
  };
  const setStatus = (status: Quest['status']) => {
    if (!current) return;
    const label = { active: 'reopened', completed: 'completed', failed: 'failed' }[status];
    void run(
      { type: 'quest.setStatus', questId: current.id, status },
      `[${current.title}] ${label}`,
    );
  };
  const applyAction = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const c = actionCommand(current.id, pickedTag, count, actionReason);
    if (typeof c === 'string') return setOutcome({ ok: false, text: c });
    const times = Number(count.trim());
    const ok = await run(
      c,
      `Applied "${pickedTag}"${times > 1 ? ` × ${times}` : ''} to [${current.title}]`,
    );
    if (ok) {
      setCount('1');
      setActionReason('');
    }
  };
  const doNudge = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const c = nudgeCommand(current.id, delta, nudgeReason);
    if (typeof c === 'string') return setOutcome({ ok: false, text: c });
    const ok = await run(c, `Nudged [${current.title}] by ${signed(Number(delta.trim()))}`);
    if (ok) {
      setDelta('');
      setNudgeReason('');
    }
  };
  const noticeSome = draft.noticeTo !== null;

  return (
    <section className="window quest-manager" aria-labelledby="quest-manager">
      <h2 id="quest-manager">Quests</h2>
      <div className="library-tools">
        <span className="muted" data-testid="quest-day">
          Day {state.day}
        </span>
        <button type="button" onClick={() => open(null)} aria-pressed={current === null}>
          New quest
        </button>
      </div>
      {state.questOrder.length === 0 ? (
        <p className="muted">No quests yet. Add the first one below.</p>
      ) : (
        <ul className="library-list" aria-label="Quest list">
          {state.questOrder.map((id) => {
            const q = state.quests[id];
            if (!q) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="library-item"
                  aria-current={id === current?.id ? 'true' : undefined}
                  onClick={() => open(q)}
                >
                  <span className="skill-name">[{q.title}]</span>{' '}
                  <span className="muted">
                    {[
                      q.status === 'active' ? null : q.status,
                      q.visible ? null : 'hidden',
                      q.status === 'active' ? timeText(q, state.day) : null,
                      q.stability
                        ? `Stability ${q.stability.value}%${q.stability.visible ? '' : ' (GM only)'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={(e) => void save(e)} aria-labelledby="quest-form">
        <h3 id="quest-form">{current ? `Edit [${current.title}]` : 'New quest'}</h3>
        <fieldset className="quest-fields" disabled={busy}>
          <label>
            Quest title
            <input
              value={draft.title}
              onChange={(e) => edit({ title: e.target.value })}
              required
              maxLength={120}
            />
          </label>
          <label>
            Quest text (players see this)
            <textarea
              value={draft.text}
              onChange={(e) => edit({ text: e.target.value })}
              rows={3}
              maxLength={4000}
              placeholder="The world is dying. Find what is killing it."
            />
          </label>
          <label>
            Timer in days (blank: none)
            <input
              inputMode="numeric"
              value={draft.days}
              onChange={(e) => edit({ days: e.target.value })}
            />
          </label>
          {current && current.days !== null && (
            <p className="muted" data-testid="quest-timer-note">
              Counted from day {current.startDay}: {timeText(current, state.day).toLowerCase()}.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={draft.visible}
              onChange={(e) => edit({ visible: e.target.checked })}
            />
            Players see this quest
          </label>
          {!draft.visible && (
            <fieldset className="quest-notice">
              <legend>Who is told a hidden quest exists</legend>
              <label className="check">
                <input
                  type="radio"
                  name="quest-notice"
                  checked={!noticeSome}
                  onChange={() => edit({ noticeTo: null })}
                />
                Every character (and characters created later)
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="quest-notice"
                  checked={noticeSome}
                  onChange={() => edit({ noticeTo: draft.noticeTo ?? [] })}
                />
                Only these characters
              </label>
              {noticeSome && (
                <div role="group" aria-label="Characters told">
                  {ids.map((id) => (
                    <label key={id} className="check">
                      <input
                        type="checkbox"
                        checked={draft.noticeTo?.includes(id) ?? false}
                        onChange={(e) => {
                          const list = draft.noticeTo ?? [];
                          edit({
                            noticeTo: e.target.checked
                              ? [...list, id]
                              : list.filter((x) => x !== id),
                          });
                        }}
                      />
                      {nameOf(id)}
                    </label>
                  ))}
                  {draft.noticeTo?.length === 0 && (
                    <p className="warn" role="note" data-testid="quest-notice-nobody">
                      Nobody will be told this quest exists.
                    </p>
                  )}
                </div>
              )}
              <p className="muted">
                They get a System notice with no details: no title, text or timer.
              </p>
            </fieldset>
          )}
          {current && !current.stability ? (
            <p className="muted" data-testid="quest-no-stability">
              No World Stability: it can only be added when a quest is created.
            </p>
          ) : (
            <label>
              World Stability rules, one “action tag: change” per line (blank: no gauge)
              <textarea
                value={draft.rules}
                onChange={(e) => edit({ rules: e.target.value })}
                rows={3}
                placeholder={'cleanse: -5\npale hunter: -3\nsystem beast: +2'}
              />
            </label>
          )}
          {hasStability && (
            <label className="check">
              <input
                type="checkbox"
                checked={draft.stabilityVisible}
                onChange={(e) => edit({ stabilityVisible: e.target.checked })}
              />
              Players see the World Stability gauge
            </label>
          )}
        </fieldset>
        {stale && (
          <p className="muted" role="note">
            Changed elsewhere since you opened it. Saving changes only the fields you edited.{' '}
            <button type="button" className="secondary" onClick={() => current && open(current)}>
              Reload
            </button>
          </p>
        )}
        {problem && draft.title.trim() !== '' && (
          <p className="err" data-testid="quest-problem">
            {problem}
          </p>
        )}
        <button type="submit" disabled={busy || command === null || problem !== null}>
          {current ? 'Save quest' : 'Add quest'}
        </button>
      </form>
      {current && (
        <div className="quest-status" role="group" aria-label={`Status of [${current.title}]`}>
          <span>
            Status: <strong data-testid="quest-manager-status">{current.status}</strong>
          </span>
          {current.status === 'active' ? (
            <>
              <button type="button" disabled={busy} onClick={() => setStatus('completed')}>
                Mark completed
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setStatus('failed')}
              >
                Mark failed
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => setStatus('active')}>
              Reopen
            </button>
          )}
        </div>
      )}
      {current?.stability && (
        <div
          className="quest-stability"
          role="group"
          aria-label={`World Stability of [${current.title}]`}
        >
          <p>
            World Stability:{' '}
            <strong data-testid="quest-stability-value">{current.stability.value}%</strong>{' '}
            <span className="muted">
              {current.stability.visible ? 'players see it' : 'GM only'}
            </span>
          </p>
          {current.status === 'active' && tags.length > 0 && (
            <form onSubmit={(e) => void applyAction(e)} aria-label="Apply a tagged action">
              <label>
                Action
                <select value={pickedTag} onChange={(e) => setTag(e.target.value)}>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t} ({signed(rulesOf[t] ?? 0)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Times
                <input
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  size={3}
                />
              </label>
              <label>
                Action reason (optional)
                <input value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
              </label>
              <button type="submit" disabled={busy}>
                Apply action
              </button>
            </form>
          )}
          <form onSubmit={(e) => void doNudge(e)} aria-label="Nudge World Stability">
            <label>
              Nudge by
              <input
                inputMode="numeric"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="+3 or -2"
                size={6}
              />
            </label>
            <label>
              Nudge reason (optional)
              <input value={nudgeReason} onChange={(e) => setNudgeReason(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || delta.trim() === ''}>
              Nudge
            </button>
          </form>
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
