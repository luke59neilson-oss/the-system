import { useEffect, useRef, useState } from 'react';
import type { PendingEvolution, PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { poolList } from './EvolutionChoice';
import { bonusText, evolutionBlocked, rerateLines, transformText } from './evolution';
import {
  EVOLUTION_STEP_LABEL,
  EVOLUTION_STEPS,
  perLevelText,
  picksComplete,
  professionNoneAllowed,
  stepChoices,
  stepWarnings,
  type EvolutionStepId,
  type StepCard,
  type StepPicks,
} from './evolutionSteps';
import { rarityName } from './sheet';
import { isConnectionError } from './selection';

type Steps = NonNullable<PendingEvolution['steps']>;

/**
 * ME.5 (DESIGN §9, §2): the three-step evolution. The player picks one
 * option per step (class, then profession, then race) from book-style
 * cards (name and rarity, a short description, the per-level stats ending
 * in free points, the one-time bonus), reviews all three and confirms once.
 * A modal <dialog>; Close keeps the picks for later.
 */
export function EvolutionStepsChoice({
  evolution,
  steps,
  view,
  client,
  onConfirming,
  onSettled,
  onClose,
}: {
  evolution: PendingEvolution;
  steps: Steps;
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
  const blocked = evolutionBlocked(me);
  const rerate = rerateLines(rules, me, evolution);
  const noneAllowed = professionNoneAllowed(me);
  // The steps the player walks: a profession step with nothing to pick (a
  // profession held and no option for it) is skipped.
  const walk = EVOLUTION_STEPS.filter(
    (s) => s !== 'profession' || noneAllowed || steps.profession.length > 0,
  );
  const [picks, setPicks] = useState<StepPicks>({ class: null, profession: null, race: null });
  const [at, setAt] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    heading.current?.focus();
  }, []);
  const reviewing = at >= walk.length;
  const stepHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    stepHeading.current?.focus();
  }, [at]);
  const card = (step: EvolutionStepId): StepCard | null => {
    const id = picks[step];
    return id === null || id === '' ? null : (steps[step].find((o) => o.id === id) ?? null);
  };
  const pick = (step: EvolutionStepId, id: string) => {
    setError(null);
    setPicks({ ...picks, [step]: id });
    setAt(at + 1);
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    onConfirming();
    const result = await client.command({
      type: 'evolution.choose',
      characterId: me.id,
      choices: stepChoices(picks),
      releaseId: evolution.releaseId,
    });
    setBusy(false);
    onSettled(result.ok);
    if (result.ok) return;
    if (isConnectionError(result.error))
      setError('Connection lost. Check your sheet once you are back: the choice may be saved.');
    else setError(friendlyError(result.error));
  };
  const chosen = EVOLUTION_STEPS.flatMap((s) => {
    const c = card(s);
    return c ? [c] : [];
  });
  const step = walk[at];
  return (
    <dialog
      ref={dialog}
      className="skill-detail skill-selection evolution-choice evolution-steps-choice window"
      aria-labelledby="evolution-heading"
      data-testid="evolution"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="skill-detail-head">
        <h3 id="evolution-heading" tabIndex={-1} ref={heading}>
          Evolution: {evolution.toGrade}-grade
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
      <ol className="evolution-progress" aria-label="Evolution steps">
        {walk.map((s, i) => (
          <li
            key={s}
            className={i === at ? 'current' : i < at ? 'done' : ''}
            aria-current={i === at ? 'step' : undefined}
          >
            {EVOLUTION_STEP_LABEL[s]}
          </li>
        ))}
        <li className={reviewing ? 'current' : ''} aria-current={reviewing ? 'step' : undefined}>
          Review
        </li>
      </ol>
      {blocked && (
        <p className="err" role="status" data-testid="evolution-blocked">
          {blocked}
        </p>
      )}
      {step !== undefined && (
        <section aria-labelledby="evolution-step-heading" data-testid="evolution-step">
          <h4 id="evolution-step-heading" tabIndex={-1} ref={stepHeading}>
            {EVOLUTION_STEP_LABEL[step]}: choose one
          </h4>
          {step === 'profession' && me.profession !== null && (
            <p className="muted">Your profession [{me.profession}] evolves.</p>
          )}
          <ul className="offers" aria-label={`${EVOLUTION_STEP_LABEL[step]} options`}>
            {steps[step].map((o) => (
              <OptionCard
                key={o.id}
                o={o}
                view={view}
                picked={picks[step] === o.id}
                onPick={() => pick(step, o.id)}
              />
            ))}
            {step === 'profession' && noneAllowed && (
              <li className="offer" data-testid="evolution-option">
                <h5>
                  <span className="skill-name">[None for now]</span>
                </h5>
                <p className="offer-description">
                  Keep evolving without a profession. Offered professions stay in your Professions
                  list to take later.
                </p>
                <button
                  type="button"
                  aria-label="Choose none for now"
                  onClick={() => pick('profession', '')}
                >
                  Choose
                </button>
              </li>
            )}
          </ul>
          {at > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setAt(at - 1)}
            >
              Back
            </button>
          )}
        </section>
      )}
      {reviewing && (
        <section className="selection-review" aria-labelledby="evolution-review-heading">
          <h4 id="evolution-review-heading" tabIndex={-1} ref={stepHeading}>
            Review
          </h4>
          <dl className="rows evolution-review" data-testid="evolution-review">
            {walk.map((s) => {
              const c = card(s);
              return (
                <div key={s}>
                  <dt>{EVOLUTION_STEP_LABEL[s]}</dt>
                  <dd>
                    {c ? (
                      <>
                        <span className="skill-name">
                          [{c.name} ({rarityName(rules, c.rarity)})]
                        </span>{' '}
                        <span className="muted">{perLevelText(rules, c)}</span>
                      </>
                    ) : (
                      'None for now'
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {rerate.length > 0 && (
            <details className="evolution-rerate" data-testid="evolution-rerate">
              <summary>Your skills are re-rated for {evolution.toGrade}-grade</summary>
              <ul aria-label="Skill re-rating">
                {rerate.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
          <ul className="evolution-warnings" data-testid="evolution-warnings">
            <li>Evolving refills {poolList(rules.pools)}.</li>
            {stepWarnings(rules, me, chosen).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="assign-actions">
            <button
              type="button"
              disabled={busy || blocked !== null || !picksComplete(steps, me, picks)}
              onClick={() => void confirm()}
            >
              Evolve
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setAt(walk.length - 1)}
            >
              Back
            </button>
          </div>
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

function OptionCard({
  o,
  view,
  picked,
  onPick,
}: {
  o: StepCard;
  view: PlayerView;
  picked: boolean;
  onPick: () => void;
}) {
  const rules = view.rules;
  const bonus = bonusText(rules, o.statBonus);
  return (
    <li className={`offer${picked ? ' picked' : ''}`} data-testid="evolution-option">
      <h5>
        <span className="skill-name">
          [{o.name} ({rarityName(rules, o.rarity)})]
        </span>
      </h5>
      {o.description ? (
        <p className="offer-description">{o.description}</p>
      ) : (
        <p className="muted offer-description">No description.</p>
      )}
      <p className="evolution-per-level">Per level: {perLevelText(rules, o)}</p>
      <p className="evolution-bonus" data-testid="evolution-bonus">
        One-time bonus: {bonus ?? 'none'}
      </p>
      {o.transforms.length > 0 && (
        <ul className="evolution-transforms" aria-label="Skills transformed">
          {o.transforms.map((t) => (
            <li key={t.skill}>{transformText(rules, view.me, t)}</li>
          ))}
        </ul>
      )}
      <button type="button" aria-label={`Choose ${o.name}`} onClick={onPick}>
        Choose
      </button>
    </li>
  );
}
