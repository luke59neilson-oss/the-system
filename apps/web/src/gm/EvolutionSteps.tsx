import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { evolutionTarget, type CampaignState, type ShapeReferenceRow } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import type { EvolutionPlan } from './evolutionBuilderModel';
import {
  STEPS,
  releaseBlockers,
  standingOf,
  stepMeters,
  stepsCommand,
  stepsReleaseProblem,
  type DraftOption,
  type StepId,
} from './evolutionStepsModel';
import { RerateList, TransformRows, type TransformDraft } from './EvolutionBuilder';
import { rowLabel, rowsForStep, scaleShape, type EvolutionReference } from './shapeModel';

interface Card extends DraftOption {
  readonly transforms: readonly TransformDraft[];
}

type Draft = Record<StepId, Card[]>;

const STEP_LABEL: Record<StepId, string> = {
  class: 'Class',
  profession: 'Profession',
  race: 'Race',
};

const wholeNumber = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * ME.3 (DESIGN §2, §9a): the three-step evolution builder. Each step holds
 * option cards (name, rarity, description, the track's points per level at
 * the new grade, a one-time bonus, transforms) with a budget meter; Release
 * lists every reason it is blocked, and Override releases past the budget
 * and waiting-selection ones (GM authority, D303).
 */
export function StepsForm({
  client,
  state,
  characterId,
  plan,
  reference = null,
}: {
  client: LiveClient;
  state: CampaignState;
  characterId: string;
  plan: EvolutionPlan;
  /** ME.4: the reference table's rows, for each card's Use this shape. */
  reference?: EvolutionReference | null;
}) {
  const { rules } = state;
  const character = state.characters[characterId]!;
  const budgets = evolutionTarget(rules, character)?.trackBudget ?? {
    class: 0,
    profession: 0,
    race: 0,
  };
  const statOrder = rules.stats.list.map((st) => st.id);
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  // Ids are unique within a step: the step's letter and one past the highest in use.
  const newId = (step: StepId, cards: readonly Card[] = []) =>
    `${step[0]}${1 + Math.max(0, ...cards.map((o) => Number(o.id.slice(1)) || 0))}`;
  const startCard = (step: StepId, name: string, cards: readonly Card[] = []): Card => {
    const d = character.distributions?.[step];
    return {
      id: newId(step, cards),
      name,
      rarity: plan.rarities.includes('common') ? 'common' : (plan.rarities[0] ?? 'common'),
      description: '',
      stats: { ...(d?.stats ?? {}) },
      // The starting Human race gives free points only (DESIGN §2).
      free: d?.free ?? (step === 'race' && d === undefined ? budgets.race : 0),
      bonus: {},
      transforms: [],
    };
  };
  const [draft, setDraft] = useState<Draft>(() => ({
    class: [startCard('class', character.className)],
    profession:
      character.profession === null ? [] : [startCard('profession', character.profession)],
    race: [startCard('race', character.race)],
  }));
  const [rerate, setRerate] = useState<Record<string, { from: string; rarity: string }>>({});
  const [approvedList, setApprovedList] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // QF.69: "released" describes the draft that went out; an edit makes it a new draft.
  const [released, setReleased] = useState<string | null>(null);
  // ME.4: the reference row each card's shape picker points at (card id → row id).
  const [shapePick, setShapePick] = useState<Record<string, string>>({});

  const picked = (r: { skill: string; from: string; byDefault: string }) => {
    const pick = Object.prototype.hasOwnProperty.call(rerate, r.skill)
      ? rerate[r.skill]
      : undefined;
    return pick !== undefined && pick.from === r.from ? pick.rarity : r.byDefault;
  };
  const rerateList = plan.rerate.map((r) => ({ skill: r.skill, rarity: picked(r) }));
  const listKey = JSON.stringify(rerateList);
  const approved = approvedList === listKey;

  const blockers = releaseBlockers(draft, budgets, character.profession !== null);
  const waits = plan.pendingSelections.map(
    (s) =>
      `Waits on the ${s.capstone ? 'capstone ' : ''}selection at lvl ${s.level}: the player must choose first`,
  );
  const overridable = [...blockers.overridable, ...waits];
  // An Override ticked for problems that are gone does not carry over to new
  // ones: the GM decides again (ME.3 review). (Adjusting state while rendering.)
  if (override && overridable.length === 0) setOverride(false);
  const unnamed = STEPS.flatMap((step) =>
    draft[step].some((o) => o.name.trim() === '')
      ? [`Name every ${STEP_LABEL[step].toLowerCase()} option`]
      : [],
  );
  const transforms = Object.fromEntries(
    STEPS.flatMap((step) =>
      draft[step].map((o) => [
        o.id,
        o.transforms.map((t) => ({
          skill: t.skill,
          ...(t.merge === undefined ? {} : { merge: t.merge }),
          name: t.name.trim(),
          rarity: t.rarity,
        })),
      ]),
    ),
  );
  const command = stepsCommand(characterId, draft, {
    transforms,
    rerate: Object.fromEntries(rerateList.map((r) => [r.skill, r.rarity])),
    override: override && overridable.length > 0,
  });
  const hard = [
    ...blockers.hard,
    ...unnamed,
    ...(approved ? [] : ['Approve the skill re-rating before releasing']),
  ];
  // Only ask the engine once the draft is otherwise ready, so its message is
  // the one thing left (every combination checked, D303).
  // Memoised on the command, so typing elsewhere does not re-run every
  // combination check (ME.3 review).
  const commandKey = JSON.stringify(command);
  const askEngine = hard.length === 0 && (overridable.length === 0 || override);
  const engineProblem = useMemo(
    () =>
      askEngine
        ? stepsReleaseProblem(
            state,
            JSON.parse(commandKey) as Parameters<typeof stepsReleaseProblem>[1],
          )
        : null,
    [askEngine, state, commandKey],
  );
  const blocked =
    hard.length > 0 || (overridable.length > 0 && !override) || engineProblem !== null;

  const setStep = (step: StepId, cards: Card[]) => setDraft({ ...draft, [step]: cards });
  const setCard = (step: StepId, i: number, patch: Partial<Card>) =>
    setStep(
      step,
      draft[step].map((o, j) => (j === i ? { ...o, ...patch } : o)),
    );

  const release = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    if (r.ok) setOverride(false);
    setReleased(r.ok ? `Evolution released to ${character.name}` : null);
    setResult(r.ok ? null : { ok: false, text: friendlyError(r.error) });
  };
  useEffect(() => setReleased(null), [draft, rerate]);
  const merged = new Set(
    STEPS.flatMap((step) =>
      draft[step].flatMap((o) => o.transforms.flatMap((t) => (t.merge ? [t.skill, t.merge] : []))),
    ),
  );
  const standing = standingOf(state, characterId);

  return (
    <form onSubmit={release} aria-label="Evolution release" className="evolution-steps">
      {standing && (
        <aside className="evolution-standing" aria-label="Standing">
          <h3>
            {character.name}: {standing.grade}-grade → {plan.toGrade}-grade
          </h3>
          <p>{standing.levels}</p>
          <p className="standing-stats">
            {standing.stats.map((s) => `${s.name} ${s.value}`).join(' · ')}
            {standing.freePoints > 0 ? ` · ${standing.freePoints} free points unassigned` : ''}
          </p>
          <p>Skills: {standing.skills.map((s) => `[${s}]`).join(', ')}</p>
          <p>
            Practised:{' '}
            {standing.practised.length === 0
              ? 'nothing logged yet'
              : standing.practised.map((p) => `${p.skill} ×${p.count}`).join(', ')}
            {standing.pairs.length > 0 &&
              `; together: ${standing.pairs.map((p) => `${p.skills[0]} + ${p.skills[1]} ×${p.count}`).join(', ')}`}
          </p>
        </aside>
      )}
      {plan.released && (
        <p className="muted" data-testid="evolution-released">
          Released, player choosing: {plan.released.map((n) => `[${n}]`).join(', ')}. Releasing
          again replaces it.
        </p>
      )}
      {STEPS.map((step) => {
        const meters = stepMeters(draft[step], budgets[step]);
        return (
          <section key={step} className="evolution-step" aria-label={`${STEP_LABEL[step]} step`}>
            <h3>
              {STEP_LABEL[step]} step{' '}
              <span className="muted">
                ({budgets[step]} points per {step} level at {plan.toGrade}-grade)
              </span>
            </h3>
            {step === 'profession' && character.profession === null && (
              <p className="muted">
                No profession yet: the player may also pick &ldquo;none for now&rdquo;; the options
                stay offered.
              </p>
            )}
            <div className="option-cards">
              {draft[step].map((o, i) => {
                const m = meters[i]!;
                const label = `${STEP_LABEL[step]} option ${i + 1}`;
                return (
                  <fieldset key={o.id} className="option-card">
                    <legend>{label}</legend>
                    <label>
                      Name{' '}
                      <input
                        value={o.name}
                        maxLength={80}
                        onChange={(e) => setCard(step, i, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      Rarity{' '}
                      <select
                        value={o.rarity}
                        onChange={(e) => setCard(step, i, { rarity: e.target.value })}
                      >
                        {plan.rarities.map((r) => (
                          <option key={r} value={r}>
                            {rarityName(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Description{' '}
                      <input
                        value={o.description}
                        maxLength={1000}
                        onChange={(e) => setCard(step, i, { description: e.target.value })}
                      />
                    </label>
                    <fieldset className="stat-grid">
                      <legend>Per level</legend>
                      {rules.stats.list.map((st) => (
                        <label key={st.id}>
                          {st.name} per level{' '}
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={o.stats[st.id] ?? 0}
                            onChange={(e) =>
                              setCard(step, i, {
                                stats: { ...o.stats, [st.id]: wholeNumber(e.target.value) },
                              })
                            }
                          />
                        </label>
                      ))}
                      <label>
                        Free points per level{' '}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={o.free}
                          onChange={(e) => setCard(step, i, { free: wholeNumber(e.target.value) })}
                        />
                      </label>
                    </fieldset>
                    {reference !== null && (
                      <ShapePicker
                        label={label}
                        rows={rowsForStep(reference, step)}
                        value={shapePick[`${step}:${o.id}`] ?? ''}
                        onPick={(id) => setShapePick({ ...shapePick, [`${step}:${o.id}`]: id })}
                        onUse={(row) => {
                          const scaled = scaleShape(row, budgets[step], statOrder);
                          if (scaled !== null) {
                            setCard(step, i, { stats: scaled.stats, free: scaled.free });
                            setResult(null);
                          } else {
                            setResult({
                              ok: false,
                              text: `Could not use [${row.name}] at a budget of ${budgets[step]}`,
                            });
                          }
                        }}
                      />
                    )}
                    <details className="stat-bonus">
                      <summary>One-time bonus ({m.bonus})</summary>
                      <div className="stat-grid">
                        {rules.stats.list.map((st) => (
                          <label key={st.id}>
                            {st.name} bonus{' '}
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={o.bonus[st.id] ?? 0}
                              onChange={(e) =>
                                setCard(step, i, {
                                  bonus: { ...o.bonus, [st.id]: wholeNumber(e.target.value) },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                    <p className="budget-meter" data-testid="budget-meter">
                      <span className={m.perLevelDiff === 0 ? 'ok' : 'err'}>
                        Per level {m.perLevel} / {m.budget}
                        {m.perLevelDiff !== 0 && ` (${signed(m.perLevelDiff)})`}
                      </span>
                      {' · '}
                      <span className={m.bonusDiff === 0 ? 'ok' : 'err'}>
                        One-time bonus {m.bonus}
                        {m.bonusDiff !== 0 && ` (${signed(m.bonusDiff)} against option 1)`}
                      </span>
                    </p>
                    <TransformRows
                      plan={plan}
                      skills={character.skills.map((k) => k.name)}
                      rarityName={rarityName}
                      transforms={[...o.transforms]}
                      onChange={(t) => setCard(step, i, { transforms: t })}
                    />
                    <div className="row">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Duplicate ${label.toLowerCase()}`}
                        disabled={draft[step].length >= rules.skills.menuSize.max}
                        onClick={() =>
                          setStep(step, [
                            ...draft[step].slice(0, i + 1),
                            { ...o, id: newId(step, draft[step]), name: `${o.name} (copy)` },
                            ...draft[step].slice(i + 1),
                          ])
                        }
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Remove ${label.toLowerCase()}`}
                        onClick={() =>
                          setStep(
                            step,
                            draft[step].filter((_, j) => j !== i),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <button
              type="button"
              disabled={draft[step].length >= rules.skills.menuSize.max}
              onClick={() =>
                setStep(step, [
                  ...draft[step],
                  { ...startCard(step, '', draft[step]), stats: {}, free: 0 },
                ])
              }
            >
              Add {step} option
            </button>
          </section>
        );
      })}
      <RerateList
        plan={plan}
        rarityName={rarityName}
        picked={picked}
        merged={merged}
        onPick={(skill, from, rarity) => setRerate({ ...rerate, [skill]: { from, rarity } })}
        approved={approved}
        onApprove={(on) => setApprovedList(on ? listKey : null)}
      />
      {plan.mergePrompts.length > 0 && (
        <p className="muted" data-testid="merge-prompts">
          Merge ready:{' '}
          {plan.mergePrompts.map((m) => `[${m.skills[0]}] + [${m.skills[1]}]`).join(', ')}. Offer it
          as part of this evolution with an option&rsquo;s &ldquo;Offer merge&rdquo; button.
        </p>
      )}
      <div className="release-bar">
        {(hard.length > 0 || overridable.length > 0 || engineProblem !== null) && (
          <ul className="release-blockers" aria-label="Why Release is blocked" aria-live="polite">
            {hard.map((p) => (
              <li key={p} className="err">
                {p}
              </li>
            ))}
            {overridable.map((p) => (
              <li key={p} className={override ? 'muted' : 'err'}>
                {p}
                {override ? ' (overridden)' : ''}
              </li>
            ))}
            {engineProblem !== null && (
              <li className="err" data-testid="release-problem">
                {engineProblem}
              </li>
            )}
          </ul>
        )}
        {overridable.length > 0 && (
          <label className="check override-toggle">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override: release anyway (GM authority). Logged, and undoable in the change log.
          </label>
        )}
        <button type="submit" disabled={busy || blocked}>
          Release evolution
        </button>
        {released && (
          <p className="ok" role="status">
            {released}
          </p>
        )}
        {result && (
          <p className={result.ok ? 'ok' : 'err'} role={result.ok ? 'status' : 'alert'}>
            {result.text}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * ME.4 (DESIGN §4): pick a reference row (the step's own track first) and
 * **Use this shape** to fill the card's per-level stats and free points with
 * that shape scaled to the step's budget (exact total, free kept free).
 */
function ShapePicker({
  label,
  rows,
  value,
  onPick,
  onUse,
}: {
  label: string;
  rows: readonly ShapeReferenceRow[];
  value: string;
  onPick: (id: string) => void;
  onUse: (row: ShapeReferenceRow) => void;
}) {
  if (rows.length === 0) return null;
  const row = rows.find((r) => r.id === value) ?? rows[0]!;
  return (
    <div className="row shape-picker">
      <label>
        Shape{' '}
        <select
          aria-label={`Shape for ${label.toLowerCase()}`}
          value={row.id}
          onChange={(e) => onPick(e.target.value)}
        >
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {rowLabel(r)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        aria-label={`Use this shape for ${label.toLowerCase()}`}
        onClick={() => onUse(row)}
      >
        Use this shape
      </button>
    </div>
  );
}
