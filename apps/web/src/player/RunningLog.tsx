import { notificationText } from '../format';
import type { LiveSnapshot } from '../live';
import { FULL_HISTORY_EVENT, RUNNING_LOG_SIZE, runningLog, whenLabel } from './history';

/**
 * MU.2 (DESIGN §7 "Player log"): every change the GM makes to this character,
 * and every other System notice, newest first on the main screen; the full,
 * searchable history is the Notifications window below.
 */
export function RunningLog({ live }: { live: LiveSnapshot }) {
  const rows = runningLog(live.notifications);
  return (
    <section className="window running-log" aria-labelledby="running-log" data-testid="running-log">
      <h2 id="running-log">Log</h2>
      {rows.length === 0 ? (
        <p className="muted">What the System does to you shows here as it happens.</p>
      ) : (
        <ol className="history" aria-label={`Last ${RUNNING_LOG_SIZE} notices, newest first`}>
          {rows.map((n, i) => (
            <li key={`${n.seq}-${rows.length - i}`}>
              <span className="when">{whenLabel(n)}</span>{' '}
              <span className="ding-text">{notificationText(n.notification)}</span>
            </li>
          ))}
        </ol>
      )}
      <p>
        <a
          href="#dings"
          data-testid="full-history"
          onClick={() => window.dispatchEvent(new Event(FULL_HISTORY_EVENT))}
        >
          Full history
        </a>
      </p>
    </section>
  );
}
