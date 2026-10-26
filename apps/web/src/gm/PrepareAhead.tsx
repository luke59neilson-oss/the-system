import { useCallback, useEffect, useState } from 'react';

/** A prepared draft as the panel lists it (MC.10, D249); GM-only. */
interface Prepared {
  readonly id: string;
  readonly kind: string;
  readonly place: string;
  readonly request: string;
  readonly quote: string;
}
interface PreparedView {
  readonly enabled: boolean;
  readonly intervalS: number;
  readonly drafts: readonly Prepared[];
}

/** How often the panel asks; the server decides whether a look is due (on, new talk, interval). */
const PREPARE_TICK_MS = 30_000;
const INTERVALS = [120, 300, 600] as const;

/**
 * MC.10 (DESIGN §11 "Prepare ahead"): optional, off by default. While on,
 * the co-DM watches where the table is heading and drafts content for it in
 * the background; each draft waits here with the quote behind it. Review
 * opens it in Import content, where the GM previews and approves it like any
 * file; nothing reaches players before that. Both calls (the look and the
 * draft) count in the spend counter.
 */
export function PrepareAhead({
  gmKey,
  onReview,
}: {
  gmKey: string;
  onReview: (text: string, name: string) => void;
}) {
  const [view, setView] = useState<PreparedView | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const call = useCallback(
    async (url: string, init: RequestInit) => {
      const res = await fetch(url, {
        ...init,
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
      }).catch(() => null);
      if (!res) {
        setNote('Could not reach the server');
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<PreparedView> & {
        error?: string;
        called?: boolean;
        file?: unknown;
        place?: string;
      };
      if (!res.ok) {
        setNote(data.error ?? 'Prepare ahead failed');
        return null;
      }
      if (Array.isArray(data.drafts)) setView(data as PreparedView);
      return data;
    },
    [gmKey],
  );

  useEffect(() => {
    void fetch('/api/gm/ai/prepared', { headers: { 'x-gm-key': gmKey } })
      .then(async (res) => (res.ok ? setView((await res.json()) as PreparedView) : undefined))
      .catch(() => undefined);
  }, [gmKey]);

  const enabled = view?.enabled ?? false;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(
      () => void call('/api/gm/ai/prepared', { method: 'POST', body: '{}' }),
      PREPARE_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [enabled, call]);

  const settings = (next: { enabled: boolean; intervalS?: number }) =>
    void call('/api/gm/ai/prepared/settings', { method: 'PUT', body: JSON.stringify(next) });

  const lookNow = async () => {
    setNote('[The System is looking ahead…]');
    const data = await call('/api/gm/ai/prepared', {
      method: 'POST',
      body: JSON.stringify({ manual: true }),
    });
    if (data) setNote(data.called ? null : 'Nothing new heard yet, or looked under 2 minutes ago');
  };

  const review = async (d: Prepared) => {
    const data = await call(`/api/gm/ai/prepared/${encodeURIComponent(d.id)}/take`, {
      method: 'POST',
      body: '{}',
    });
    if (data?.file === undefined) return;
    onReview(JSON.stringify(data.file, null, 2), `co-DM prepared: ${d.place}`);
    setNote(`${d.place} is in Import content: check it there and approve`);
  };

  const dismiss = (d: Prepared) =>
    void call(`/api/gm/ai/prepared/${encodeURIComponent(d.id)}`, { method: 'DELETE' });

  return (
    <div className="prepare-ahead" data-testid="prepare-ahead">
      <h3>Prepare ahead (GM only)</h3>
      <p>
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) =>
              settings({ enabled: e.target.checked, intervalS: view?.intervalS ?? 300 })
            }
          />{' '}
          Draft content for where the table is heading
        </label>
      </p>
      {enabled && (
        <p>
          <label>
            Look every{' '}
            <select
              value={view?.intervalS ?? 300}
              onChange={(e) => settings({ enabled: true, intervalS: Number(e.target.value) })}
            >
              {INTERVALS.map((s) => (
                <option key={s} value={s}>
                  {s / 60} min
                </option>
              ))}
            </select>
          </label>{' '}
          <button type="button" onClick={() => void lookNow()}>
            Look ahead now
          </button>
        </p>
      )}
      {!enabled && <p className="muted">Off: each look and each draft is a paid call.</p>}
      {note && <p role="status">{note}</p>}
      {(view?.drafts.length ?? 0) > 0 && (
        <ul className="chips">
          {view?.drafts.map((d) => (
            <li key={d.id} data-testid="prepared">
              <strong>Prepared: {d.place}</strong>
              <blockquote>“{d.quote}”</blockquote>
              <button type="button" onClick={() => void review(d)}>
                Review
              </button>{' '}
              <button type="button" onClick={() => dismiss(d)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
