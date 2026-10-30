import { useEffect, useState } from 'react';
import type { CampaignState } from '@the-system/engine';
import { needsYou } from './needsYouModel';
import { sessionSummary } from './sessionModel';

/**
 * MU.1 (DESIGN §9a): the home dashboard's list of what waits on the GM, each a
 * link to the window that handles it (on its tab).
 */
export function NeedsYou({
  state,
  onOpen,
  onBuildMenu,
  gmKey,
}: {
  state: CampaignState;
  /** For the co-DM's practice drafts, which live on the server (MU.1 review). */
  gmKey?: string | undefined;
  /** Opens a GM window by id (switches to its tab and brings it into view). */
  onOpen: (windowId: string) => void;
  onBuildMenu: (characterId: string, level: number) => void;
}) {
  const drafts = useDraftCount(gmKey, state.practice.length);
  const items = needsYou(state);
  if (drafts > 0)
    items.push({
      key: 'drafts',
      text: `${drafts} co-DM practice ${drafts === 1 ? 'draft' : 'drafts'} to confirm`,
      window: 'practice-capture',
    });
  const { running } = sessionSummary(state);
  return (
    <section className="window needs-you" aria-labelledby="needs-you">
      <h2 id="needs-you">Needs you</h2>
      <p className="muted small" data-testid="home-session">
        {state.name} · day {state.day} ·{' '}
        {running ? `session ${running.number} running` : 'no session running'}
      </p>
      {items.length === 0 ? (
        <p className="muted">Nothing waits on you.</p>
      ) : (
        <ul aria-label="Waiting on the GM">
          {items.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                className="flag-link"
                onClick={() =>
                  i.selection
                    ? onBuildMenu(i.selection.characterId, i.selection.level)
                    : onOpen(i.window)
                }
              >
                {i.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** How many co-DM practice drafts wait (MC.7); 0 without a key or on any error. */
function useDraftCount(gmKey: string | undefined, practiceCount: number): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (gmKey === undefined) return;
    let live = true;
    void fetch('/api/gm/ai/practice-drafts', { headers: { 'x-gm-key': gmKey } })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { drafts?: unknown[] };
        if (live) setCount(Array.isArray(data.drafts) ? data.drafts.length : 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gmKey, practiceCount]);
  return count;
}
