import { useEffect, useState } from 'react';
import {
  CHANGE_LOG_CATEGORIES,
  type CampaignState,
  type ChangeLogCategory,
  type ChangeLogRow,
} from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { shortTime } from './sessionModel';

const KIND_LABELS: Readonly<Record<ChangeLogCategory, string>> = {
  campaign: 'Campaign and sessions',
  characters: 'Characters',
  xp: 'XP',
  skills: 'Skills and practice',
  items: 'Items and trades',
  quests: 'Quests and Identify',
  notes: 'Notes',
  messages: 'System messages',
  library: 'Libraries',
};

/** Undo refusals in the GM's words; never ids or event types. */
export function undoError(error: string): string {
  if (error.includes('because a later event depends on it')) {
    return "Can't undo this: a later change depends on it. Undo the later changes first.";
  }
  if (error.includes('already undone')) return 'That change is already undone.';
  if (error.includes('cannot be undone')) return "That change can't be undone.";
  return friendlyError(error);
}

/** Changes the engine never undoes (M1.3), so they get no Undo button. */
const NO_UNDO = new Set(['campaign.created', 'rules.migrated']);

/** Waits this long after the last state change before refetching the log. */
const REFETCH_MS = 250;

/**
 * M4.8: the GM's change log, newest first, filterable by who, kind and text,
 * with undo (the engine's M1.3 rules decide what can be undone). It refetches
 * on every state change, so a player's action shows up live.
 */
export function ChangeLog({
  client,
  gmKey,
  state,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
}) {
  const [rows, setRows] = useState<readonly ChangeLogRow[]>([]);
  const [filter, setFilter] = useState('');
  const [who, setWho] = useState<'all' | 'gm' | 'player'>('all');
  const [kind, setKind] = useState<'all' | ChangeLogCategory>('all');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let live = true;
    // Debounced: a burst of player actions refetches once.
    const timer = setTimeout(() => {
      fetch('/api/gm/changelog', { headers: { 'x-gm-key': gmKey } })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ rows: ChangeLogRow[] }>;
        })
        .then((body) => {
          if (!live) return;
          setRows(body.rows);
          setLoadError(false);
        })
        .catch(() => {
          if (live) setLoadError(true);
        });
    }, REFETCH_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [gmKey, state]);
  const q = filter.trim().toLowerCase();
  const shown = [...rows]
    .reverse()
    .filter((r) => who === 'all' || r.actor === who || (who === 'gm' && r.actor === 'system'))
    .filter((r) => kind === 'all' || r.category === kind)
    .filter((r) => q === '' || r.lines.join(' ').toLowerCase().includes(q));
  return (
    <section className="window" aria-labelledby="change-log">
      <h2 id="change-log">Change log</h2>
      <label htmlFor="change-log-who">Who</label>
      <select
        id="change-log-who"
        value={who}
        onChange={(e) => {
          setWho(e.target.value as 'all' | 'gm' | 'player');
          setError(null);
        }}
      >
        <option value="all">Everyone</option>
        <option value="gm">GM and System</option>
        <option value="player">Players</option>
      </select>
      <label htmlFor="change-log-kind">Kind</label>
      <select
        id="change-log-kind"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as 'all' | ChangeLogCategory);
          setError(null);
        }}
      >
        <option value="all">Everything</option>
        {CHANGE_LOG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {KIND_LABELS[c]}
          </option>
        ))}
      </select>
      <label htmlFor="change-log-filter">Filter</label>
      <input
        id="change-log-filter"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setError(null);
        }}
      />
      {loadError && (
        <p className="err" role="alert">
          Couldn't load the change log. It reloads after the next change in the game.
        </p>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {!loadError && shown.length === 0 && <p className="muted">Nothing matches.</p>}
      <ol className="change-log">
        {shown.map((r) => (
          <li key={r.id} className={r.undoneBy ? 'undone' : undefined}>
            <span className="change-text">
              <span className="muted small">
                {shortTime(r.at)}
                {r.actor === 'player' ? ' · player' : ''}{' '}
              </span>
              {r.lines.join(' · ')}
            </span>
            {NO_UNDO.has(r.type) ? null : r.undoneBy ? (
              <span className="muted small">(undone)</span>
            ) : confirming === r.id ? (
              // Undo cannot itself be undone, so it takes a second click on
              // this row (kept by event id, so a live refetch never shifts it).
              <span className="row">
                <button
                  type="button"
                  className="danger small"
                  onClick={() => {
                    setConfirming(null);
                    void client.command({ type: 'event.undo', eventId: r.id }).then((res) => {
                      setError(res.ok ? null : undoError(res.error));
                      // Show it undone at once; the refetch brings the real marker.
                      if (res.ok) {
                        setRows((all) =>
                          all.map((x) => (x.id === r.id ? { ...x, undoneBy: 'pending' } : x)),
                        );
                      }
                    });
                  }}
                >
                  Confirm undo
                </button>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="secondary small" onClick={() => setConfirming(r.id)}>
                Undo
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
