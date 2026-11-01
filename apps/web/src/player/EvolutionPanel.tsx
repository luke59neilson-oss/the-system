import type { PlayerView } from '@the-system/engine';
import { themeClass } from './sheet';
import { evolutionPanelState } from './evolutionSteps';

/**
 * ME.5 (DESIGN §9 "Evolution on the player's screen"): the Evolution window
 * is always there. Locked and greyed until the GM releases an evolution;
 * then it lights up in the next grade's metal (glow and pulse; a strong
 * static highlight with reduced motion) until the player opens it. Nothing
 * about an evolution reaches the player before the release (the server only
 * sends a released one).
 */
export function EvolutionPanel({
  view,
  opened,
  canOpen,
  onOpen,
}: {
  view: PlayerView;
  /** The release this browser already opened, or null. */
  opened: string | null;
  /** False in the GM's View-as panes (look, don't touch). */
  canOpen: boolean;
  onOpen: () => void;
}) {
  const evolution = view.me.evolution;
  const state = evolutionPanelState(evolution, opened);
  const next = evolution
    ? view.rules.grades.find((g) => g.id === evolution.toGrade)?.theme
    : undefined;
  const steps = evolution?.steps !== undefined;
  return (
    <section
      className={`window evolution-panel evolution-${state}${state === 'locked' ? '' : themeClass(next)}`}
      aria-labelledby="evolution-panel-heading"
      aria-disabled={state === 'locked' ? true : undefined}
      data-testid="evolution-panel"
      data-state={state}
    >
      <h2 id="evolution-panel-heading">
        Evolution{state === 'locked' && <span className="evolution-lock"> [Locked]</span>}
      </h2>
      {evolution === null ? (
        <p className="muted">
          Sealed. When your race level reaches the top of your grade and every skill selection is
          chosen, the System will call you to evolve.
        </p>
      ) : (
        <>
          <p className="evolution-call" data-testid="evolution-call">
            <span className="system-banner-mark">[Evolution available]</span> {evolution.toGrade}
            -grade awaits.{' '}
            {steps
              ? 'Choose your class, your profession and your race, then confirm once.'
              : 'Choose your path.'}
          </p>
          {canOpen && (
            <button type="button" className="evolution-open" onClick={onOpen}>
              {state === 'lit' ? 'Open your evolution' : 'Continue your evolution'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
