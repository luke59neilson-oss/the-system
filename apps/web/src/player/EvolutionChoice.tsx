import { useEffect, useRef, useState } from 'react';
import type { PendingEvolution, PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { bonusText, evolutionWarnings, transformText, weightsText } from './evolution';
import { isConnectionError } from './selection';

/**
 * The evolution screen (ROADMAP M3.13, DESIGN §2, D64): the released options
 * side by side (class name, description, skill transforms, reshaped stats),
 * pick one, review the warnings, pick a profession when one is offered, and
 * confirm. A modal <dialog>; Close leaves the choice for later.
 */
export function EvolutionChoice({
  evolution,
  view,
  client,
  onConfirming,
  onSettled,
  onClose,
}: {
  evolution: PendingEvolution;
  view: PlayerView;
  client: LiveClient;
  onConfirming: () => void;
  onSettled: (ok: boolean) => void;
  onClose: () => void;
}) {
  const rules = view.rules;
  const me = view.me;
  const dialog = useRef<HTMLDialogElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [profession, setProfession] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    heading.current?.focus();
  }, []);
  const option = picked === null ? null : evolution.options.find((o) => o.id === picked);
  useEffect(() => {
    if (option) confirmButton.current?.focus();
  }, [option]);
  // Back returns keyboard focus to the path that was picked.
  const [backTo, setBackTo] = useState<string | null>(null);
  useEffect(() => {
    if (backTo === null) return;
    dialog.current
      ?.querySelector<HTMLButtonElement>(`button[data-option="${CSS.escape(backTo)}"]`)
      ?.focus();
  }, [backTo]);
  const confirm = async (optionId: string) => {
    setBusy(true);
    setError(null);
    onConfirming();
    const result = await client.command({
      type: 'evolution.choose',
      characterId: me.id,
      optionId,
      profession: profession === '' ? null : profession,
      releaseId: evolution.releaseId,
    });
    setBusy(false);
    onSettled(result.ok);
    if (result.ok) return;
    if (isConnectionError(result.error))
      setError('Connection lost. Check your class once you are back: the choice may be saved.');
    else setError(friendlyError(result.error));
  };
  return (
    <dialog
      ref={dialog}
      className="skill-detail skill-selection evolution-choice window"
      aria-labelledby="evolution-heading"
      data-testid="evolution"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="skill-detail-head">
        <h3 id="evolution-heading" tabIndex={-1} ref={heading}>
          Evolution
        </h3>
        <button
          type="button"
          className="secondary"
          aria-label="Close evolution"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
      <p className="muted" data-testid="evolution-grade">
        Evolve into {evolution.toGrade}-grade: choose one of {evolution.options.length}{' '}
        {evolution.options.length === 1 ? 'path' : 'paths'}. Evolving refills HP, MP and Stamina.
      </p>
      {option ? (
        <div className="selection-review">
          <p id="evolution-review" data-testid="evolution-review">
            Become <span className="skill-name">[{option.className}]</span>?
          </p>
          <ul className="evolution-warnings" data-testid="evolution-warnings">
            {evolutionWarnings(me, option).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {evolution.professions.length > 0 && (
            <label className="evolution-profession">
              Profession
              <select
                value={profession}
                disabled={busy}
                onChange={(e) => setProfession(e.target.value)}
              >
                <option value="">None for now</option>
                {evolution.professions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="assign-actions">
            <button
              type="button"
              ref={confirmButton}
              disabled={busy}
              aria-describedby="evolution-review"
              onClick={() => void confirm(option.id)}
            >
              Evolve
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setBackTo(option.id);
                setPicked(null);
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <ul className="offers" aria-label="Evolution paths" data-testid="evolution-options">
          {evolution.options.map((o, i) => {
            const id = `evolution-option-${i}`;
            const weights = weightsText(rules, o.classWeights);
            const bonus = bonusText(rules, o.statBonus);
            return (
              <li key={o.id} className="offer" data-testid="evolution-option" aria-labelledby={id}>
                <h4 id={id}>
                  <span className="skill-name">[{o.className}]</span>
                </h4>
                {o.description ? (
                  <p className="offer-description">{o.description}</p>
                ) : (
                  <p className="muted offer-description">No description.</p>
                )}
                {o.transforms.length > 0 && (
                  <ul className="evolution-transforms" aria-label="Skills transformed">
                    {o.transforms.map((t) => (
                      <li key={t.skill}>{transformText(rules, me, t)}</li>
                    ))}
                  </ul>
                )}
                {bonus && (
                  <p className="evolution-bonus" data-testid="evolution-bonus">
                    One-time bonus: {bonus}
                  </p>
                )}
                {weights && <p className="muted">Class stats per level: {weights}</p>}
                <button
                  type="button"
                  data-option={o.id}
                  aria-label={`Choose ${o.className}`}
                  onClick={() => {
                    setError(null);
                    setPicked(o.id);
                  }}
                >
                  Choose
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
