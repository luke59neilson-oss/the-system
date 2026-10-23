import { useEffect, useState } from 'react';
import type { CampaignState, ChangeLogRow } from '@the-system/engine';
import type { LiveClient } from '../live';

/**
 * M4.8 (in progress): the GM's change log, newest first, filterable, with
 * undo (the engine's M1.3 rules decide what can be undone).
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
    .filter((r) => q === '' || r.lines.join(' ').toLowerCase().includes(q) || r.type.includes(q));
  return (
    <section className="window" aria-labelledby="change-log">
      <h2 id="change-log">Change log</h2>
      <label>
        Filter
        <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <ol className="change-log">
        {shown.map((r) => (
          <li key={r.id} className={r.undoneBy ? 'undone' : undefined}>
            {r.lines.join(' · ')}
            {r.undoneBy ? (
              <span className="muted"> (undone)</span>
            ) : (
              <button
                type="button"
                className="secondary small"
                onClick={() =>
                  void client.command({ type: 'event.undo', eventId: r.id }).then((res) => {
                    setError(res.ok ? null : res.error);
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
