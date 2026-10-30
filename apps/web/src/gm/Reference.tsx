import { useEffect, useState } from 'react';
import {
  referenceMeta,
  referenceUrl,
  safeSource,
  type ReferenceQuery,
  type ReferenceResult,
} from './referenceModel';

/**
 * MU.6 Reference (DESIGN §9a, L23): the Primal Hunter reference lists, for
 * naming and tone. GM-only: served on a GM route, never to players. Rows
 * tagged god-tied are flagged; the co-DM never uses them (the campaign's
 * Earth has no gods, DESIGN §1).
 */
export function Reference({ gmKey }: { gmKey: string }) {
  const [query, setQuery] = useState<ReferenceQuery>({ q: '', list: '', godTied: true });
  const [result, setResult] = useState<ReferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      fetch(referenceUrl(query), { headers: { 'x-gm-key': gmKey } })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Could not search the reference (${res.status})`);
          return (await res.json()) as ReferenceResult;
        })
        .then((r) => {
          if (!live) return;
          setResult(r);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!live) return;
          setResult(null);
          setError(err instanceof Error ? err.message : 'Could not search the reference');
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, gmKey]);

  return (
    <section className="window reference" aria-labelledby="reference">
      <h2 id="reference">Reference</h2>
      <p className="muted">
        Names from <cite>The Primal Hunter</cite>, summarised in our own words, for naming and tone.
        GM-only. The co-DM sees a few as examples; never the god-tied ones.
      </p>
      <div className="reference-search">
        <label>
          Search the reference
          <input
            type="search"
            value={query.q}
            maxLength={200}
            data-testid="reference-search"
            onChange={(e) => setQuery({ ...query, q: e.target.value })}
          />
        </label>
        <label>
          List
          <select
            value={query.list}
            data-testid="reference-list"
            onChange={(e) => setQuery({ ...query, list: e.target.value })}
          >
            <option value="">All lists</option>
            {(result?.lists ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={query.godTied}
            data-testid="reference-god-tied"
            onChange={(e) => setQuery({ ...query, godTied: e.target.checked })}
          />
          Show god-tied
        </label>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="muted" data-testid="reference-count" aria-live="polite">
            {result.total === 0
              ? 'Nothing matches.'
              : result.entries.length < result.total
                ? `Showing ${result.entries.length} of ${result.total}; narrow the search to see the rest.`
                : `${result.total} ${result.total === 1 ? 'entry' : 'entries'}`}
          </p>
          <ul className="reference-results" data-testid="reference-results">
            {result.entries.map((row) => {
              const source = safeSource(row.source);
              return (
                <li key={row.id} data-testid="reference-row">
                  <div className="reference-head">
                    <strong>{row.name}</strong>
                    <span className="muted">{referenceMeta(row)}</span>
                    {row.godTied && (
                      <span className="tag-flag" data-testid="reference-god-tied-flag">
                        god-tied · not used by the co-DM
                      </span>
                    )}
                    {row.confidence === 'recall' && (
                      <span className="muted" title="From memory; unconfirmed">
                        unconfirmed
                      </span>
                    )}
                  </div>
                  {row.summary && <p>{row.summary}</p>}
                  {(row.details.length > 0 || row.tags.length > 0 || source) && (
                    <p className="muted reference-details">
                      {[...row.details, row.tags.length ? `tags: ${row.tags.join(', ')}` : '']
                        .filter((x) => x !== '')
                        .join(' · ')}
                      {source && (
                        <>
                          {' · '}
                          <a href={source} target="_blank" rel="noreferrer noopener">
                            source
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
