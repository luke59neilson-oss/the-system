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
  useEffect(() => {
    let live = true;
    fetch('/api/gm/changelog', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: ChangeLogRow[] }>) : { rows: [] }))
      .then((body) => {
        if (live) setRows(body.rows);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gmKey, state]);
  const q = filter.trim().toLowerCase();
  const shown = [...rows]
    .reverse()
    .filter((r) => who === 'all' || r.actor === who || (who === 'gm' && r.actor === 'system'))
    .filter((r) => kind === 'all' || r.category === kind)
    .filter((r) => q === '' || r.lines.join(' ').toLowerCase().includes(q) || r.type.includes(q));
  return (
    <section className="window" aria-labelledby="change-log">
      <h2 id="change-log">Change log</h2>
      <label>
        Who
        <select value={who} onChange={(e) => setWho(e.target.value as 'all' | 'gm' | 'player')}>
          <option value="all">Everyone</option>
          <option value="gm">GM and System</option>
          <option value="player">Players</option>
        </select>
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | ChangeLogCategory)}>
          <option value="all">Everything</option>
          {CHANGE_LOG_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {KIND_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Filter
        <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {shown.length === 0 && <p className="muted">Nothing matches.</p>}
      <ol className="change-log">
        {shown.map((r) => (
          <li key={r.id} className={r.undoneBy ? 'undone' : undefined}>
            <span className="muted small">
              {shortTime(r.at)}
              {r.actor === 'player' ? ' · player' : ''}{' '}
            </span>
            {r.lines.join(' · ')}
            {r.type === 'campaign.created' ? null : r.undoneBy ? (
              <span className="muted"> (undone)</span>
            ) : (
              <button
                type="button"
                className="secondary small"
                onClick={() =>
                  void client.command({ type: 'event.undo', eventId: r.id }).then((res) => {
                    setError(res.ok ? null : friendlyError(res.error));
                  })
                }
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
