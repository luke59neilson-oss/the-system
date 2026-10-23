import { useState, type FormEvent } from 'react';
import type { CampaignState, EvolutionOption } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  evolutionPlan,
  releaseProblem,
  withdrawableOffers,
  type EvolutionPlan,
} from './evolutionBuilderModel';

interface TransformDraft {
  skill: string;
  /** A second skill merged in (M5.2), from a merge prompt. */
  merge?: string;
  name: string;
  rarity: string;
}

interface OptionDraft {
  className: string;
  description: string;
  /** "+N to all" one-time bonus (DESIGN §2), added to each per-stat bonus. */
  allBonus: number;
  /** Extra one-time bonus per stat id. */
  bonus: Record<string, number>;
  /** Reshaped class weights (DESIGN §4), or null to keep the current ones. */
  weights: Record<string, number> | null;
  /** Optional skill transforms (DESIGN §6: rare; config minimum 0). */
  transforms: TransformDraft[];
}

const blankOption = (className = ''): OptionDraft => ({
  className,
  description: '',
  allBonus: 0,
  bonus: {},
  weights: null,
  transforms: [],
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
      <ProfessionOffers client={client} state={state} />
    </section>
  );
}

/**
 * Untaken profession offers with a Withdraw button (M5.2, MQ.6 review): from
 * the Professions tab and from a release still waiting on the player.
 */
function ProfessionOffers({ client, state }: { client: LiveClient; state: CampaignState }) {
  const rows = withdrawableOffers(state);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (rows.length === 0) return null;
  const withdraw = async (characterId: string, name: string, profession: string) => {
    if (!window.confirm(`Withdraw the [${profession}] offer from ${name}?`)) return;
    const r = await client.command({ type: 'profession.withdrawOffer', characterId, profession });
    setResult(
      r.ok
        ? { ok: true, text: `[${profession}] withdrawn from ${name}` }
        : { ok: false, text: friendlyError(r.error) },
    );
  };
  return (
    <>
      <h3>Untaken profession offers</h3>
      <ul className="profession-offers" aria-label="Untaken profession offers">
        {rows.flatMap((row) =>
          row.offers.map((p) => (
            <li key={`${row.characterId}:${p}`}>
              {row.name}: [{p}]{' '}
              <button
                type="button"
                className="secondary"
                aria-label={`Withdraw ${p} from ${row.name}`}
                onClick={() => void withdraw(row.characterId, row.name, p)}
              >
                Withdraw
              </button>
            </li>
          )),
        )}
      </ul>
      {result && (
        <p className={result.ok ? 'ok' : 'err'} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
    </>
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
    transforms: o.transforms.map((t) => ({
      skill: t.skill,
      ...(t.merge === undefined ? {} : { merge: t.merge }),
      name: t.name.trim(),
      rarity: t.rarity,
    })),
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
        ...(o.transforms.length > 0 ? { transforms: o.transforms } : {}),
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
          <TransformRows
            plan={plan}
            skills={character?.skills.map((k) => k.name) ?? []}
            rarityName={rarityName}
            transforms={o.transforms}
            onChange={(transforms) => setOption(i, { transforms })}
          />
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
          Merge ready:{' '}
          {plan.mergePrompts.map((m) => `[${m.skills[0]}] + [${m.skills[1]}]`).join(', ')}. Offer it
          as part of this evolution with an option&rsquo;s &ldquo;Offer merge&rdquo; button.
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

/**
 * An option's transforms (DESIGN §6): existing skill → new name and rarity,
 * up to `skills.evolutionTransforms.max`; a merge prompt adds a row that
 * merges the pair (the second skill is consumed).
 */
function TransformRows({
  plan,
  skills,
  rarityName,
  transforms,
  onChange,
}: {
  plan: EvolutionPlan;
  skills: readonly string[];
  rarityName: (id: string) => string;
  transforms: TransformDraft[];
  onChange: (next: TransformDraft[]) => void;
}) {
  const full = transforms.length >= plan.transforms.max;
  const used = new Set(transforms.flatMap((t) => (t.merge ? [t.skill, t.merge] : [t.skill])));
  const free = skills.filter((k) => !used.has(k));
  const set = (i: number, patch: Partial<TransformDraft>) =>
    onChange(transforms.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const lowest = plan.rarities[0] ?? '';
  return (
    <div className="transforms">
      <p className="muted">
        Skill transforms (optional, up to {plan.transforms.max})
        {transforms.length === 0 ? ': none' : ''}
      </p>
      {transforms.map((t, i) => (
        <div key={i} className="row transform-row" role="group" aria-label={`Transform ${i + 1}`}>
          {t.merge ? (
            <span>
              Merge [{t.skill}] + [{t.merge}] →
            </span>
          ) : (
            <label>
              Skill{' '}
              <select value={t.skill} onChange={(e) => set(i, { skill: e.target.value })}>
                {[t.skill, ...free].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            New name{' '}
            <input
              value={t.name}
              maxLength={80}
              onChange={(e) => set(i, { name: e.target.value })}
            />
          </label>
          <label>
            Rarity{' '}
            <select value={t.rarity} onChange={(e) => set(i, { rarity: e.target.value })}>
              {plan.rarities.map((r) => (
                <option key={r} value={r}>
                  {rarityName(r)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            aria-label={`Remove transform ${i + 1}`}
            onClick={() => onChange(transforms.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={full || free.length === 0}
          onClick={() =>
            onChange([
              ...transforms,
              {
                skill: free[0] ?? '',
                name: free[0] ?? '',
                rarity: plan.rerate.find((r) => r.skill === free[0])?.from ?? lowest,
              },
            ])
          }
        >
          Add transform
        </button>
        {plan.mergePrompts.map((m) => (
          <button
            key={m.skills.join('+')}
            type="button"
            disabled={full || used.has(m.skills[0]) || used.has(m.skills[1])}
            onClick={() =>
              onChange([
                ...transforms,
                { skill: m.skills[0], merge: m.skills[1], name: '', rarity: m.rarity },
              ])
            }
          >
            Offer merge [{m.skills[0]}] + [{m.skills[1]}]
          </button>
        ))}
      </div>
    </div>
  );
}
