import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { cssToken, rarityName } from './sheet';
import { isConnectionError, offerKindLabel, offerLabel, type Selection } from './selection';

/**
 * Skill selection (M3.6, DESIGN §6): the offered options side by side, pick
 * one, review, confirm. A choice is final; the other options are gone. A modal
 * <dialog>: Escape or Close leaves the choice for later (downtime).
 */
export function SkillSelection({
  selection,
  more,
  view,
  client,
  onConfirming,
  onSettled,
  onClose,
}: {
  selection: Selection;
  /** Other menus waiting after this one. */
  more: number;
  view: PlayerView;
  client: LiveClient;
  onConfirming: () => void;
  /** Called with the outcome and the skill taken; a refusal after close becomes a notice. */
  onSettled: (ok: boolean, skill: string, error: string | undefined) => void;
  onClose: () => void;
}) {
  const rules = view.rules;
  const dialog = useRef<HTMLDialogElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    heading.current?.focus();
  }, []);
  // Passed-over options from earlier menus are valid picks too (MQ.3, DESIGN §6).
  const older = selection.passedOver;
  const offer =
    picked === null
      ? null
      : (selection.options.find((o) => o.name === picked) ?? older.find((o) => o.name === picked));
  // Keyboard users land on Confirm in the review, and back on the card they
  // picked when they go Back.
  const [backTo, setBackTo] = useState<string | null>(null);
  useEffect(() => {
    if (offer) confirmButton.current?.focus();
  }, [offer]);
  useEffect(() => {
    if (backTo === null) return;
    const button = dialog.current?.querySelector<HTMLButtonElement>(
      `button[data-offer="${CSS.escape(backTo)}"]`,
    );
    button?.focus();
  }, [backTo]);
  const confirm = async (name: string) => {
    setBusy(true);
    setError(null);
    onConfirming();
    const result = await client.command({
      type: 'selection.choose',
      characterId: view.me.id,
      level: selection.level,
      skill: name,
      offerId: selection.offerId,
    });
    setBusy(false);
    // On success the menu is no longer pending and the parent unmounts this.
    onSettled(result.ok, name, result.ok ? undefined : result.error);
    if (result.ok) return;
    if (isConnectionError(result.error))
      setError(
        'Connection lost. Check your skills once you are back: the choice may already be saved.',
      );
    else setError(friendlyError(result.error));
  };
  const renderOffer = (o: Selection['options'][number], id: string, testId = 'offer') => (
    <li
      key={o.name}
      className={`offer rarity-${cssToken(o.rarity)}`}
      data-testid={testId}
      aria-labelledby={id}
    >
      <h4 id={id}>
        <span className="skill-name">{offerLabel(rules, o)}</span>
      </h4>
      <p className="muted offer-kind">
        {offerKindLabel(o.kind)} · {rarityName(rules, o.rarity)}
      </p>
      {o.description ? (
        <p className="offer-description">{o.description}</p>
      ) : (
        <p className="muted offer-description">No description.</p>
      )}
      <button
        type="button"
        data-offer={o.name}
        aria-label={`Choose ${o.name}`}
        onClick={() => {
          setError(null);
          setPicked(o.name);
        }}
      >
        Choose
      </button>
    </li>
  );
  return (
    <dialog
      ref={dialog}
      className="skill-detail skill-selection window"
      aria-labelledby="selection-heading"
      data-testid="selection"
      onCancel={(e) => {
        // Escape cannot abandon a choice in flight; the result decides.
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="skill-detail-head">
        <h3 id="selection-heading" tabIndex={-1} ref={heading}>
          Skill selection
        </h3>
        <button
          type="button"
          className="secondary"
          aria-label="Close skill selection"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
      <p className="muted" data-testid="selection-level">
        Class level {selection.level}: choose one of {selection.options.length + older.length}{' '}
        skills{older.length > 0 ? ` (${selection.options.length} new)` : ''}
        {more > 0 ? ` (${more} more ${more === 1 ? 'selection' : 'selections'} waiting)` : ''}
      </p>
      {picked !== null && !offer && (
        <p className="err" role="alert" data-testid="selection-gone">
          [{picked}] is no longer on offer. Choose another skill.
        </p>
      )}
      {offer ? (
        <div className="selection-review">
          <p id="selection-review" data-testid="selection-review">
            Take{' '}
            <span className={`rarity-${cssToken(offer.rarity)}`}>
              <span className="skill-name">{offerLabel(rules, offer)}</span>
            </span>
            ? The choice is final; the skills you pass over stay on offer for later selections.
          </p>
          <div className="assign-actions">
            <button
              type="button"
              ref={confirmButton}
              disabled={busy}
              aria-describedby="selection-review"
              onClick={() => void confirm(offer.name)}
            >
              Confirm
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setBackTo(offer.name);
                setPicked(null);
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <ul className="offers" aria-label="Offered skills" data-testid="offers">
          {selection.options.map((o, i) => renderOffer(o, `offer-${i}`))}
        </ul>
      )}
      {!offer && older.length > 0 && (
        <section className="passed-over" aria-labelledby="passed-over-heading">
          <h4 id="passed-over-heading" className="muted">
            Passed over earlier ({older.length})
          </h4>
          <ul className="offers" aria-label="Passed-over skills" data-testid="passed-over">
            {older.map((o, i) => renderOffer(o, `older-${i}`, 'passed-over-offer'))}
          </ul>
        </section>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
