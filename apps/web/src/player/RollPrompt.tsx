import { useState, type FormEvent } from 'react';
import type { PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { rollPromptText } from './contest';

/**
 * MK.2 (DESIGN §7 "Dice"): the GM asked this player for a d20. "Roll d20 for
 * Perception (+14)" with **Roll** (the app rolls) or a 1–20 box for a die
 * thrown at the table; once answered it shows the die until the GM uses it.
 */
export function RollPrompt({ client, view }: { client: LiveClient | null; view: PlayerView }) {
  const [die, setDie] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = view.rollRequest;
  if (req === null) return null;
  const { title, answer } = rollPromptText(view, req);
  const send = async (typed: number | undefined) => {
    if (!client) return;
    setBusy(true);
    setError(null);
    const result = await client.command({
      type: 'roll.answer',
      characterId: view.viewerId,
      requestId: req.id,
      ...(typed === undefined ? {} : { die: typed }),
    });
    setBusy(false);
    if (!result.ok) setError(friendlyError(result.error));
    else setDie('');
  };
  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const t = die.trim();
    const n = Number(t);
    if (!/^\d+$/.test(t) || n < 1 || n > 20) {
      setError('A die is a whole number from 1 to 20');
      return;
    }
    void send(n);
  };
  return (
    <section className="roll-prompt" data-testid="roll-prompt" aria-label="Roll request">
      <h3>{title}</h3>
      {answer !== null ? (
        <p data-testid="roll-answer">{answer}</p>
      ) : (
        <form className="roll-prompt-form" onSubmit={submitTyped}>
          <button type="button" disabled={busy || !client} onClick={() => void send(undefined)}>
            Roll
          </button>
          <label>
            or the d20 you threw (1–20)
            <input
              inputMode="numeric"
              value={die}
              onChange={(e) => setDie(e.target.value)}
              aria-invalid={error !== null}
            />
          </label>
          <button type="submit" disabled={busy || !client || die.trim() === ''}>
            Send die
          </button>
        </form>
      )}
      {error && <p className="err">{error}</p>}
    </section>
  );
}

/**
 * QF.72: a request is easy to miss from Quests or Notes, so it announces itself
 * wherever the player has scrolled to, and the tap goes to the prompt. It leaves
 * once tapped or answered. The view only holds the viewer's own request.
 */
export function RollCall({ view }: { view: PlayerView }) {
  const [went, setWent] = useState<string | null>(null);
  const req = view.rollRequest;
  if (req === null || req.answer !== null || went === req.id) return null;
  const { title } = rollPromptText(view, req);
  return (
    <div className="roll-call-layer" aria-live="polite">
      <button
        type="button"
        className="roll-call"
        data-testid="roll-call"
        onClick={() => {
          setWent(req.id);
          document
            .querySelector('[data-testid="roll-prompt"]')
            ?.scrollIntoView({ block: 'center' });
        }}
      >
        The GM asks: {title}
      </button>
    </div>
  );
}
