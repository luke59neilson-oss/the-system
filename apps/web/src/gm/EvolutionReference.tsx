import { useState } from 'react';
import type { ShapeReferenceRow, ShapeTrack } from '@the-system/engine';
import { shapePercent, type EvolutionReference } from './shapeModel';

const TRACK_LABEL: Record<ShapeTrack, string> = {
  class: 'Class',
  profession: 'Profession',
  race: 'Race',
};

/**
 * ME.4 (DESIGN §4 "Reference while building"): the books' evolution options
 * (Jake's class and profession picks) and the campaign's own earlier
 * options, with per-level stats, totals and their shape in percent. Each
 * option card's **Use this shape** applies a row. GM-only.
 */
export function EvolutionReferenceTable({
  reference,
  stats,
}: {
  reference: EvolutionReference | null;
  stats: readonly { readonly id: string; readonly name: string }[];
}) {
  const [track, setTrack] = useState<ShapeTrack | ''>('');
  const pick = (rows: readonly ShapeReferenceRow[]) =>
    track === '' ? rows : rows.filter((r) => r.track === track);
  return (
    <details className="evolution-reference" open>
      <summary>
        <h3>Reference: evolution options</h3>
      </summary>
      <p className="muted">
        Per-level stats from <cite>The Primal Hunter</cite> (Jake&rsquo;s picks; the passed-over
        options and race numbers were not found) and this campaign&rsquo;s earlier options. Use an
        option card&rsquo;s <strong>Use this shape</strong> to fill it scaled to the step&rsquo;s
        budget. GM-only.
      </p>
      <label>
        Track{' '}
        <select value={track} onChange={(e) => setTrack(e.target.value as ShapeTrack | '')}>
          <option value="">All</option>
          <option value="class">Class</option>
          <option value="profession">Profession</option>
          <option value="race">Race</option>
        </select>
      </label>
      {reference === null ? (
        <p className="muted">Loading the reference…</p>
      ) : (
        <>
          <ShapeTable
            caption="This campaign"
            empty="No three-step evolution released in this campaign yet."
            rows={pick(reference.campaign)}
            stats={stats}
          />
          <ShapeTable
            caption="The books"
            empty="No rows for this track."
            rows={pick(reference.books)}
            stats={stats}
          />
        </>
      )}
    </details>
  );
}

function ShapeTable({
  caption,
  empty,
  rows,
  stats,
}: {
  caption: string;
  empty: string;
  rows: readonly ShapeReferenceRow[];
  stats: readonly { readonly id: string; readonly name: string }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="muted">
        <strong>{caption}:</strong> {empty}
      </p>
    );
  }
  return (
    <div className="table-scroll">
      <table className="shape-table" aria-label={`Evolution options: ${caption.toLowerCase()}`}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">Track</th>
            <th scope="col">From</th>
            <th scope="col">Per level</th>
            <th scope="col">Total</th>
            <th scope="col">Shape</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name}</th>
              <td>{TRACK_LABEL[r.track]}</td>
              <td>{r.note}</td>
              <td>
                {[
                  ...stats.flatMap((s) =>
                    (r.stats[s.id] ?? 0) > 0 ? [`${s.name} ${r.stats[s.id]}`] : [],
                  ),
                  ...(r.free > 0 ? [`Free ${r.free}`] : []),
                ].join(' · ')}
              </td>
              <td>{r.total}</td>
              <td>
                {shapePercent(r, stats)
                  .map((p) => `${p.label} ${p.percent}%`)
                  .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
