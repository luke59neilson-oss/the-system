import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CampaignState, RulesConfig, SkillOption } from '@the-system/engine';
import { friendlyError } from '../format';
import type { CommandResult, LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import {
  builderSlots,
  characterStanding,
  draftFlags,
  offerProblem,
  parseCost,
  practiceSkillCounts,
  practiceStatCounts,
  recentPractice,
  type BuilderSlot,
  type CharacterStanding,
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
  /** MW.2: a spell carries a cost in a pool; the library entry gets it on send. */
  spell: boolean;
  costPool: string;
  costAmount: string;
}

const blankRow = (rarity: string, pool = ''): Row => ({
  name: '',
  rarity,
  kind: 'class',
  description: '',
  spell: false,
  costPool: pool,
  costAmount: '',
});

/** A draft as the server sends it (apps/server/src/ai/skillDrafts.ts). */
interface SkillDraft {
  name: string;
  rarity: string;
  kind: 'class' | 'profession';
  description: string;
  spell: boolean;
  cost: { pool: string; amount: number } | null;
}
type DraftSource =
  | { mode: 'stat'; stat: string }
  | { mode: 'skill'; skill: string }
  | { mode: 'direction'; direction: string };

type Report = (r: CommandResult, okText: string) => void;

const visibleRarities = (rules: RulesConfig) => rules.skills.rarities.filter((r) => !r.reserved);

/**
 * GM offer builder (ROADMAP M5.1, DESIGN §6): per character, the due
 * selections (capstone and ceiling marked), a menu form checked against the
 * engine's own rules before sending, the passed-over options with Withdraw,
 * and the character's standing and practice log beside them to build from.
 */
export function OfferBuilder({
  client,
  gmKey,
  state,
  target,
}: {
  client: LiveClient;
  gmKey: string;
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

  const standing = characterStanding(state, characterId);
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
                    gmKey={gmKey}
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
            <div className="offer-side" tabIndex={0} aria-label="Standing and practice">
              {(() => {
                const practiceSummary = (
                  <aside aria-labelledby="offer-practice" className="offer-practice-side">
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
                        {standing && standing.pairs.length > 0 && (
                          <p className="small" data-testid="practice-pairs">
                            Used together:{' '}
                            {standing.pairs
                              .map((p) => `[${p.skills[0]}] + [${p.skills[1]}] ×${p.count}`)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="muted small">
                          Latest {practice.length} {practice.length === 1 ? 'entry' : 'entries'},
                          newest first:
                        </p>
                        <ul className="offer-practice">
                          {practice.map((p) => (
                            <li key={p.id}>
                              <span className="muted small">{p.at.slice(0, 10)}</span> {p.action}
                              {p.skills.length > 0 &&
                                ` · ${p.skills.map((s) => `[${s}]`).join(' + ')}`}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </aside>
                );
                return standing ? (
                  <Standing rules={rules} standing={standing} practice={practiceSummary} />
                ) : (
                  practiceSummary
                );
              })()}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** MW.1 (DESIGN §6): what the character already has, beside the menu. */
function Standing({
  rules,
  standing,
  practice,
}: {
  rules: RulesConfig;
  standing: CharacterStanding;
  /** Beside the stats, so a long skill list never pushes it off the screen. */
  practice: ReactNode;
}) {
  const show = (n: number) => (n / rules.stats.displayDivisor).toFixed(rules.stats.displayDecimals);
  return (
    <section aria-labelledby="offer-standing" data-testid="offer-standing">
      <h3 id="offer-standing">Standing</h3>
      <p className="small" data-testid="standing-summary">
        Grade {standing.grade} · {standing.className} {standing.classLevel}
        {standing.profession === null
          ? ' · no profession'
          : ` · ${standing.profession} ${standing.professionLevel ?? 0}`}
        {` · ${standing.race} ${standing.raceLevel}`}
      </p>
      <div className="offer-standing-top">
        <div>
          <table className="offer-standing-stats small">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">Base</th>
                <th scope="col">Bonus</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {standing.stats.map((s) => (
                <tr key={s.id} data-testid={`standing-${s.id}`}>
                  <th scope="row">{s.name}</th>
                  <td>{show(s.base)}</td>
                  <td>
                    {s.bonus === 0 ? '–' : `${s.bonus > 0 ? '+' : '−'}${show(Math.abs(s.bonus))}`}
                  </td>
                  <td>{show(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small" data-testid="standing-free">
            Free points unassigned: {standing.freePoints}
          </p>
        </div>
        {practice}
      </div>
      <h4>Skills</h4>
      {standing.skills.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <ul className="offer-standing-skills small" data-testid="standing-skills">
          {standing.skills.map((s) => (
            <li key={s.name}>
              [{s.name}] {s.rarity} · {s.kind} · {s.marks} {s.marks === 1 ? 'mark' : 'marks'}
              {s.cost !== null && ` · costs ${s.cost}`}
            </li>
          ))}
        </ul>
      )}
      <p className="small" data-testid="standing-titles">
        Titles: {standing.titles.length === 0 ? 'none' : standing.titles.join(', ')}
      </p>
      <p className="small" data-testid="standing-equipped">
        Equipped:{' '}
        {standing.equipped.length === 0
          ? 'nothing'
          : standing.equipped.map((e) => `${e.item} (${e.slot})`).join(', ')}
      </p>
    </section>
  );
}

/** The draft menu for one character's selection. */
function MenuForm({
  client,
  gmKey,
  state,
  characterId,
  level,
  busy,
  setBusy,
  report,
  onSent,
}: {
  client: LiveClient;
  gmKey: string;
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
  const firstPool = rules.pools[0]?.id ?? '';
  const blank = () => blankRow(lowest, firstPool);
  const fresh = () => Array.from({ length: rules.skills.menuSize.min }, blank);
  const [rows, setRows] = useState<Row[]>(fresh);
  const [stat, setStat] = useState(rules.stats.list[0]?.id ?? '');
  const [skill, setSkill] = useState('');
  const [direction, setDirection] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ownSkills = character?.skills.map((s) => s.name) ?? [];
  const pickedSkill = ownSkills.includes(skill) ? skill : (ownSkills[0] ?? '');

  const options: SkillOption[] = rows.map((r) => ({
    name: r.name.trim(),
    rarity: r.rarity,
    // Without a profession there is no Kind choice, so every option is a class option.
    kind: hasProfession ? r.kind : 'class',
    description: r.description.trim(),
  }));
  const flags = draftFlags(state, characterId, level, rows);
  const flagged = flags.menu.length > 0 || flags.rows.some((f) => f.length > 0);
  const problem = offerProblem(state, characterId, level, options);

  // MW.2: drafts fill the blank rows, then add rows up to the menu's maximum.
  const draftFrom = async (source: DraftSource) => {
    setDrafting(true);
    setDraftNote(null);
    try {
      const res = await fetch('/api/gm/ai/skill-drafts', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify({ characterId, level, source }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        drafts?: SkillDraft[];
      };
      if (!res.ok || !data.drafts) {
        setDraftNote({ ok: false, text: data.error ?? 'The co-DM could not draft options' });
        return;
      }
      const incoming = data.drafts.map((d) => ({
        name: d.name,
        rarity: d.rarity,
        kind: d.kind,
        description: d.description,
        spell: d.spell,
        costPool: d.cost?.pool ?? firstPool,
        costAmount: d.cost === null ? '' : String(d.cost.amount),
      }));
      const merged = rows.filter((r) => r.name.trim() !== '');
      const room = rules.skills.menuSize.max - merged.length;
      const taken = incoming.slice(0, Math.max(0, room));
      const next = [...merged, ...taken];
      while (next.length < rules.skills.menuSize.min) next.push(blank());
      setRows(next);
      const left = incoming.length - taken.length;
      setDraftNote({
        ok: true,
        text: `${taken.length} draft${taken.length === 1 ? '' : 's'} added: edit them, then send the menu${
          left > 0 ? ` (${left} did not fit)` : ''
        }`,
      });
    } catch {
      setDraftNote({ ok: false, text: 'Could not reach the server' });
    } finally {
      setDrafting(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (problem !== null || flagged) return;
    // Stay on this selection once its menu is out (the default picks the
    // first one still needing a menu).
    onSent();
    setBusy(true);
    // MW.2: a spell's cost lives on its library entry, which the chosen skill follows.
    for (const row of rows) {
      const amount = row.spell ? parseCost(row.costAmount) : null;
      if (amount === null) continue;
      const cost = { pool: row.costPool, amount };
      const known = Object.values(state.skillLibrary).find(
        (d) => d.name === row.name.trim() && d.rarity === row.rarity,
      );
      const saved = await client.command(
        known
          ? { type: 'skillDef.edit', skillDefId: known.id, cost }
          : {
              type: 'skillDef.define',
              name: row.name.trim(),
              rarity: row.rarity,
              description: row.description.trim(),
              cost,
            },
      );
      if (!saved.ok) {
        setBusy(false);
        report(saved, '');
        return;
      }
    }
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
      <fieldset className="offer-drafts" data-testid="offer-drafts">
        <legend>Co-DM drafts</legend>
        <div className="row">
          <label>
            Stat{' '}
            <select value={stat} onChange={(e) => setStat(e.target.value)}>
              {rules.stats.list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={drafting}
            onClick={() => void draftFrom({ mode: 'stat', stat })}
          >
            Draft from stat
          </button>
        </div>
        <div className="row">
          <label>
            Skill{' '}
            <select value={pickedSkill} onChange={(e) => setSkill(e.target.value)}>
              {ownSkills.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={drafting || pickedSkill === ''}
            onClick={() => void draftFrom({ mode: 'skill', skill: pickedSkill })}
          >
            Draft from skill
          </button>
        </div>
        <div className="row">
          <label>
            Direction{' '}
            <input
              value={direction}
              maxLength={500}
              onChange={(e) => setDirection(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={drafting || direction.trim() === ''}
            onClick={() => void draftFrom({ mode: 'direction', direction: direction.trim() })}
          >
            Draft from direction
          </button>
        </div>
        <p
          className={draftNote?.ok === false ? 'err' : 'muted small'}
          aria-live="polite"
          data-testid="draft-note"
        >
          {drafting ? 'The co-DM is drafting…' : (draftNote?.text ?? '')}
        </p>
      </fieldset>
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
          <label className="offer-spell-toggle">
            <input
              type="checkbox"
              checked={r.spell}
              onChange={(e) => setRow(i, { spell: e.target.checked })}
            />{' '}
            Spell
          </label>
          {r.spell && (
            <>
              <label>
                Cost{' '}
                <input
                  inputMode="numeric"
                  value={r.costAmount}
                  aria-label={`Option ${i + 1} cost`}
                  onChange={(e) => setRow(i, { costAmount: e.target.value })}
                />
              </label>
              <label>
                Pool{' '}
                <select
                  value={r.costPool}
                  onChange={(e) => setRow(i, { costPool: e.target.value })}
                >
                  {rules.pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(flags.rows[i]?.length ?? 0) > 0 && (
            <ul className="err offer-flags" data-testid={`draft-flags-${i}`}>
              {flags.rows[i]?.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </fieldset>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={rows.length >= rules.skills.menuSize.max}
          onClick={() => setRows([...rows, blank()])}
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
        <button type="submit" disabled={busy || problem !== null || flagged}>
          Send menu
        </button>
      </div>
      {flags.menu.map((f) => (
        <p key={f} className="err" data-testid="draft-menu-flag">
          {f}
        </p>
      ))}
      {problem !== null && rows.some((r) => r.name.trim() !== '') && (
        <p className="err" data-testid="offer-problem">
          {problem}
        </p>
      )}
    </form>
  );
}
