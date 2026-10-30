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
}: {
  state: CampaignState;
  /** Opens a GM window by id (switches to its tab and brings it into view). */
  onOpen: (windowId: string) => void;
  onBuildMenu: (characterId: string, level: number) => void;
}) {
  const items = needsYou(state);
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
