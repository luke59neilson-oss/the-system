import { useState } from 'react';
import type { PlayerView } from '@the-system/engine';
import { NOTHING_REVEALED, identifyResult } from './identify';

/** Identify (ROADMAP M3.9): choose a known entity and read what the System tells you. */
export function IdentifyPanel({ view }: { view: PlayerView }) {
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const result = identifyResult(view.identify, chosen);
  return (
    <section
      className="window identify-window"
      aria-labelledby="identify-heading"
      data-testid="identify"
    >
      <h2 id="identify-heading">Identify</h2>
      {view.identify.length === 0 ? (
        <p className="muted">You know of nothing to Identify yet.</p>
      ) : (
        <div className="identify-targets" role="group" aria-label="Choose what to Identify">
          {view.identify.map((e) => (
            <button
              key={e.id}
              type="button"
              className="identify-target"
              aria-pressed={chosen?.id === e.id}
              data-testid="identify-target"
              onClick={() => setChosen({ id: e.id, label: e.label })}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite" data-testid="identify-result">
        {result.kind === 'shown' && (
          <div className="identify-result">
            <p className="muted identify-of">Identify: {result.entry.label}</p>
            {result.entry.text === null ? (
              <p className="muted" data-testid="identify-text">
                {NOTHING_REVEALED}
              </p>
            ) : (
              <p className="identify-text" data-testid="identify-text">
                {result.entry.text}
              </p>
            )}
          </div>
        )}
        {result.kind === 'gone' && (
          <p className="muted" data-testid="identify-gone">
            {result.label} can no longer be identified.
          </p>
        )}
      </div>
    </section>
  );
}
