import { useState } from 'react';
import type { PlayerIdentify, PlayerView } from '@the-system/engine';
import type { LiveClient } from '../live';
import { NOTHING_REVEALED, bestiaryEntries, identifyHeader, identifyResult } from './identify';

/** The System's lines for one entry: the header and the text (or why there is none). */
function IdentifyLines({ entry }: { entry: PlayerIdentify }) {
  const header = identifyHeader(entry);
  return (
    <>
      {header !== null && (
        <p className="identify-header" data-testid="identify-header">
          {header}
        </p>
      )}
      {!entry.inRange ? null : entry.text === null ? (
        <p className="muted" data-testid="identify-text">
          {NOTHING_REVEALED}
        </p>
      ) : (
        <p className="identify-text" data-testid="identify-text">
          {entry.text}
        </p>
      )}
    </>
  );
}

/**
 * The player's Bestiary (MV.3, DESIGN §7 "Identify"; was the Identify window,
 * M3.9): the entities the GM marked identified for this character, grouped by
 * the GM's categories, Uncategorized last. Choosing one shows what the System
 * told them when the GM marked it.
 */
export function IdentifyPanel({ view }: { view: PlayerView }) {
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const result = identifyResult(bestiaryEntries(view.bestiary), chosen);
  const groups = view.bestiary.categories;
  return (
    <section
      className="window identify-window"
      aria-labelledby="identify-heading"
      data-testid="identify"
    >
      <h2 id="identify-heading">Bestiary</h2>
      {groups.length === 0 ? (
        <p className="muted">Nothing identified yet.</p>
      ) : (
        groups.map((g) => (
          <div
            key={g.id ?? ''}
            className="bestiary-group"
            role="group"
            aria-label={g.name}
            data-testid="bestiary-category"
          >
            <h3 className="bestiary-category">{g.name}</h3>
            <div className="identify-targets">
              {g.entries.map((e) => (
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
          </div>
        ))
      )}
      <div aria-live="polite" data-testid="identify-result">
        {result.kind === 'shown' && (
          <div className="identify-result">
            <p className="muted identify-of">Identify: {result.entry.label}</p>
            <IdentifyLines entry={result.entry} />
          </div>
        )}
        {result.kind === 'gone' && (
          <p className="muted" data-testid="identify-gone">
            {result.label} is no longer in your bestiary.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * MV.3: an Identify notification puts the entity front and centre until the
 * player closes it (it stays in the bestiary). Several open ones show oldest
 * first. In View as (no client) it shows without a Close button.
 */
export function IdentifyNotice({ view, client }: { view: PlayerView; client: LiveClient | null }) {
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once the server drops the closed notice, forget it, so a re-mark shows again (review M2).
  if (closing !== null && !view.bestiary.notices.some((n) => n.id === closing)) setClosing(null);
  const current = view.bestiary.notices.find((n) => n.id !== closing) ?? null;
  if (current === null) return null;
  const more = view.bestiary.notices.length - 1;
  const close = async () => {
    if (!client) return;
    setClosing(current.id);
    setError(null);
    const result = await client.command({
      type: 'entity.closeNotice',
      entityId: current.id,
      characterId: view.me.id,
    });
    if (!result.ok) {
      setClosing(null);
      setError(result.error);
    }
  };
  return (
    <div className="identify-notice-layer">
      <section
        className="identify-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`identify-notice-${current.id}`}
        data-testid="identify-notice"
      >
        <p className="muted identify-of">Identify</p>
        <h2 id={`identify-notice-${current.id}`}>{current.label}</h2>
        <IdentifyLines entry={current} />
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {client && (
          <button type="button" onClick={() => void close()} autoFocus>
            {more > 0 ? `Close (${more} more)` : 'Close'}
          </button>
        )}
      </section>
    </div>
  );
}
