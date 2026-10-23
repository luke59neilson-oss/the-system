import { useState, type FormEvent } from 'react';
import type { CampaignState, EvolutionOption } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { evolutionPlan, releaseProblem, type EvolutionPlan } from './evolutionBuilderModel';

interface OptionDraft {
  className: string;
  description: string;
  /** "+N to all" one-time bonus (DESIGN §2), added to each per-stat bonus. */
  allBonus: number;
  /** Extra one-time bonus per stat id. */
  bonus: Record<string, number>;
  /** Reshaped class weights (DESIGN §4), or null to keep the current ones. */
  weights: Record<string, number> | null;
}

const blankOption = (className = ''): OptionDraft => ({
  className,
  description: '',
  allBonus: 0,
  bonus: {},
  weights: null,
});

const wholeNumber = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * GM evolution builder (ROADMAP M5.2, DESIGN §2/§6; work in progress): for a
 * character whose evolution is available, the options with a one-time stat
 * bonus, tailored profession offers, per-skill re-rating and the merge
 * prompts, checked against the engine before release.
 */
export function EvolutionBuilder({ client, state }: { client: LiveClient; state: CampaignState }) {
  const ready = state.characterOrder.flatMap((id) => {
    const plan = evolutionPlan(state, id);
    return plan ? [{ id, plan }] : [];
  });
  const [picked, setPicked] = useState('');
  const current = ready.find((r) => r.id === picked) ?? ready[0];
  return (
    <section className="window evolution-builder" aria-labelledby="evolution-builder">
      <h2 id="evolution-builder">Evolutions</h2>
      {current === undefined ? (
        <p className="muted" data-testid="no-evolution">
          No evolution available: none of the party is at the top of their grade.
        </p>
      ) : (
        <>
          <label>
            Character{' '}
            <select value={current.id} onChange={(e) => setPicked(e.target.value)}>
              {ready.map((r) => (
                <option key={r.id} value={r.id}>
                  {state.characters[r.id]?.name} → {r.plan.toGrade}-grade
                </option>
              ))}
            </select>
          </label>
          <ReleaseForm
            key={current.id}
            client={client}
            state={state}
            characterId={current.id}
            plan={current.plan}
          />
        </>
      )}
    </section>
  );
}

