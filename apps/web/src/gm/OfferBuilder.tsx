import { useState, type FormEvent } from 'react';
import type { CampaignState, SkillOption } from '@the-system/engine';
import { friendlyError } from '../format';
import type { CommandResult, LiveClient } from '../live';
import { cssToken } from '../player/sheet';
import { builderSlots, offerProblem, recentPractice, type BuilderSlot } from './offerBuilderModel';

interface Row {
  name: string;
  rarity: string;
  kind: 'class' | 'profession';
  description: string;
}

const blankRow = (rarity: string): Row => ({ name: '', rarity, kind: 'class', description: '' });

/**
 * GM offer builder (ROADMAP M5.1, DESIGN §6): per character, the due
 * selections (capstone and ceiling marked), a menu form checked against the
 * engine's own rules before sending, the passed-over options with Withdraw,
 * and the character's recent practice log to build the menu from.
 */
export function OfferBuilder({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const slots = character ? builderSlots(state, characterId) : [];
  const [levelPick, setLevelPick] = useState<number | null>(null);
  const slot: BuilderSlot | undefined =
    slots.find((s) => s.level === levelPick) ?? slots.find((s) => s.pending === null) ?? slots[0];
  const rarities = rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;
  const lowest = rarities[0]?.id ?? '';
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: rules.skills.menuSize.min }, () => blankRow(lowest)),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const options: SkillOption[] = rows.map((r) => ({
    name: r.name.trim(),
    rarity: r.rarity,
    kind: r.kind,
    description: r.description.trim(),
  }));
  const problem = slot && character ? offerProblem(state, characterId, slot.level, options) : null;
  const report = (r: CommandResult, okText: string) =>
    setResult(r.ok ? { ok: true, text: okText } : { ok: false, text: friendlyError(r.error) });

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!slot || problem !== null) return;
    // Stay on this selection once its menu is out (the default picks the
    // first one still needing a menu).
    setLevelPick(slot.level);
    setBusy(true);
    const r = await client.command({
      type: 'selection.offer',
      characterId,
      level: slot.level,
      options: options.map((o) => ({
        name: o.name,
        rarity: o.rarity,
        kind: o.kind,
        ...(o.description ? { description: o.description } : {}),
      })),
    });
    setBusy(false);
    report(r, `Menu sent to ${character?.name ?? 'the player'} (lvl ${slot.level})`);
    if (r.ok) setRows(Array.from({ length: rules.skills.menuSize.min }, () => blankRow(lowest)));
  };
  const withdraw = async (skill: string) => {
    setBusy(true);
    const r = await client.command({ type: 'selection.withdrawOption', characterId, skill });
    setBusy(false);
    report(r, `[${skill}] withdrawn`);
  };
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="window offer-builder" aria-labelledby="offer-builder">
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
                      onChange={() => setLevelPick(s.level)}
                    />{' '}
                    {s.capstone ? 'Capstone selection' : 'Selection'} (lvl {s.level}) · ceiling{' '}
                    {rarityName(s.ceiling)} ·{' '}
                    {s.pending ? 'menu sent, player choosing' : 'build the menu'}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {slot && (
            <>
              {slot.pending && (
                <p className="muted" data-testid="pending-menu">
                  On the player’s menu now:{' '}
                  {slot.pending.map((o) => `[${o.name} (${rarityName(o.rarity)})]`).join(', ')}.
                  Sending again replaces it.
                </p>
              )}
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
                      <select
                        value={r.rarity}
                        onChange={(e) => setRow(i, { rarity: e.target.value })}
                      >
                        {rarities.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {character?.profession != null && (
                      <label>
                        Kind{' '}
                        <select
                          value={r.kind}
                          onChange={(e) =>
                            setRow(i, { kind: e.target.value as 'class' | 'profession' })
                          }
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
                        </span>{' '}
                        <button type="button" disabled={busy} onClick={() => void withdraw(o.name)}>
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
          <section aria-labelledby="offer-practice">
            <h3 id="offer-practice">Practice log</h3>
            {recentPractice(state, characterId).length === 0 ? (
              <p className="muted">Nothing logged yet.</p>
            ) : (
              <ul className="offer-practice">
                {recentPractice(state, characterId).map((p) => (
                  <li key={p.id}>
                    {p.action}
                    {p.skills.length > 0 && ` · ${p.skills.map((s) => `[${s}]`).join(' + ')}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
