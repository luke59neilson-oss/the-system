import { useCallback, useEffect, useState } from 'react';
import { ENGINE_NAME } from '@the-system/engine';
import { isHostBrowser } from '../gm/perspective';
import {
  WAITING_FOR_CAMPAIGN,
  WAITING_POLL_MS,
  browserStorage,
  isWaitingAnswer,
  parseJoinList,
  readRemembered,
  rememberedEntry,
  type JoinEntry,
} from './join';
import { themeClass } from './sheet';
import { PortraitBadge } from '../PortraitBadge';

const playUrl = (id: string) => `/play/${encodeURIComponent(id)}`;

/**
 * Join screen (ROADMAP M3.1): the party's characters with portrait, name and
 * grade; this browser's last character is offered first ("Continue as …").
 * No password (D3): anyone on the GM's wifi may pick any character.
 */
export function PlayerHome() {
  const [characters, setCharacters] = useState<JoinEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ML.1: no campaign is open on the GM's laptop yet.
  const [waiting, setWaiting] = useState(false);
  const [rememberedId] = useState(() => readRemembered(browserStorage()));

  // Sets state only once the request settles (never synchronously).
  const load = useCallback((signal?: AbortSignal) => {
    fetch('/api/characters', signal ? { signal } : {})
      .then(async (r) => {
        const json: unknown = await r.json().catch(() => null);
        if (isWaitingAnswer(r.status, json)) return { waiting: true as const };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { waiting: false as const, json };
      })
      .then((answer) => {
        setError(null);
        setWaiting(answer.waiting);
        if (answer.waiting) setCharacters(null);
        else setCharacters(parseJoinList(answer.json));
      })
      .catch((e: unknown) => {
        if (signal?.aborted) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError('Could not reach the System. Is the GM’s laptop on?');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
  // ML.1: while waiting, ask again until the GM opens a campaign.
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    const timer = setInterval(() => load(controller.signal), WAITING_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [waiting, load]);

  const last = characters ? rememberedEntry(characters, rememberedId) : null;

  return (
    <main className="player join" data-engine={ENGINE_NAME}>
      <h1>The System</h1>
      {last && (
        <section className="window continue" aria-labelledby="continue">
          <h2 id="continue">Welcome back</h2>
          <a className="continue-link" href={playUrl(last.id)} data-testid="continue">
            <Portrait entry={last} />
            <span>
              Continue as <strong>{last.name}</strong>
            </span>
          </a>
        </section>
      )}
      <section className="window" aria-labelledby="choose">
        <div className="join-head">
          <h2 id="choose">Choose your character</h2>
          <button type="button" className="secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {waiting && (
          <p className="waiting-campaign" role="status" data-testid="waiting-campaign">
            {WAITING_FOR_CAMPAIGN}
          </p>
        )}
        {!error && !waiting && characters === null && (
          <p className="muted">Connecting to the System…</p>
        )}
        {characters?.length === 0 && (
          <p className="muted">No characters yet. Your GM will create them.</p>
        )}
        {characters && characters.length > 0 && (
          <ul className="choices" data-testid="characters">
            {characters.map((c) => (
              <li key={c.id}>
                <a
                  href={playUrl(c.id)}
                  className={c.id === last?.id ? 'last' : undefined}
                  data-testid={`join-${c.id}`}
                >
                  <Portrait entry={c} />
                  <span className="who">
                    <span className="name">{c.name}</span>
                    <span className="grade" data-testid={`grade-${c.id}`}>
                      Grade {c.grade}
                    </span>
                  </span>
                  {c.id === last?.id && <span className="tag">Last played</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
        {isHostBrowser(window.location.hostname) && (
          <p className="muted">
            On the GM’s laptop? <a href="/gm">Open the GM console</a> (needs the GM link from the
            desktop app).
          </p>
        )}
      </section>
    </main>
  );
}

/** Portrait image, or a monogram framed in the character's grade metal. */
function Portrait({ entry }: { entry: JoinEntry }) {
  return (
    <PortraitBadge name={entry.name} src={entry.portrait} className={themeClass(entry.theme)} />
  );
}
