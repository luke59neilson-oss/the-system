import { useRef, useState, type FormEvent } from 'react';
import { contestPracticeCommands } from './practiceDraftsModel';
import type { CampaignState, Command, GradeGapMode } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  clockRows,
  contestPlan,
  emptySide,
  factorText,
  montageProgress,
  outcomeText,
  percent,
  poolChange,
  poolCommand,
  recentContests,
  rollPlan,
  shareCommand,
  refreshSide,
  sideDraftFor,
  sideOptions,
  type PoolChangeInput,
  type RolledContest,
  type SideDraft,
  type SideSource,
} from './encounterModel';

type Outcome = { ok: boolean; text: string } | null;

const MODES: readonly { id: GradeGapMode; label: string }[] = [
  { id: 'gradeWalls', label: 'Grade walls' },
  { id: 'none', label: 'None (pure ratio odds)' },
  { id: 'multiplier', label: 'Grade multiplier' },
  { id: 'lowerGradeFraction', label: 'Lower grade ×⅓' },
];

/** A random number in [0, 1) from the browser's crypto source. */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 2 ** 32;
}

/**
 * GM encounter panel (ROADMAP M7.3, DESIGN §7): a ratio-odds roller with the
 * grade-gap mode, damage and healing on a character's pools (with the grade
 * walls' damage factor), and progress clocks with the montage trigger. Rolls
 * stay on the GM's screen until shared; a shared roll is an event and its
 * players get a result pop-up.
 */
export function Encounter({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const send = async (command: Command, ok: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: ok } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };
  return (
    // QF.46: any change in the contest, pool or clock fields clears the old line.
    <section
      className="window encounter"
      aria-labelledby="encounter"
      onChange={() => setOutcome(null)}
    >
      <h2 id="encounter">Encounter</h2>
      <ContestRoller state={state} busy={busy} send={send} clear={() => setOutcome(null)} />
      <PoolTool state={state} busy={busy} send={send} />
      <Clocks state={state} busy={busy} send={send} />
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
    </section>
  );
}

interface ToolProps {
  state: CampaignState;
  busy: boolean;
  send: (command: Command, ok: string) => Promise<boolean>;
  /** QF.46: an old outcome line goes when the GM starts something new. */
  clear?: () => void;
}

