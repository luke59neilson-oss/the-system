import { useState, type FormEvent } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { daySpan, duration, parseDays, sessionSummary, shortTime } from './sessionModel';

type Outcome = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

/**
 * Play sessions and the in-game day (ROADMAP M4.3). Starting a session makes
 * marks, repeat checks and the running session log count from now; ending it
 * backs the campaign up and writes the session report to the exports folder.
 */
export function SessionPanel({ client, state }: { client: LiveClient; state: CampaignState }) {
  const summary = sessionSummary(state);
  const { running } = summary;
  const [confirming, setConfirming] = useState(false);
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // An end confirmed for a session that is no longer running (another tab, an undo) is dropped.
  if (confirming && running === null) setConfirming(false);

  const run = async (command: { type: string } & Record<string, unknown>, okText: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    if (!r.ok) setOutcome({ kind: 'err', text: friendlyError(r.error) });
    else if (r.warning) setOutcome({ kind: 'warn', text: r.warning });
    else setOutcome({ kind: 'ok', text: okText });
    return r.ok;
  };
  const start = () => void run({ type: 'session.start' }, `Session ${summary.nextNumber} started`);
  const end = async () => {
    if (!running) return;
    const n = running.number;
    if (await run({ type: 'session.end' }, `Session ${n} ended: backup saved, report written`)) {
      setConfirming(false);
    }
  };
  const advanceBy = parseDays(days);
  const advance = async (e: FormEvent) => {
    e.preventDefault();
    if (advanceBy === null) return;
    const to = state.day + advanceBy;
    if (await run({ type: 'campaign.advanceDay', days: advanceBy }, `It is now day ${to}`)) {
      setDays('1');
    }
  };

  return (
    <section className="window session-window" aria-labelledby="session-heading">
      <h2 id="session-heading">Session</h2>
      {running ? (
        <div className="session-now running" data-testid="session-now">
          <p>
            <strong>Session {running.number} is running</strong> ·{' '}
            <span className="nowrap">since {shortTime(running.startedAt)}</span> ·{' '}
            <span className="nowrap">{daySpan(running, state.day)}</span>
          </p>
          {confirming ? (
            <div className="confirm" role="group" aria-label={`End session ${running.number}`}>
              <p>
                End session {running.number}? The campaign is backed up and the session report is
                written to the exports folder. Marks and repeat checks start fresh next session.
              </p>
              <div className="row">
                <button type="button" disabled={busy} onClick={() => void end()}>
                  End session {running.number}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep playing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOutcome(null);
                setConfirming(true);
              }}
            >
              End session…
            </button>
          )}
        </div>
      ) : (
        <div className="session-now" data-testid="session-now">
          <p>
            <strong>No session running.</strong> Start one when play begins: mastery marks need a
            session, and the session log and report cover it.
          </p>
          <button type="button" disabled={busy} onClick={start}>
            Start session {summary.nextNumber}
          </button>
        </div>
      )}
      <form className="day-form" onSubmit={(e) => void advance(e)} aria-label="In-game day">
        <p className="day-now">
          In-game day <strong data-testid="day">{state.day}</strong>
        </p>
        <label>
          Advance by (days)
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || advanceBy === null}>
          {advanceBy === null ? 'Advance' : `Advance to day ${state.day + advanceBy}`}
        </button>
      </form>
      {outcome && (
        <p
          className={outcome.kind === 'ok' ? 'ok' : 'err'}
          role={outcome.kind === 'ok' ? 'status' : 'alert'}
        >
          {outcome.text}
        </p>
      )}
      <h3 className="session-past-heading">Past sessions</h3>
      {summary.past.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table className="session-past">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Started</th>
              <th scope="col">Length</th>
              <th scope="col">In game</th>
            </tr>
          </thead>
          <tbody>
            {summary.past.map((s) => (
              <tr key={s.id}>
                <td>{s.number}</td>
                <td>{shortTime(s.startedAt)}</td>
                <td>{s.endedAt ? duration(s.startedAt, s.endedAt) : ''}</td>
                <td>{daySpan(s, state.day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
