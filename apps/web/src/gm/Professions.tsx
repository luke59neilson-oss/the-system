import { useState, type FormEvent } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

type Outcome = { ok: boolean; text: string } | null;
type Track = 'class' | 'profession' | 'race';
const TRACKS: readonly { id: Track; label: string }[] = [
  { id: 'class', label: 'Class' },
  { id: 'profession', label: 'Profession' },
  { id: 'race', label: 'Race' },
];

/** Whole, non-negative numbers from the boxes (blank = 0); null when one is not. */
function wholeNumbers(values: Record<string, string>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    const t = v.trim();
    if (t === '') continue;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n > 0) out[k] = n;
  }
  return out;
}

function sum(record: Readonly<Record<string, number>>): number {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

/** The track's points per level at the character's grade, from the rules (null on old numbers). */
function budgetOf(state: CampaignState, grade: string, track: Track): number | null {
  return state.rules.grades.find((g) => g.id === grade)?.trackBudget?.[track] ?? null;
}

function CharacterPicker({
  state,
  value,
  onChange,
}: {
  state: CampaignState;
  value: string;
  onChange: (id: string) => void;
}) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  return (
    <label>
      Character
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {ids.map((id) => (
          <option key={id} value={id}>
            {state.characters[id]?.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Per-stat number boxes plus free points (and an optional label prefix). */
function StatBoxes({
  state,
  prefix,
  values,
  onChange,
}: {
  state: CampaignState;
  prefix: string;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div className="stat-boxes">
      {state.rules.stats.list.map((s) => (
        <label key={s.id}>
          {s.name}
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-label={`${prefix} ${s.name}`}
            value={values[s.id] ?? ''}
            onChange={(e) => onChange({ ...values, [s.id]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * ME.6 (b, DESIGN §2): the GM offers a character professions at any time
 * while they have none, each optionally with the per-level stats (and the
 * one-time bonus) it brings when taken. Lists the offers with Withdraw.
 */
export function Professions({ client, state }: { client: LiveClient; state: CampaignState }) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const [name, setName] = useState('');
  const [withStats, setWithStats] = useState(false);
  const [stats, setStats] = useState<Record<string, string>>({});
  const [free, setFree] = useState('');
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const reset = () => {
    setName('');
    setWithStats(false);
    setStats({});
    setFree('');
    setBonus({});
  };
  const budget = character ? budgetOf(state, character.grade, 'profession') : null;
  const perLevel = wholeNumbers(stats);
  const freeN = free.trim() === '' ? 0 : Number(free);
  const bonusN = wholeNumbers(bonus);
  const total = perLevel && Number.isInteger(freeN) && freeN >= 0 ? sum(perLevel) + freeN : null;
  const offerName = name.trim();
  const problem =
    offerName === ''
      ? 'Name the profession.'
      : character?.professionOffers.includes(offerName)
        ? `[${offerName}] is already offered.`
        : withStats && (total === null || bonusN === null)
          ? 'Per-level stats and bonus take whole numbers of 0 or more.'
          : withStats && total === 0
            ? 'Give the profession at least one point per level.'
            : null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || problem !== null) return;
    setBusy(true);
    const r = await client.command({
      type: 'profession.offer',
      characterId,
      profession: offerName,
      ...(withStats && perLevel && bonusN
        ? { distribution: { stats: perLevel, free: freeN }, statBonus: bonusN }
        : {}),
    });
    setBusy(false);
    if (!r.ok) {
      setOutcome({ ok: false, text: friendlyError(r.error) });
      return;
    }
    setOutcome({ ok: true, text: `Offered [${offerName}] to ${character.name}.` });
    reset();
  };
  const withdraw = async (profession: string) => {
    setBusy(true);
    const r = await client.command({ type: 'profession.withdrawOffer', characterId, profession });
    setBusy(false);
    setOutcome(
      r.ok
        ? { ok: true, text: `Withdrew [${profession}] from ${character?.name ?? ''}.` }
        : { ok: false, text: friendlyError(r.error) },
    );
  };

  const perLevelText = (cardStats: Readonly<Record<string, number>>, cardFree: number) => {
    const parts = state.rules.stats.list
      .filter((s) => (cardStats[s.id] ?? 0) > 0)
      .map((s) => `+${cardStats[s.id]} ${s.name}`);
    return [...parts, `${cardFree} free`].join(', ');
  };

  return (
    <section className="window professions" aria-labelledby="gm-professions-heading">
      <h2 id="gm-professions-heading">Professions</h2>
      {!character ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <>
          <CharacterPicker
            state={state}
            value={characterId}
            onChange={(id) => {
              setPicked(id);
              setOutcome(null);
              reset();
            }}
          />
          {outcome && (
            <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
              {outcome.text}
            </p>
          )}
          {character.profession !== null ? (
            <p className="muted" data-testid="gm-professions-locked">
              {character.name} has the profession [{character.profession}]; the offers are locked.
            </p>
          ) : (
            <form onSubmit={(e) => void send(e)} aria-label="Offer a profession">
              <label>
                Profession name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={withStats}
                  onChange={(e) => setWithStats(e.target.checked)}
                />
                Set its per-level stats and one-time bonus
              </label>
              {withStats && (
                <fieldset aria-label="Per-level stats">
                  <legend>
                    Per profession level
                    {budget !== null && ` (budget at ${character.grade}: ${budget})`}
                  </legend>
                  <StatBoxes state={state} prefix="Per level" values={stats} onChange={setStats} />
                  <label>
                    Free points
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Per level free points"
                      value={free}
                      onChange={(e) => setFree(e.target.value)}
                    />
                  </label>
                  <p
                    className={budget !== null && total !== budget ? 'warn' : 'muted'}
                    data-testid="profession-offer-total"
                  >
                    Total {total ?? '?'}
                    {budget !== null && ` of ${budget}`} per level
                    {budget !== null &&
                      total !== budget &&
                      ' (levels grant the budget, scaled to this shape)'}
                  </p>
                  <details>
                    <summary>One-time bonus when taken</summary>
                    <StatBoxes state={state} prefix="Bonus" values={bonus} onChange={setBonus} />
                  </details>
                </fieldset>
              )}
              {problem !== null && offerName !== '' && (
                <p className="warn" role="status">
                  {problem}
                </p>
              )}
              <button type="submit" disabled={busy || problem !== null}>
                Offer profession
              </button>
            </form>
          )}
          <h3>Offered to {character.name}</h3>
          {character.professionOffers.length === 0 ? (
            <p className="muted">No profession offers.</p>
          ) : (
            <ul aria-label="Profession offers" data-testid="profession-offers">
              {character.professionOffers.map((p) => {
                const card = character.professionOfferCards?.[p];
                return (
                  <li key={p}>
                    <span className="skill-name">[{p}]</span>{' '}
                    <span className="muted">
                      {card
                        ? `Per level: ${perLevelText(card.distribution.stats, card.distribution.free)}`
                        : 'Per level: the class shape (default)'}
                      {card && sum(card.statBonus) > 0
                        ? `; bonus ${perLevelText(card.statBonus, 0).replace(/, 0 free$/, '')}`
                        : ''}
                    </span>
                    {character.profession === null && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`Withdraw ${p}`}
                        onClick={() => void withdraw(p)}
                      >
                        Withdraw
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/**
 * ME.6 (c, DESIGN §2, §4): the GM sets what one level of a character's
 * class, profession or race grants (whole points per stat plus free
 * points), or resets it to the default (D301). Applies from the next level.
 */
export function TrackStats({ client, state }: { client: LiveClient; state: CampaignState }) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const [track, setTrack] = useState<Track>('class');
  const boxesOf = (id: string, t: Track) => {
    const d = state.characters[id]?.distributions?.[t] ?? null;
    return {
      stats: d ? Object.fromEntries(Object.entries(d.stats).map(([k, v]) => [k, String(v)])) : {},
      free: d ? String(d.free) : '',
    };
  };
  const [stats, setStats] = useState<Record<string, string>>(
    () => boxesOf(characterId, 'class').stats,
  );
  const [free, setFree] = useState(() => boxesOf(characterId, 'class').free);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const current = character?.distributions?.[track] ?? null;
  const load = (id: string, t: Track) => {
    const b = boxesOf(id, t);
    setStats(b.stats);
    setFree(b.free);
  };
  const budget = character ? budgetOf(state, character.grade, track) : null;
  const perLevel = wholeNumbers(stats);
  const freeN = free.trim() === '' ? 0 : Number(free);
  const total = perLevel && Number.isInteger(freeN) && freeN >= 0 ? sum(perLevel) + freeN : null;
  const problem =
    total === null
      ? 'Use whole numbers of 0 or more.'
      : total === 0
        ? 'Give at least one point per level.'
        : null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || problem !== null || !perLevel) return;
    setBusy(true);
    const r = await client.command({
      type: 'character.setDistribution',
      characterId,
      track,
      distribution: { stats: perLevel, free: freeN },
    });
    setBusy(false);
    setOutcome(
      r.ok
        ? {
            ok: true,
            text: `${character.name}'s ${track} per-level stats saved; they apply from the next level.`,
          }
        : { ok: false, text: friendlyError(r.error) },
    );
  };
  const clear = async () => {
    if (!character) return;
    setBusy(true);
    const r = await client.command({
      type: 'character.setDistribution',
      characterId,
      track,
      distribution: null,
    });
    setBusy(false);
    if (r.ok) {
      setStats({});
      setFree('');
    }
    setOutcome(
      r.ok
        ? {
            ok: true,
            text: `${character.name}'s ${track} per-level stats are back to the default.`,
          }
        : { ok: false, text: friendlyError(r.error) },
    );
  };

  return (
    <section className="window track-stats" aria-labelledby="track-stats-heading">
      <h2 id="track-stats-heading">Per-level stats</h2>
      {!character ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <form onSubmit={(e) => void save(e)} aria-label="Per-level stats">
          <CharacterPicker
            state={state}
            value={characterId}
            onChange={(id) => {
              setPicked(id);
              setOutcome(null);
              load(id, track);
            }}
          />
          <label>
            Track
            <select
              value={track}
              onChange={(e) => {
                const t = e.target.value as Track;
                setTrack(t);
                setOutcome(null);
                load(characterId, t);
              }}
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" data-testid="track-stats-current">
            {current
              ? 'Set by the GM or an evolution.'
              : track === 'race'
                ? 'Default: every point is a free point.'
                : 'Default: the class’s stat weights.'}
            {budget !== null && ` ${character.grade} budget: ${budget} per level.`}
          </p>
          {outcome && (
            <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
              {outcome.text}
            </p>
          )}
          <StatBoxes state={state} prefix="Per level" values={stats} onChange={setStats} />
          <label>
            Free points
            <input
              type="number"
              min={0}
              step={1}
              aria-label="Per level free points"
              value={free}
              onChange={(e) => setFree(e.target.value)}
            />
          </label>
          <p
            className={budget !== null && total !== budget ? 'warn' : 'muted'}
            data-testid="track-stats-total"
          >
            Total {total ?? '?'}
            {budget !== null && ` of ${budget}`} per level
            {budget !== null &&
              total !== budget &&
              ' (levels grant the budget, scaled to this shape)'}
          </p>
          <div className="assign-actions">
            <button type="submit" disabled={busy || problem !== null}>
              Save per-level stats
            </button>
            {current && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void clear()}
              >
                Reset to default
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