function ContestRoller({ state, busy, send, clear }: ToolProps) {
  const options = sideOptions(state);
  const firstChar = options.find((o) => o.source.startsWith('c:'))?.source ?? 'custom';
  const firstStat = state.rules.stats.list[0]?.id ?? '';
  const [a, setA] = useState<SideDraft>(() => sideDraftFor(state, firstChar, firstStat));
  const [b, setB] = useState<SideDraft>(() => emptySide(state));
  const [mode, setMode] = useState<GradeGapMode>(state.rules.resolution.gradeGapMode);
  const [rolled, setRolled] = useState<RolledContest | null>(null);
  // The contest whose practice was last logged (MC.7 review M2).
  const loggedContest = useRef<string | null>(null);
  // Keep derived side values current when a stat changes mid-fight (M7.A).
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    const nextA = refreshSide(seen, state, a);
    const nextB = refreshSide(seen, state, b);
    if (nextA !== a || nextB !== b) {
      setA(nextA);
      setB(nextB);
      setRolled(null);
    }
  }
  const plan = contestPlan(state, a, b, mode);
  const change = (side: 'a' | 'b', draft: SideDraft) => {
    (side === 'a' ? setA : setB)(draft);
    setRolled(null);
    clear?.();
  };
  const roll = (e: FormEvent) => {
    e.preventDefault();
    if (typeof plan === 'string') return;
    clear?.();
    setRolled(rollPlan(state, plan, cryptoRandom));
    // MC.7: a contest done in the app logs practice for its characters directly,
    // once per contest: re-rolling the same sides does not log it again.
    const key = JSON.stringify([a, b, mode]);
    if (loggedContest.current === key) return;
    loggedContest.current = key;
    void (async () => {
      for (const command of contestPracticeCommands(state, a, b)) {
        if (!(await send(command, 'Contest logged as practice'))) break;
      }
    })();
  };
  const share = async () => {
    if (!rolled) return;
    if (await send(shareCommand(rolled), 'Shared with the table')) setRolled(null);
  };
  const recent = recentContests(state);
  return (
    <form className="encounter-contest" onSubmit={roll} aria-labelledby="contest-roller">
      <h3 id="contest-roller">Contest roll</h3>
      <div className="contest-sides">
        <SideFields name="Side A" state={state} draft={a} onChange={(d) => change('a', d)} />
        <SideFields name="Side B" state={state} draft={b} onChange={(d) => change('b', d)} />
      </div>
      <label>
        Grade-gap mode
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as GradeGapMode);
            setRolled(null);
          }}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.id === state.rules.resolution.gradeGapMode ? ' (campaign)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="muted" data-testid="contest-chance" aria-live="polite">
        {typeof plan === 'string'
          ? plan
          : plan.walled
            ? `Grade wall: ${plan.chance === 1 ? plan.a.label : plan.b.label} succeeds, no roll`
            : `${plan.a.label}: ${percent(plan.chance)} · ${plan.b.label}: ${percent(1 - plan.chance)}`}
      </p>
      <div className="library-tools">
        <button type="submit" disabled={typeof plan === 'string'}>
          Roll
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!rolled || busy}
          onClick={() => void share()}
        >
          Share with the table
        </button>
      </div>
      {rolled && (
        <p className="contest-result" role="status" data-testid="contest-result">
          {outcomeText(rolled)} <span className="muted">(only you see this until shared)</span>
        </p>
      )}
      {recent.length > 0 && (
        <>
          <h4 id="contest-recent">Shared rolls</h4>
          <ul className="contest-recent" aria-labelledby="contest-recent">
            {recent.map((c) => (
              <li key={c.id}>
                {c.success ? c.a.label : c.b.label} won against {c.success ? c.b.label : c.a.label}{' '}
                <span className="muted">
                  (
                  {c.walled
                    ? 'grade wall'
                    : `${percent(c.chance)} for ${c.a.label}, rolled ${Math.round((c.roll ?? 0) * 100)}`}
                  )
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </form>
  );
}

function SideFields({
  name,
  state,
  draft,
  onChange,
}: {
  name: string;
  state: CampaignState;
  draft: SideDraft;
  onChange: (draft: SideDraft) => void;
}) {
  const options = sideOptions(state);
  const set = (change: Partial<SideDraft>) => onChange({ ...draft, ...change });
  return (
    <fieldset className="contest-side">
      <legend>{name}</legend>
      <label>
        Who
        <select
          value={draft.source}
          onChange={(e) => onChange(sideDraftFor(state, e.target.value as SideSource, draft.stat))}
        >
          {options.map((o) => (
            <option key={o.source} value={o.source}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stat
        <select
          value={draft.stat}
          onChange={(e) =>
            draft.source === 'custom'
              ? set({ stat: e.target.value })
              : onChange(sideDraftFor(state, draft.source, e.target.value))
          }
        >
          {draft.source === 'custom' && <option value="">(none)</option>}
          {state.rules.stats.list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Value
        <input
          inputMode="decimal"
          value={draft.value}
          onChange={(e) => set({ value: e.target.value })}
        />
      </label>
      <label>
        Grade
        <select value={draft.grade} onChange={(e) => set({ grade: e.target.value })}>
          {state.rules.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Players see
        <input
          value={draft.label}
          maxLength={80}
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>
    </fieldset>
  );
}

function PoolTool({ state, busy, send }: ToolProps) {
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [input, setInput] = useState<PoolChangeInput>({
    characterId: ids[0] ?? '',
    pool: state.rules.pools[0]?.id ?? '',
    kind: 'damage',
    amount: '',
    attackerGrade: '',
  });
  const characterId = ids.includes(input.characterId) ? input.characterId : (ids[0] ?? '');
  const change = poolChange(state, { ...input, characterId });
  const set = (c: Partial<PoolChangeInput>) => setInput({ ...input, characterId, ...c });
  const poolName = state.rules.pools.find((p) => p.id === input.pool)?.name ?? input.pool;
  const apply = async (e: FormEvent) => {
    e.preventDefault();
    if (typeof change === 'string') return;
    const who = state.characters[change.characterId]?.name ?? '';
    const verb = input.kind === 'damage' ? 'took' : 'healed';
    const ok = await send(
      poolCommand(change),
      `${who} ${verb} ${change.applied} ${poolName} (${change.after}/${change.max})`,
    );
    if (ok) set({ amount: '' });
  };
  if (ids.length === 0) return null;
  return (
    <form className="encounter-pools" onSubmit={(e) => void apply(e)} aria-labelledby="pool-tool">
      <h3 id="pool-tool">Damage and healing</h3>
      <div className="pool-fields">
        <label>
          Character
          <select value={characterId} onChange={(e) => set({ characterId: e.target.value })}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {state.characters[id]?.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pool
          <select value={input.pool} onChange={(e) => set({ pool: e.target.value })}>
            {state.rules.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Change
          <select
            value={input.kind}
            onChange={(e) => set({ kind: e.target.value as 'damage' | 'heal' })}
          >
            <option value="damage">Damage</option>
            <option value="heal">Heal</option>
          </select>
        </label>
        <label>
          Points
          <input
            inputMode="numeric"
            value={input.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </label>
        {input.kind === 'damage' && (
          <label>
            Attacker grade
            <select
              value={input.attackerGrade}
              onChange={(e) => set({ attackerGrade: e.target.value })}
            >
              <option value="">Same grade</option>
              {state.rules.grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="muted" data-testid="pool-preview" aria-live="polite">
        {typeof change === 'string'
          ? change
          : `${poolName} ${change.before} → ${change.after} / ${change.max}${
              input.kind === 'damage' ? ` · ${factorText(change.factor)}` : ''
            }`}
      </p>
      <button type="submit" disabled={busy || typeof change === 'string' || change.applied === 0}>
        Apply
      </button>
    </form>
  );
}

function Clocks({ state, busy, send }: ToolProps) {
  const rows = clockRows(state);
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [name, setName] = useState('');
  const [segments, setSegments] = useState('4');
  const [offering, setOffering] = useState<string | null>(null);
  const [label, setLabel] = useState('Montage');
  const [who, setWho] = useState<readonly string[]>([]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(segments);
    if (await send({ type: 'clock.create', name, segments: n }, `[${name.trim()}] started`)) {
      setName('');
    }
  };
  const offer = async (clockId: string, override: boolean) => {
    const ok = await send(
      {
        type: 'montage.offer',
        clockId,
        label,
        characterIds: [...who],
        // MT.7 (Q60): the GM may offer one before the clock qualifies.
        ...(override ? { override: true } : {}),
      },
      `Montage offered to ${who.map((id) => state.characters[id]?.name ?? id).join(', ')}`,
    );
    if (ok) setOffering(null);
  };
  return (
    <div className="encounter-clocks" role="group" aria-labelledby="clocks">
      <h3 id="clocks">Progress clocks</h3>
      {rows.length === 0 && <p className="muted">No clocks yet.</p>}
      <ul className="clock-list" aria-label="Clocks">
        {rows.map(({ clock, complete, montageReady, montages }) => (
          <li key={clock.id} aria-label={`[${clock.name}]`}>
            <div className="clock-head">
              <strong>[{clock.name}]</strong>{' '}
              <span
                className="clock-bar"
                role="img"
                aria-label={`${clock.filled} of ${clock.segments} filled`}
              >
                {Array.from({ length: clock.segments }, (_, i) => (
                  <span key={i} className={i < clock.filled ? 'seg filled' : 'seg'} />
                ))}
              </span>{' '}
              <span className="muted">
                {clock.filled}/{clock.segments}
                {clock.failures > 0
                  ? ` · ${clock.failures} failure${clock.failures === 1 ? '' : 's'}`
                  : ''}
                {complete ? ' · complete' : ''}
              </span>
            </div>
            <div className="library-tools">
              <button
                type="button"
                disabled={busy || complete}
                onClick={() =>
                  void send(
                    { type: 'clock.tick', clockId: clock.id, result: 'success' },
                    `[${clock.name}] +1`,
                  )
                }
              >
                Success +1
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || complete}
                onClick={() =>
                  void send(
                    { type: 'clock.tick', clockId: clock.id, result: 'failure' },
                    `[${clock.name}]: failure logged`,
                  )
                }
              >
                Failure
              </button>
              {!complete && montages.length === 0 && (
                <button
                  type="button"
                  className={montageReady ? undefined : 'secondary'}
                  onClick={() => {
                    setOffering(clock.id);
                    setWho(ids);
                  }}
                >
                  {montageReady ? 'Offer montage' : 'Early montage (override)'}
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void send({ type: 'clock.remove', clockId: clock.id }, `[${clock.name}] removed`)
                }
              >
                Remove
              </button>
            </div>
            {offering === clock.id && (
              <fieldset className="montage-offer">
                <legend>Offer a montage on [{clock.name}]</legend>
                {!montageReady && (
                  <p className="warn" role="note" data-testid="montage-override">
                    GM override: a montage normally needs the clock half filled with no failures.
                    Offering it now skips that check; it is logged and can be undone.
                  </p>
                )}
                <label>
                  Players see
                  <input value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
                </label>
                {ids.map((id) => (
                  <label key={id} className="check">
                    <input
                      type="checkbox"
                      checked={who.includes(id)}
                      onChange={(e) =>
                        setWho(e.target.checked ? [...who, id] : who.filter((w) => w !== id))
                      }
                    />
                    {state.characters[id]?.name}
                  </label>
                ))}
                <div className="library-tools">
                  <button
                    type="button"
                    disabled={busy || who.length === 0 || label.trim() === ''}
                    onClick={() => void offer(clock.id, !montageReady)}
                  >
                    {montageReady ? 'Offer' : 'Offer anyway'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setOffering(null)}>
                    Cancel
                  </button>
                </div>
              </fieldset>
            )}
            {montages.map((m) => {
              const { done, waiting } = montageProgress(state, m);
              return (
                <p key={m.id} className="montage-open">
                  Montage “{m.label}”: {done.length > 0 ? `focus from ${done.join(', ')}` : ''}
                  {done.length > 0 && waiting.length > 0 ? '; ' : ''}
                  {waiting.length > 0 ? `waiting on ${waiting.join(', ')}` : ''}{' '}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void send({ type: 'montage.close', montageId: m.id }, 'Montage closed')
                    }
                  >
                    Close montage
                  </button>
                </p>
              );
            })}
          </li>
        ))}
      </ul>
      <form className="clock-new" onSubmit={(e) => void create(e)} aria-label="New clock">
        <label>
          Clock name
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Segments
          <input
            type="number"
            min={1}
            max={24}
            value={segments}
            onChange={(e) => setSegments(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || name.trim() === ''}>
          Start clock
        </button>
      </form>
    </div>
  );
}
