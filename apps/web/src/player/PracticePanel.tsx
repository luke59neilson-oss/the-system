import { useState, type FormEvent } from 'react';
import type { PlayerMontage, PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { whenLabel } from './history';
import { MAX_ACTION, practiceProblem, practiceWhat, recentPractice, sourceLabel } from './practice';

/**
 * Practice (ROADMAP M3.11, DESIGN §7): log what you practiced (action plus a
 * skill and/or stat) for the GM's end-of-session review, and give a one-line
 * focus when the GM offers a montage. `client` is null in View-as panes.
 */
export function PracticePanel({ view, client }: { view: PlayerView; client: LiveClient | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const send = async (command: { type: string } & Record<string, unknown>) => {
    if (!client) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await client.command(command);
    setBusy(false);
    if (!result.ok) setError(friendlyError(result.error));
    return result.ok;
  };
  const recent = recentPractice(view.practice);
  return (
    <section
      className="window practice-window"
      aria-labelledby="practice-heading"
      data-testid="practice"
    >
      <h2 id="practice-heading">Practice</h2>
      {view.montages.map((m) => (
        <MontageOffer
          key={m.id}
          view={view}
          montage={m}
          busy={busy}
          canAct={client !== null}
          onFocus={async (fields) => {
            const ok = await send({
              type: 'montage.focus',
              montageId: m.id,
              characterId: view.viewerId,
              ...fields,
            });
            if (ok) setNotice('Focus sent. The GM narrates the rest.');
            return ok;
          }}
        />
      ))}
      {client && (
        <details className="practice-log" data-testid="practice-log">
          <summary>Log practice</summary>
          <PracticeForm
            view={view}
            busy={busy}
            testId="practice-form"
            submitLabel="Log practice"
            legend="What did you practice?"
            onSubmit={async (fields) => {
              const ok = await send({
                type: 'practice.log',
                characterId: view.viewerId,
                ...fields,
              });
              if (ok) setNotice('Practice logged for the GM.');
              return ok;
            }}
          />
        </details>
      )}
      {error && (
        <p className="err" role="alert" data-testid="practice-error">
          {error}
        </p>
      )}
      <p className="notes-notice" role="status" data-testid="practice-notice">
        {notice}
      </p>
      <h3 className="practice-sub">Recent practice</h3>
      {recent.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ol className="practice-list" data-testid="practice-list">
          {recent.map((p) => (
            <li key={p.id} data-testid="practice-entry">
              <span className="practice-action">{p.action}</span>{' '}
              <span className="muted">
                {practiceWhat(p, view.rules)} · {sourceLabel(p.source)} ·{' '}
                {whenLabel({ at: p.at, day: view.day }).replace(/^Day \d+ · /, '')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type Fields = { action: string; skills: string[]; stat: string | null };

function MontageOffer({
  view,
  montage,
  busy,
  canAct,
  onFocus,
}: {
  view: PlayerView;
  montage: PlayerMontage;
  busy: boolean;
  canAct: boolean;
  onFocus: (fields: Fields) => Promise<boolean>;
}) {
  return (
    <div
      className="montage"
      role="group"
      aria-label={`Montage: ${montage.label}`}
      data-testid="montage"
    >
      <p className="montage-title">
        <span className="muted">Montage ·</span> {montage.label}
      </p>
      {montage.focus !== null ? (
        <p data-testid="montage-focus">
          Your focus: <span className="practice-action">{montage.focus}</span>{' '}
          <span className="muted">(the GM narrates the rest)</span>
        </p>
      ) : canAct ? (
        <PracticeForm
          view={view}
          busy={busy}
          testId="montage-form"
          submitLabel="Send focus"
          legend="Your one-line focus"
          optional
          onSubmit={onFocus}
        />
      ) : (
        <p className="muted">Waiting for the player's focus.</p>
      )}
    </div>
  );
}

function PracticeForm({
  view,
  busy,
  testId,
  submitLabel,
  legend,
  optional = false,
  onSubmit,
}: {
  view: PlayerView;
  busy: boolean;
  testId: string;
  submitLabel: string;
  legend: string;
  /** Skills and stat are optional (montage focus). */
  optional?: boolean;
  onSubmit: (fields: Fields) => Promise<boolean>;
}) {
  const [action, setAction] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [stat, setStat] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Skills the character no longer has (an evolution renamed one) drop out.
  const owned = view.me.skills.map((s) => s.name);
  const chosen = skills.filter((s) => owned.includes(s));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const why = practiceProblem(action, chosen, stat, !optional);
    setProblem(why);
    if (why) return;
    if (await onSubmit({ action: action.trim(), skills: chosen, stat })) {
      setAction('');
      setSkills([]);
      setStat(null);
    }
  };
  return (
    <form className="practice-form" onSubmit={submit} data-testid={testId}>
      <label>
        {legend}
        <input
          type="text"
          value={action}
          maxLength={MAX_ACTION}
          placeholder="What did you do?"
          data-testid={`${testId}-action`}
          onChange={(e) => setAction(e.target.value)}
        />
      </label>
      <fieldset className="practice-skills">
        <legend>Skills used{optional ? ' (optional)' : ''}</legend>
        {view.me.skills.map((s) => (
          <label key={s.name} className="check">
            <input
              type="checkbox"
              checked={chosen.includes(s.name)}
              onChange={(e) =>
                setSkills(
                  e.target.checked ? [...chosen, s.name] : chosen.filter((n) => n !== s.name),
                )
              }
            />{' '}
            {s.name}
            {s.nickname && <span className="nickname"> “{s.nickname}”</span>}
          </label>
        ))}
      </fieldset>
      <label>
        Stat
        <select
          value={stat ?? ''}
          data-testid={`${testId}-stat`}
          onChange={(e) => setStat(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">None</option>
          {view.rules.stats.list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {problem && (
        <p className="err" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} data-testid={`${testId}-submit`}>
        {submitLabel}
      </button>
    </form>
  );
}
