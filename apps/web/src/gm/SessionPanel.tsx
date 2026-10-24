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
 * M9.1: each session's report can be copied for Claude (markdown) or saved
 * as JSON, rebuilt by the server from the event log.
 */
export function SessionPanel({
  client,
  state,
  gmKey,
}: {
  client: LiveClient;
  state: CampaignState;
  gmKey: string;
}) {
  const summary = sessionSummary(state);
  const { running } = summary;
  const [confirming, setConfirming] = useState(false);
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // An end confirmed for a session that is no longer running (another tab, an undo) is dropped.
  if (confirming && running === null) setConfirming(false);
  // A message about an earlier session goes once the session changes.
  // Our own start or end keeps its message: the result arrives before the new state.
  const [shownFor, setShownFor] = useState<string | null>(running?.id ?? null);
  const [keepNext, setKeepNext] = useState(false);
  if (shownFor !== (running?.id ?? null)) {
    setShownFor(running?.id ?? null);
    if (keepNext || busy) setKeepNext(false);
    else setOutcome(null);
  }

  const run = async (command: { type: string } & Record<string, unknown>, okText: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    if (r.ok && (command.type === 'session.start' || command.type === 'session.end')) {
      setKeepNext(true);
    }
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
  // A copy the browser refused: the report shown for the GM to copy by hand.
  const [manual, setManual] = useState<{ n: number; text: string } | null>(null);
  const copied = (n: number) =>
    setOutcome({ kind: 'ok', text: `Session ${n} report copied: paste it into Claude` });
  /**
   * Copies session `n`'s markdown report. The async clipboard write starts
   * inside the click (a ClipboardItem fed by the fetch), so the click still
   * counts as the user's gesture when the text arrives; outside a secure
   * context the legacy copy command is tried, and when that fails too the
   * report is shown selected for the GM to copy by hand.
   */
  const copyReport = (n: number) => {
    setBusy(true);
    setManual(null);
    const text = fetchReport(gmKey, n, 'md');
    const finish = async () => {
      const r = await text;
      if (!r.ok) return setOutcome({ kind: 'err', text: r.error });
      if (legacyCopy(r.text)) return copied(n);
      setManual({ n, text: r.text });
      setOutcome({
        kind: 'warn',
        text: 'This browser blocked the copy: select the report below and copy it.',
      });
    };
    const done = () => setBusy(false);
    if (canWriteClipboard()) {
      const blob = text.then((r) => {
        if (!r.ok) throw new Error(r.error);
        return new Blob([r.text], { type: 'text/plain' });
      });
      navigator.clipboard
        .write([new ClipboardItem({ 'text/plain': blob })])
        .then(
          () => copied(n),
          () => finish(),
        )
        .finally(done);
    } else {
      void finish().finally(done);
    }
  };
  const saveJson = async (n: number) => {
    setBusy(true);
    const r = await fetchReport(gmKey, n, 'json');
    setBusy(false);
    if (!r.ok) return setOutcome({ kind: 'err', text: r.error });
    saveFile(`session-${String(n).padStart(2, '0')}.json`, r.text, 'application/json');
    setOutcome({ kind: 'ok', text: `Session ${n} report saved as JSON` });
  };
  const advanceBy = parseDays(days);
  const advance = async (e: FormEvent) => {
    e.preventDefault();
    if (advanceBy === null) return;
    const to = state.day + advanceBy;
    const sent = dueBroadcasts(state, to);
    const note =
      sent === 0 ? '' : `; ${sent} scheduled System message${sent === 1 ? '' : 's'} sent`;
    if (await run({ type: 'campaign.advanceDay', days: advanceBy }, `It is now day ${to}${note}`)) {
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
            <div className="row">
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
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => copyReport(running.number)}
              >
                Copy log for Claude
              </button>
            </div>
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
        {advanceBy !== null && dueBroadcasts(state, state.day + advanceBy) > 0 && (
          <p className="warn small" data-testid="due-broadcasts">
            Sends {dueBroadcasts(state, state.day + advanceBy)} scheduled System message
            {dueBroadcasts(state, state.day + advanceBy) === 1 ? '' : 's'} (see System broadcast).
          </p>
        )}
      </form>
      {outcome && (
        <p
          className={outcome.kind === 'ok' ? 'ok' : 'err'}
          role={outcome.kind === 'ok' ? 'status' : 'alert'}
        >
          {outcome.text}
        </p>
      )}
      {manual && (
        <div className="session-manual-copy">
          <textarea
            readOnly
            aria-label={`Session ${manual.n} report`}
            value={manual.text}
            ref={(el) => el?.select()}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="secondary small" onClick={() => setManual(null)}>
            Close
          </button>
        </div>
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
              <th scope="col" className="session-length">
                Length
              </th>
              <th scope="col">In game</th>
              <th scope="col">
                <span className="sr-only">Report</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.past.map((s) => (
              <tr key={s.id}>
                <td>{s.number}</td>
                <td className="wrap">{shortTime(s.startedAt)}</td>
                <td className="session-length">
                  {s.endedAt ? duration(s.startedAt, s.endedAt) : ''}
                </td>
                <td>{daySpan(s, state.day)}</td>
                <td className="session-report-actions">
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    aria-label={`Copy session ${s.number} report for Claude`}
                    onClick={() => copyReport(s.number)}
                  >
                    Copy for Claude
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    aria-label={`Save session ${s.number} report as JSON`}
                    onClick={() => void saveJson(s.number)}
                  >
                    JSON
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Scheduled broadcasts that advancing to `day` would send (M4.7). */
function dueBroadcasts(state: CampaignState, day: number): number {
  return state.scheduledBroadcasts.filter((b) => b.day <= day).length;
}

/** Fetches one session's report from the GM route (M9.1). */
async function fetchReport(
  gmKey: string,
  n: number,
  format: 'md' | 'json',
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`/api/gm/session-report?n=${n}&format=${format}`, {
      headers: { 'x-gm-key': gmKey },
      cache: 'no-store',
    });
    if (!r.ok) return { ok: false, error: `Could not load the session ${n} report (${r.status})` };
    return { ok: true, text: await r.text() };
  } catch {
    return { ok: false, error: `Could not load the session ${n} report: is the server running?` };
  }
}

/** Whether the async clipboard can take a ClipboardItem (secure contexts only). */
function canWriteClipboard(): boolean {
  return (
    window.isSecureContext &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem === 'function'
  );
}

/**
 * The legacy copy command through a hidden textarea: the only copy a GM
 * browser on a LAN-IP http origin has. False when the browser refuses it.
 */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok: boolean;
  try {
    // Deprecated, but the only option without a secure context.
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/** Hands the browser a file to save. */
function saveFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
