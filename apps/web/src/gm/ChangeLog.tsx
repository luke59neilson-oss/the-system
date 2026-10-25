import { useEffect, useRef, useState } from 'react';
import {
  CHANGE_LOG_CATEGORIES,
  CHANGE_LOG_DEFAULT_PAGE,
  type CampaignState,
  type ChangeLogCategory,
  type ChangeLogPage,
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

/**
 * Changes the engine never undoes (M1.3), so they get no Undo button; and the
 * retired hunger events (MT.3), which replay as no-ops, so undoing one would
 * change nothing.
 */
const NO_UNDO = new Set([
  'campaign.created',
  'rules.migrated',
  'hunger.configured',
  'hunger.levelsSet',
]);

/** Waits this long after the last state change before refetching the log. */
const REFETCH_MS = 250;

/**
 * The newest page merged over what is shown (QF.13). Until the GM loads older
 * pages the newest page simply replaces the list, so it stays one page long.
 * After that, rows only ever arrive at the top, so the new head plus the shown
 * rows below it is contiguous and the older cursor (the bottom row) still
 * holds (`keptOlder`). The list starts over from the head when that is not
 * safe: the head filled up without reaching the old top (unknown gap), or an
 * undo happened since (`undone` changed), which can change rows below the head.
 */
export function mergeHead(
  shown: readonly ChangeLogRow[],
  shownUndone: number,
  head: ChangeLogPage,
): { rows: readonly ChangeLogRow[]; keptOlder: boolean } {
  const restart = { rows: head.rows, keptOlder: false };
  const oldest = head.rows.at(-1)?.seq;
  const top = shown[0]?.seq;
  if (oldest === undefined || top === undefined) return restart;
  if (shown.length <= CHANGE_LOG_DEFAULT_PAGE) return restart;
  if (head.undone !== shownUndone) return restart;
  if (head.older !== null && oldest > top) return restart;
  return { rows: [...head.rows, ...shown.filter((r) => r.seq < oldest)], keptOlder: true };
}

interface Filters {
  readonly who: 'all' | 'gm' | 'player';
  readonly kind: 'all' | ChangeLogCategory;
  readonly text: string;
}

/** One page of the GM change log from the server, filtered there. */
async function fetchPage(gmKey: string, filters: Filters, before: number | null) {
  const params = new URLSearchParams({
    who: filters.who,
    kind: filters.kind,
    text: filters.text,
    limit: String(CHANGE_LOG_DEFAULT_PAGE),
  });
  if (before !== null) params.set('before', String(before));
  const r = await fetch(`/api/gm/changelog?${params.toString()}`, {
    headers: { 'x-gm-key': gmKey },
  });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as ChangeLogPage;
}

/**
 * M4.8: the GM's change log, newest first, filterable by who, kind and text,
 * with undo (the engine's M1.3 rules decide what can be undone). The server
 * filters and pages it (QF.13): the console shows the newest page and loads
 * older ones on request; it refetches the newest page on every state change,
 * so a player's action shows up live.
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
  const [older, setOlder] = useState<number | null>(null);
  const [matching, setMatching] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [filter, setFilter] = useState('');
  const [who, setWho] = useState<'all' | 'gm' | 'player'>('all');
  const [kind, setKind] = useState<'all' | ChangeLogCategory>('all');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const text = filter.trim();
  const filterKey = `${who}|${kind}|${text}`;
  // What is on screen and for which filters; read by the refetch, which only
  // a state or filter change triggers.
  // `epoch` changes whenever the list starts over, so a late "Load older"
  // answer for the old list is dropped instead of leaving a gap.
  const shownRef = useRef<{
    key: string;
    rows: readonly ChangeLogRow[];
    undone: number;
    epoch: number;
  }>({ key: '', rows: [], undone: 0, epoch: 0 });
  const [shownKey, setShownKey] = useState<string | null>(null);
  const show = (key: string, next: readonly ChangeLogRow[]) => {
    shownRef.current = { ...shownRef.current, key, rows: next };
    setRows(next);
    setShownKey(key);
  };
  useEffect(() => {
    let live = true;
    // Debounced: a burst of player actions (or typing) refetches once.
    const timer = setTimeout(() => {
      fetchPage(gmKey, { who, kind, text }, null)
        .then((head) => {
          if (!live) return;
          const before = shownRef.current;
          const merged =
            before.key === filterKey
              ? mergeHead(before.rows, before.undone, head)
              : { rows: head.rows, keptOlder: false };
          if (!merged.keptOlder) shownRef.current.epoch++;
          shownRef.current.undone = head.undone;
          show(filterKey, merged.rows);
          if (!merged.keptOlder) setOlder(head.older);
          setMatching(head.matching);
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
  }, [gmKey, state, who, kind, text, filterKey]);
  const loadOlder = () => {
    if (older === null) return;
    const key = filterKey;
    const epoch = shownRef.current.epoch;
    setLoadingOlder(true);
    fetchPage(gmKey, { who, kind, text }, older)
      .then((page) => {
        const current = shownRef.current;
        // The list started over, or an undo may have changed loaded rows:
        // drop this page; the refetch that follows the change sets the list.
        if (current.key !== key || current.epoch !== epoch || page.undone !== current.undone) {
          return;
        }
        const bottom = current.rows.at(-1)?.seq ?? Number.POSITIVE_INFINITY;
        show(key, [...current.rows, ...page.rows.filter((r) => r.seq < bottom)]);
        setOlder(page.older);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoadingOlder(false));
  };
  // While a new filter loads, the old rows stay (no flash of an empty list).
  const shown = rows;
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
      {!loadError && shownKey === filterKey && shown.length === 0 && (
        <p className="muted">Nothing matches.</p>
      )}
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
                        const current = shownRef.current;
                        show(
                          current.key,
                          current.rows.map((x) =>
                            x.id === r.id ? { ...x, undoneBy: 'pending' } : x,
                          ),
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
      {shown.length > 0 && (
        <p className="row muted small change-log-footer">
          <span>
            Showing {shown.length} of {matching} {matching === 1 ? 'change' : 'changes'}.
          </span>
          {older !== null && (
            <button
              type="button"
              className="secondary small"
              disabled={loadingOlder}
              onClick={loadOlder}
            >
              Load older
            </button>
          )}
        </p>
      )}
    </section>
  );
}
