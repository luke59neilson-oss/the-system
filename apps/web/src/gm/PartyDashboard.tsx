import { useState, type FormEvent } from 'react';
import {
  characterEffectiveStats,
  characterFlags,
  formatStat,
  poolMax,
  raceLevel,
  xpPerLevel,
  type CampaignState,
  type Character,
} from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { PortraitCell } from './PortraitControls';
import { draftOf, flagView, sheetPlan, type SheetDraft } from './partyDashboardModel';

/**
 * Party dashboard (M4.5): a card per character with what waits on the GM or
 * the player, and a full sheet editor whose every change is an undoable,
 * audited event.
 */
export function PartyDashboard({
  client,
  gmKey,
  state,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
}) {
  const characters = state.characterOrder.flatMap((id) => state.characters[id] ?? []);
  return (
    <section className="window party" aria-labelledby="party">
      <h2 id="party">{state.name} · Party</h2>
      {characters.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <ul className="party-cards">
          {characters.map((c) => (
            <PartyCard key={c.id} client={client} gmKey={gmKey} state={state} character={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function maxima(state: CampaignState, c: Character): Record<string, number | null> {
  let stats: Record<string, number>;
  try {
    stats = characterEffectiveStats(state, c.id);
  } catch {
    stats = { ...c.stats };
  }
  return Object.fromEntries(
    state.rules.pools.map((p) => {
      try {
        return [p.id, poolMax(state.rules, stats, p.id)];
      } catch {
        return [p.id, null];
      }
    }),
  );
}

function PartyCard({
  client,
  gmKey,
  state,
  character: c,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
  character: Character;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const { rules } = state;
  const flags = characterFlags(state, c.id).map(flagView);
  const max = maxima(state, c);
  const theme = rules.grades.find((g) => g.id === c.grade)?.theme ?? 'aluminum';
  const editorId = `sheet-${c.id}`;
  return (
    <li className={`party-card theme-${theme}`} data-testid={`row-${c.id}`}>
      <div className="party-card-head">
        <PortraitCell client={client} gmKey={gmKey} state={state} characterId={c.id} />
        <div className="party-card-title">
          <h3 className="party-name" data-testid={`party-name-${c.id}`}>
            {c.name}
          </h3>
          <dl className="party-tracks">
            <dt>Race</dt>
            <dd>
              [{c.race} ({c.grade}) – lvl {raceLevel(rules, c)}]
            </dd>
            <dt>Class</dt>
            <dd>
              [<span data-testid={`party-class-${c.id}`}>{c.className}</span> – lvl{' '}
              <span data-testid={`class-level-${c.id}`}>{c.classLevel}</span>]
            </dd>
            {c.profession !== null && (
              <>
                <dt>Profession</dt>
                <dd>
                  [{c.profession} – lvl {c.professionLevel}]
                </dd>
              </>
            )}
            <dt>XP</dt>
            <dd data-testid={`xp-${c.id}`}>
              {c.xp.class} / {xpPerLevel(rules, c)}
              {c.profession !== null && ` · profession ${c.xp.profession}`}
            </dd>
          </dl>
        </div>
      </div>
      <div className="party-pools">
        {rules.pools.map((p) => {
          const cur = c.pools[p.id] ?? 0;
          const top = max[p.id] ?? null;
          const pct = top && top > 0 ? Math.max(0, Math.min(100, (cur / top) * 100)) : 0;
          return (
            <div className="party-pool" key={p.id}>
              <span className="party-pool-name">{p.name}</span>
              <span className="party-pool-bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="party-pool-label" data-testid={`pool-${c.id}-${p.id}`}>
                {cur}/{top ?? '?'}
              </span>
            </div>
          );
        })}
      </div>
      {flags.length === 0 ? (
        <p className="muted small flags-none" data-testid={`flags-${c.id}`}>
          Nothing waiting.
        </p>
      ) : (
        <ul className="flags" aria-label={`${c.name}: waiting`} data-testid={`flags-${c.id}`}>
          {flags.map((f) => (
            <li key={f.key} className={`flag flag-${f.owner}`}>
              <span className="flag-owner">{f.owner === 'gm' ? 'GM' : 'Player'}</span> {f.text}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="secondary small"
        aria-expanded={editing}
        aria-controls={editing ? editorId : undefined}
        onClick={() => {
          setSaved(null);
          setEditing((e) => !e);
        }}
      >
        {editing ? 'Close editor' : 'Edit sheet'}
      </button>
      {editing && (
        <SheetEditor
          id={editorId}
          client={client}
          state={state}
          character={c}
          max={max}
          onDone={(text) => {
            setSaved(text);
            setEditing(false);
          }}
        />
      )}
      {saved && (
        <p className="ok" role="status">
          {saved}
        </p>
      )}
    </li>
  );
}

function SheetEditor({
  id,
  client,
  state,
  character: c,
  max,
  onDone,
}: {
  id: string;
  client: LiveClient;
  state: CampaignState;
  character: Character;
  max: Record<string, number | null>;
  onDone: (text: string) => void;
}) {
  const { rules } = state;
  // What the editor opened with: only fields the GM changes from this are sent.
  const [base, setBase] = useState<SheetDraft>(() => draftOf(c));
  const [draft, setDraft] = useState<SheetDraft>(base);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const plan = sheetPlan(rules, c, base, draft);
  const field = (group: 'stats' | 'pools' | 'nicknames', key: string, value: string) =>
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!plan.ok) {
      setMessage({ ok: false, text: plan.error });
      return;
    }
    if (plan.commands.length === 0) return;
    setBusy(true);
    setMessage(null);
    let done = 0;
    for (const command of plan.commands) {
      const r = await client.command(command);
      if (!r.ok) {
        setBusy(false);
        setMessage({
          ok: false,
          text:
            done === 0
              ? friendlyError(r.error)
              : `Saved ${done} of ${plan.commands.length} changes; then: ${friendlyError(r.error)}`,
        });
        return;
      }
      done++;
    }
    setBusy(false);
    onDone(`Sheet saved (${done} change${done === 1 ? '' : 's'})`);
  };

  const resetDraft = () => {
    const fresh = draftOf(c);
    setBase(fresh);
    setDraft(fresh);
    setMessage(null);
  };

  return (
    <form
      id={id}
      className="sheet-editor"
      aria-label={`Edit ${c.name}’s sheet`}
      onSubmit={(e) => void submit(e)}
    >
      <label>
        Name
        <input
          value={draft.name}
          maxLength={200}
          required
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </label>
      <fieldset className="sheet-stats">
        <legend>Base stats (before titles and items)</legend>
        {rules.stats.list.map((s) => (
          <label key={s.id}>
            {s.name}
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft.stats[s.id] ?? ''}
              onChange={(e) => field('stats', s.id, e.target.value)}
            />
            <span className="muted small" data-testid={`sheet-shown-${s.id}`}>
              {/^\d+$/.test((draft.stats[s.id] ?? '').trim())
                ? `shows ${formatStat(rules, Number(draft.stats[s.id]))}`
                : '—'}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="sheet-pools">
        <legend>Current pools</legend>
        {rules.pools.map((p) => (
          <label key={p.id}>
            {p.name}
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft.pools[p.id] ?? ''}
              onChange={(e) => field('pools', p.id, e.target.value)}
            />
            <span className="muted small">
              max {max[p.id] ?? '?'} · now {c.pools[p.id] ?? 0}
            </span>
          </label>
        ))}
      </fieldset>
      {c.skills.length > 0 && (
        <fieldset className="sheet-skills">
          <legend>Skills</legend>
          {c.skills.map((s) => (
            <div className="sheet-skill" key={s.name}>
              <label>
                [{s.name}] nickname
                <input
                  value={draft.nicknames[s.name] ?? ''}
                  maxLength={100}
                  onChange={(e) => field('nicknames', s.name, e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.unique[s.name] ?? s.unique}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      unique: { ...d.unique, [s.name]: e.target.checked },
                    }))
                  }
                />
                Unique
              </label>
            </div>
          ))}
        </fieldset>
      )}
      <FreePointBatches client={client} state={state} character={c} />
      <p className="muted small">
        Levels, XP and grade change only through XP awards and evolutions; undo a mistaken award in
        the change log. Each saved change is its own event and can be undone.
      </p>
      {!plan.ok && (
        <p className="err" role="alert">
          {plan.error}
        </p>
      )}
      <button type="submit" disabled={busy || !plan.ok || plan.commands.length === 0}>
        {busy ? 'Saving…' : 'Save sheet'}
      </button>
      <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={resetDraft}>
        Reload values
      </button>
      {message && (
        <p className={message.ok ? 'ok' : 'err'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}

/**
 * Assigned free-point batches (DESIGN §4: assigned once, then locked; the GM
 * can override). Returning a batch unassigns it so the player can spend it
 * again; it is its own event, sent at once.
 */
function FreePointBatches({
  client,
  state,
  character: c,
}: {
  client: LiveClient;
  state: CampaignState;
  character: Character;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assigned = c.freePointBatches.filter((b) => b.allocation !== null);
  if (assigned.length === 0) return null;
  const statName = (id: string) => state.rules.stats.list.find((s) => s.id === id)?.name ?? id;
  const giveBack = async (raceLevel: number) => {
    setBusy(true);
    setError(null);
    const r = await client.command({
      type: 'freePoints.override',
      characterId: c.id,
      raceLevel,
      allocation: null,
    });
    setBusy(false);
    if (!r.ok) setError(friendlyError(r.error));
  };
  return (
    <fieldset className="sheet-free-points">
      <legend>Assigned free points</legend>
      <ul className="sheet-batches">
        {assigned.map((b) => (
          <li key={b.raceLevel}>
            Race lvl {b.raceLevel}:{' '}
            {Object.entries(b.allocation ?? {})
              .filter(([, n]) => n > 0)
              .map(([id, n]) => `${statName(id)} +${n}`)
              .join(', ')}{' '}
            <button
              type="button"
              className="secondary small"
              disabled={busy}
              onClick={() => void giveBack(b.raceLevel)}
            >
              Return to player
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