function ReleaseForm({
  client,
  state,
  characterId,
  plan,
}: {
  client: LiveClient;
  state: CampaignState;
  characterId: string;
  plan: EvolutionPlan;
}) {
  const { rules } = state;
  const character = state.characters[characterId];
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const [options, setOptions] = useState<OptionDraft[]>([blankOption(character?.className ?? '')]);
  const [professions, setProfessions] = useState('');
  const [rerate, setRerate] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.rerate.map((r) => [r.skill, r.byDefault])),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const engineOptions: EvolutionOption[] = options.map((o, i) => ({
    id: `o${i + 1}`,
    className: o.className.trim(),
    description: o.description.trim(),
    transforms: [],
    classWeights: o.weights,
    statBonus: Object.fromEntries(
      rules.stats.list
        .map((s) => [s.id, o.allBonus + (o.bonus[s.id] ?? 0)] as const)
        .filter(([, n]) => n > 0),
    ),
  }));
  const offered = plan.professionOffers
    ? professions
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p !== '')
    : [];
  const rerateList = Object.entries(rerate).map(([skill, rarity]) => ({ skill, rarity }));
  const problem = releaseProblem(state, characterId, engineOptions, offered, rerateList);

  const release = async (e: FormEvent) => {
    e.preventDefault();
    if (problem !== null) return;
    setBusy(true);
    const r = await client.command({
      type: 'evolution.release',
      characterId,
      options: engineOptions.map((o) => ({
        className: o.className,
        ...(o.description ? { description: o.description } : {}),
        ...(Object.keys(o.statBonus).length > 0 ? { statBonus: o.statBonus } : {}),
        ...(o.classWeights ? { classWeights: o.classWeights } : {}),
      })),
      ...(offered.length > 0 ? { professions: offered } : {}),
      rerate,
    });
    setBusy(false);
    setResult(
      r.ok
        ? { ok: true, text: `Evolution released to ${character?.name ?? 'the player'}` }
        : { ok: false, text: friendlyError(r.error) },
    );
  };
  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    setOptions(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <form onSubmit={release} aria-label="Evolution release">
      {plan.released && (
        <p className="muted" data-testid="evolution-released">
          Released, player choosing: {plan.released.map((n) => `[${n}]`).join(', ')}. Releasing
          again replaces it.
        </p>
      )}
      {plan.pendingSelections.length > 0 && (
        <p className="err" data-testid="evolution-waits">
          Waits on{' '}
          {plan.pendingSelections
            .map((s) => `the ${s.capstone ? 'capstone ' : ''}selection at lvl ${s.level}`)
            .join(', ')}
          : the player must choose first.
        </p>
      )}
      {options.map((o, i) => (
        <fieldset key={i} className="offer-row">
          <legend>Option {i + 1}</legend>
          <label>
            Class name{' '}
            <input
              value={o.className}
              maxLength={80}
              onChange={(e) => setOption(i, { className: e.target.value })}
            />
          </label>
          <label>
            Bonus to all stats{' '}
            <input
              type="number"
              min={0}
              step={1}
              value={o.allBonus}
              onChange={(e) => setOption(i, { allBonus: wholeNumber(e.target.value) })}
            />
          </label>
          <details className="stat-bonus">
            <summary>Bonus per stat</summary>
            {rules.stats.list.map((st) => (
              <label key={st.id}>
                {st.name}{' '}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={o.bonus[st.id] ?? 0}
                  onChange={(e) =>
                    setOption(i, { bonus: { ...o.bonus, [st.id]: wholeNumber(e.target.value) } })
                  }
                />
              </label>
            ))}
          </details>
          <details className="stat-bonus">
            <summary>Reshape the class spread{o.weights ? ' (changed)' : ''}</summary>
            {rules.stats.list.map((st) => (
              <label key={st.id}>
                {st.name} weight{' '}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={(o.weights ?? character?.classWeights ?? {})[st.id] ?? 0}
                  onChange={(e) =>
                    setOption(i, {
                      weights: {
                        ...(o.weights ?? character?.classWeights ?? {}),
                        [st.id]: wholeNumber(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            {o.weights && (
              <button type="button" onClick={() => setOption(i, { weights: null })}>
                Keep the current spread
              </button>
            )}
          </details>
          <label>
            Description{' '}
            <input
              value={o.description}
              maxLength={1000}
              onChange={(e) => setOption(i, { description: e.target.value })}
            />
          </label>
        </fieldset>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={options.length >= rules.skills.menuSize.max}
          onClick={() => setOptions([...options, blankOption()])}
        >
          Add option
        </button>
        <button
          type="button"
          disabled={options.length <= 1}
          onClick={() => setOptions(options.slice(0, -1))}
        >
          Remove last
        </button>
      </div>
      {plan.professionOffers && (
        <label>
          Professions to offer (one per line; none is fine){' '}
          <textarea value={professions} onChange={(e) => setProfessions(e.target.value)} />
        </label>
      )}
      <h3>Skills after the evolution</h3>
      <ul className="rerate" aria-label="Re-rating">
        {plan.rerate.map((r) => (
          <li key={r.skill}>
            <label>
              [{r.skill}] {rarityName(r.from)} →{' '}
              <select
                value={rerate[r.skill] ?? r.byDefault}
                onChange={(e) => setRerate({ ...rerate, [r.skill]: e.target.value })}
              >
                {r.choices.map((x) => (
                  <option key={x} value={x}>
                    {rarityName(x)}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      {plan.mergePrompts.length > 0 && (
        <p className="muted" data-testid="merge-prompts">
          Merge ready (consider offering it as part of this evolution):{' '}
          {plan.mergePrompts.map(([a, b]) => `[${a}] + [${b}]`).join(', ')}
        </p>
      )}
      <button type="submit" disabled={busy || problem !== null}>
        Release evolution
      </button>
      {problem !== null && (
        <p className="err" data-testid="release-problem">
          {problem}
        </p>
      )}
      {result && (
        <p className={result.ok ? 'ok' : 'err'} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
    </form>
  );
}
