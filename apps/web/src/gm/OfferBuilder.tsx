import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CampaignState, RulesConfig, SkillOption } from '@the-system/engine';
import { friendlyError } from '../format';
import type { CommandResult, LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  builderSlots,
  offerProblem,
  practiceSkillCounts,
  practiceStatCounts,
  recentPractice,
  type BuilderSlot,
} from './offerBuilderModel';

/** A request (from a dashboard chip) to open one character's selection; `n` makes repeats count. */
export interface OfferTarget {
  readonly characterId: string;
  readonly level: number;
  readonly n: number;
}

interface Row {
  name: string;
  rarity: string;
  kind: 'class' | 'profession';
  description: string;
}

const blankRow = (rarity: string): Row => ({ name: '', rarity, kind: 'class', description: '' });

type Report = (r: CommandResult, okText: string) => void;

const visibleRarities = (rules: RulesConfig) => rules.skills.rarities.filter((r) => !r.reserved);

/**
 * GM offer builder (ROADMAP M5.1, DESIGN §6): per character, the due
 * selections (capstone and ceiling marked), a menu form checked against the
 * engine's own rules before sending, the passed-over options with Withdraw,
 * and the character's practice log beside them to build the menu from.
 */
export function OfferBuilder({
  client,
  state,
  target,
}: {
  client: LiveClient;
  state: CampaignState;
  target?: OfferTarget | null;
}) {
  const { rules } = state;
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const slots = character ? builderSlots(state, characterId) : [];
  const [levelPick, setLevelPick] = useState<number | null>(null);
  const slot: BuilderSlot | undefined =
    slots.find((s) => s.level === levelPick) ?? slots.find((s) => s.pending === null) ?? slots[0];
  const rarities = visibleRarities(rules);
  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // A new dashboard request picks that character and selection (adjusted
  // during render, React's pattern for state that follows a prop).
  const [seenTarget, setSeenTarget] = useState<OfferTarget | null | undefined>(target);
  if (target !== seenTarget) {
    setSeenTarget(target);
    if (target) {
      setPicked(target.characterId);
      setLevelPick(target.level);
      setResult(null);
    }
  }
  useEffect(() => {
    if (!target) return;
    sectionRef.current?.scrollIntoView({ block: 'start' });
    sectionRef.current?.focus({ preventScroll: true });
  }, [target]);

  const report: Report = (r, okText) =>
    setResult(r.ok ? { ok: true, text: okText } : { ok: false, text: friendlyError(r.error) });

  const withdraw = async (skill: string) => {
    if (
      !window.confirm(
        `Withdraw [${skill}]? It leaves ${character?.name ?? 'the player'}’s menus for good.`,
      )
    )
      return;
    setBusy(true);
    const r = await client.command({ type: 'selection.withdrawOption', characterId, skill });
    setBusy(false);
    report(r, `[${skill}] withdrawn`);
  };

  const practice = recentPractice(state, characterId);
  const counts = [
    ...practiceSkillCounts(state, characterId).map((c) => `[${c.skill}] ×${c.count}`),
    ...practiceStatCounts(state, characterId).map(
      (c) => `${rules.stats.list.find((s) => s.id === c.stat)?.name ?? c.stat} ×${c.count}`,
    ),
  ];

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="window offer-builder"
      aria-labelledby="offer-builder"
    >
      <h2 id="offer-builder">Skill offers</h2>
      {ids.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <>
          <label>
            Character{' '}
            <select
              value={characterId}
              onChange={(e) => {
                setPicked(e.target.value);
                setLevelPick(null);
                setResult(null);
              }}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {state.characters[id]?.name}
                </option>
              ))}
            </select>
          </label>
          <div className="offer-layout">
            <div className="offer-main">
              {slots.length === 0 ? (
                <p className="muted" data-testid="no-due-selections">
                  No selection due: the next comes at a later class level.
                </p>
              ) : (
                <ul className="due-selections" aria-label="Due selections">
                  {slots.map((s) => (
                    <li key={s.level}>
                      <label className="check">
                        <input
                          type="radio"
                          name="offer-level"
                          checked={slot?.level === s.level}
                          onChange={() => {
                            setLevelPick(s.level);
                            setResult(null);
                          }}
                        />{' '}
                        {s.capstone ? 'Capstone selection' : 'Selection'} (lvl {s.level}) · ceiling{' '}
                        {rarityName(s.ceiling)} ·{' '}
                        {s.pending ? 'menu sent, player choosing' : 'build the menu'}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {slot && character && (
                <>
                  {slot.pending && (
                    <p className="muted" data-testid="pending-menu">
                      On the player’s menu now:{' '}
                      {slot.pending
                        .map(
                          (o) =>
                            `[${o.name} (${rarityName(o.rarity)})]${o.kind === 'profession' ? ' (profession)' : ''}`,
                        )
                        .join(', ')}
                      . Sending again replaces it.
                    </p>
                  )}
                  {slot.capstone && (
                    <p className="muted small" data-testid="capstone-note">
                      Capstone: the menu needs at least one {rarityName(slot.ceiling)} option.
                    </p>
                  )}
                  <MenuForm
                    // A fresh draft for each character and selection (no rows carried over).
                    key={`${characterId}:${slot.level}`}
                    client={client}
                    state={state}
                    characterId={characterId}
                    level={slot.level}
                    busy={busy}
                    setBusy={setBusy}
                    report={report}
                    onSent={() => setLevelPick(slot.level)}
                  />
                  <section aria-labelledby="passed-over">
                    <h3 id="passed-over">Passed-over options</h3>
                    {slot.passedOver.length === 0 ? (
                      <p className="muted">None: the player sees only the new menu.</p>
                    ) : (
                      <ul>
                        {slot.passedOver.map((o) => (
                          <li key={o.name}>
                            <span className={`rarity rarity-${cssToken(o.rarity)}`}>
                              [{o.name} ({rarityName(o.rarity)})]
                            </span>
                            {o.kind === 'profession' && ' (profession)'}{' '}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void withdraw(o.name)}
                            >
                              Withdraw
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
              {result && (
                <p className={result.ok ? 'ok' : 'err'} role={result.ok ? 'status' : 'alert'}>
                  {result.text}
                </p>
              )}
            </div>
            <aside className="offer-side" aria-labelledby="offer-practice">
              <h3 id="offer-practice">Practice log</h3>
              {practice.length === 0 ? (
                <p className="muted">Nothing logged yet.</p>
              ) : (
                <>
                  {counts.length > 0 && (
                    <p className="small" data-testid="practice-counts">
                      Used (whole log): {counts.join(' · ')}
                    </p>
                  )}
                  <p className="muted small">Latest {practice.length} entries, newest first:</p>
                  <ul className="offer-practice">
                    {practice.map((p) => (
                      <li key={p.id}>
                        <span className="muted small">{p.at.slice(0, 10)}</span> {p.action}
                        {p.skills.length > 0 && ` · ${p.skills.map((s) => `[${s}]`).join(' + ')}`}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

/** The draft menu for one character's selection. */
function MenuForm({
  client,
  state,
  characterId,
  level,
  busy,
  setBusy,
  report,
  onSent,
}: {
  client: LiveClient;
  state: CampaignState;
  characterId: string;
  level: number;
  busy: boolean;
  setBusy: (b: boolean) => void;
  report: Report;
  onSent: () => void;
}) {
  const { rules } = state;
  const character = state.characters[characterId];
  const hasProfession = character?.profession != null;
  const rarities = visibleRarities(rules);
  const lowest = rarities[0]?.id ?? '';
  const fresh = () => Array.from({ length: rules.skills.menuSize.min }, () => blankRow(lowest));
  const [rows, setRows] = useState<Row[]>(fresh);

  const options: SkillOption[] = rows.map((r) => ({
    name: r.name.trim(),
    rarity: r.rarity,
    // Without a profession there is no Kind choice, so every option is a class option.
    kind: hasProfession ? r.kind : 'class',
    description: r.description.trim(),
  }));
  const problem = offerProblem(state, characterId, level, options);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (problem !== null) return;
    // Stay on this selection once its menu is out (the default picks the
    // first one still needing a menu).
    onSent();
    setBusy(true);
    const r = await client.command({
      type: 'selection.offer',
      characterId,
      level,
      options: options.map((o) => ({
        name: o.name,
        rarity: o.rarity,
        kind: o.kind,
        ...(o.description ? { description: o.description } : {}),
      })),
    });
    setBusy(false);
    report(r, `Menu sent to ${character?.name ?? 'the player'} (lvl ${level})`);
    if (r.ok) setRows(fresh());
  };
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form onSubmit={send} aria-label="Selection menu">
      {rows.map((r, i) => (
        <fieldset key={i} className="offer-row">
          <legend>Option {i + 1}</legend>
          <label>
            Name{' '}
            <input
              value={r.name}
              maxLength={80}
              onChange={(e) => setRow(i, { name: e.target.value })}
            />
          </label>
          <label>
            Rarity{' '}
            <select value={r.rarity} onChange={(e) => setRow(i, { rarity: e.target.value })}>
              {rarities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {hasProfession && (
            <label>
              Kind{' '}
              <select
                value={r.kind}
                onChange={(e) => setRow(i, { kind: e.target.value as 'class' | 'profession' })}
              >
                <option value="class">Class</option>
                <option value="profession">Profession</option>
              </select>
            </label>
          )}
          <label>
            Description{' '}
            <input
              value={r.description}
              maxLength={1000}
              onChange={(e) => setRow(i, { description: e.target.value })}
            />
          </label>
        </fieldset>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={rows.length >= rules.skills.menuSize.max}
          onClick={() => setRows([...rows, blankRow(lowest)])}
        >
          Add option
        </button>
        <button
          type="button"
          disabled={rows.length <= rules.skills.menuSize.min}
          onClick={() => setRows(rows.slice(0, -1))}
        >
          Remove last
        </button>
        <button type="submit" disabled={busy || problem !== null}>
          Send menu
        </button>
      </div>
      {problem !== null && rows.some((r) => r.name.trim() !== '') && (
        <p className="err" data-testid="offer-problem">
          {problem}
        </p>
      )}
    </form>
  );
}
