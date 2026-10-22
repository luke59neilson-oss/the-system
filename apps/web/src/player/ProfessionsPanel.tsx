import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { isConnectionError } from './selection';

/**
 * The Professions tab (ROADMAP MQ.6, DESIGN §2, D121): the professions the GM
 * offered this character, from the E-grade evolution on. Until one is taken
 * each offer has a [Take] button with a confirm step; afterwards the list
 * stays as a record, greyed out, with the chosen one marked. Shown only to
 * the owner, and only once something was offered.
 */
export function ProfessionsPanel({
  view,
  client,
}: {
  view: PlayerView;
  client: LiveClient | null;
}) {
  const me = view.me;
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const section = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  // Keyboard focus follows the buttons that replace each other: Cancel goes
  // back to that offer's [Take]; a taken profession lands on the heading.
  const [backTo, setBackTo] = useState<string | null>(null);
  useEffect(() => {
    if (backTo === null) return;
    section.current
      ?.querySelector<HTMLButtonElement>(`button[data-take="${CSS.escape(backTo)}"]`)
      ?.focus();
  }, [backTo]);
  const locked = me.profession !== null;
  const wasLocked = useRef(locked);
  useEffect(() => {
    const lost = !section.current?.contains(document.activeElement);
    if (locked && !wasLocked.current && lost) heading.current?.focus();
    wasLocked.current = locked;
  }, [locked]);
  if (me.professionOffers.length === 0) return null;
  const take = async (profession: string) => {
    if (!client) return;
    setBusy(true);
    setError(null);
    const result = await client.command({
      type: 'profession.choose',
      characterId: me.id,
      profession,
    });
    setBusy(false);
    setConfirming(null);
    if (result.ok) return;
    setError(
      isConnectionError(result.error)
        ? 'Connection lost. Check your profession once you are back: it may already be taken.'
        : friendlyError(result.error),
    );
  };
  return (
    <section
      className={`window professions-window${locked ? ' locked' : ''}`}
      aria-labelledby="professions-heading"
      data-testid="professions"
      ref={section}
    >
      <h2 id="professions-heading" tabIndex={-1} ref={heading}>
        Professions
      </h2>
      {locked ? (
        <p className="muted" data-testid="professions-locked">
          Locked: you are a <span className="skill-name">[{me.profession}]</span>.
        </p>
      ) : (
        <p className="muted">
          The System offers you these professions. Take one now or later; it starts at your class
          level ({me.classLevel}), and the other offers lock.
        </p>
      )}
      <ul className="profession-offers" aria-label="Offered professions">
        {me.professionOffers.map((p) => {
          const chosen = p === me.profession;
          return (
            <li
              key={p}
              className={`profession-offer${locked && !chosen ? ' greyed' : ''}${chosen ? ' chosen' : ''}`}
              data-testid="profession-offer"
              aria-disabled={locked && !chosen ? true : undefined}
            >
              <span className="skill-name">[{p}]</span>
              {chosen && <span className="badge">Chosen</span>}
              {!locked && client && confirming !== p && (
                <button
                  type="button"
                  className="assign-btn"
                  disabled={busy}
                  aria-label={`Take ${p}`}
                  data-take={p}
                  onClick={() => {
                    setError(null);
                    setBackTo(null);
                    setConfirming(p);
                  }}
                >
                  [Take]
                </button>
              )}
              {!locked && client && confirming === p && (
                <span className="profession-confirm" role="group" aria-label={`Confirm ${p}`}>
                  <span>Take [{p}]?</span>
                  <button type="button" disabled={busy} autoFocus onClick={() => void take(p)}>
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null);
                      setBackTo(p);
                    }}
                  >
                    Cancel
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
