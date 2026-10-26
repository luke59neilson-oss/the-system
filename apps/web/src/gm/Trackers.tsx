import { useState, type FormEvent } from 'react';
import type { CampaignState, Command, Faction, Region } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  emptyFactionDraft,
  factionCommand,
  factionDraftOf,
  type FactionDraft,
} from './trackersModel';

type Outcome = { ok: boolean; text: string } | null;

const own = <T,>(record: Readonly<Record<string, T>>, id: string | null): T | null =>
  id !== null && Object.prototype.hasOwnProperty.call(record, id) ? (record[id] ?? null) : null;

/**
 * GM trackers (ROADMAP M7.4, DESIGN §7–§8, D184): the regions the party moves
 * through and the survivor factions. Players see only the current region's
 * name and the factions the GM has revealed (MT.8: name and standing). There is no hunger tracker (MT.3, DESIGN §7: hunger is narrated).
 */
export function Trackers({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const run = async (c: Command, done: string) => {
    setBusy(true);
    const r = await client.command(c);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: done } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };
  return (
    <section className="window trackers" aria-labelledby="trackers">
      <h2 id="trackers">Trackers</h2>
      <RegionSection state={state} busy={busy} run={run} />
      <FactionSection state={state} busy={busy} run={run} />
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
    </section>
  );
}

interface SectionProps {
  state: CampaignState;
  busy: boolean;
  run: (c: Command, done: string) => Promise<boolean>;
}

function RegionSection({ state, busy, run }: SectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const current = own(state.regions, editing);
  if (editing !== null && current === null) setEditing(null);
  const regions = state.regionOrder
    .map((id) => state.regions[id])
    .filter((r): r is Region => r !== undefined);
  const here = own(state.regions, state.currentRegion);
  const open = (r: Region | null) => {
    setEditing(r?.id ?? null);
    setName(r?.name ?? '');
    setNotes(r?.notes ?? '');
  };
  const trimmed = name.trim().replace(/\s+/gu, ' ');
  const command: Command | null =
    trimmed === ''
      ? null
      : current
        ? trimmed === current.name && notes.trim() === current.notes
          ? null
          : {
              type: 'region.edit',
              regionId: current.id,
              name: trimmed === current.name ? undefined : trimmed,
              notes: notes.trim() === current.notes ? undefined : notes.trim(),
            }
        : { type: 'region.define', name: trimmed, notes: notes.trim() };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!command || busy) return;
    const ok = await run(command, current ? `${trimmed} saved` : `${trimmed} added`);
    if (ok && !current) open(null);
  };
  return (
    <div role="group" aria-labelledby="trackers-regions">
      <h3 id="trackers-regions">Regions</h3>
      <p data-testid="current-region">
        {here ? (
          <>
            The party is in <strong>{here.name}</strong>. Players see this name.
          </>
        ) : (
          <span className="muted">No current region set; players see none.</span>
        )}
      </p>
      {regions.length === 0 ? (
        <p className="muted">No regions yet. Add the first below.</p>
      ) : (
        <ul className="tracker-list" aria-label="Regions">
          {regions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="library-item"
                aria-current={r.id === editing ? 'true' : undefined}
                onClick={() => open(r)}
              >
                <span className="skill-name">{r.name}</span>{' '}
                <span className="muted">
                  {r.id === state.currentRegion
                    ? 'here now'
                    : r.visited
                      ? 'visited'
                      : 'not visited'}
                </span>
              </button>{' '}
              {r.id === state.currentRegion ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run({ type: 'region.setCurrent', regionId: null }, 'No current region')
                  }
                >
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`The party is in ${r.name}`}
                  onClick={() =>
                    void run(
                      { type: 'region.setCurrent', regionId: r.id },
                      `The party is in ${r.name}`,
                    )
                  }
                >
                  Party is here
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => void save(e)}
        aria-label={current ? `Edit ${current.name}` : 'New region'}
      >
        <fieldset className="tracker-form" disabled={busy}>
          <legend>{current ? `Edit ${current.name}` : 'New region'}</legend>
          <label>
            Region name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label>
            Region notes (GM only)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              maxLength={4000}
            />
          </label>
          <button type="submit" disabled={command === null}>
            {current ? 'Save region' : 'Add region'}
          </button>
          {current && (
            <button type="button" onClick={() => open(null)}>
              New region
            </button>
          )}
        </fieldset>
      </form>
    </div>
  );
}

function FactionSection({ state, busy, run }: SectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<FactionDraft>(emptyFactionDraft);
  const current = own(state.factions, editing);
  if (editing !== null && current === null) {
    setEditing(null);
    setDraft(emptyFactionDraft());
  }
  const factions = state.factionOrder
    .map((id) => state.factions[id])
    .filter((f): f is Faction => f !== undefined);
  const regionName = (id: string | null) => own(state.regions, id)?.name ?? null;
  const command = factionCommand(current, draft);
  const problem = typeof command === 'string' ? command : null;
  const open = (f: Faction | null) => {
    setEditing(f?.id ?? null);
    setDraft(f ? factionDraftOf(f) : emptyFactionDraft());
  };
  const edit = (change: Partial<FactionDraft>) => setDraft({ ...draft, ...change });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (command === null || typeof command === 'string' || busy) return;
    const name = draft.name.trim().replace(/\s+/gu, ' ');
    const ok = await run(command, current ? `${name} saved` : `${name} added`);
    if (ok && !current) setDraft(emptyFactionDraft());
  };
  return (
    <div role="group" aria-labelledby="trackers-factions">
      <h3 id="trackers-factions">Survivor factions</h3>
      <p className="muted">
        GM only until revealed. Players see a revealed faction's name and standing, never its head
        count, base or notes.
      </p>
      {factions.length === 0 ? (
        <p className="muted">No factions yet.</p>
      ) : (
        <ul className="tracker-list faction-list" aria-label="Factions">
          {factions.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="library-item"
                aria-current={f.id === editing ? 'true' : undefined}
                onClick={() => open(f)}
              >
                <span className="skill-name">{f.name}</span>{' '}
                <span className="muted">
                  {[
                    f.standing || null,
                    f.members === null ? null : `${f.members} survivors`,
                    regionName(f.regionId),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {f.revealed === true && (
                  <span className="faction-revealed" data-testid="faction-revealed">
                    Revealed
                  </span>
                )}
              </button>{' '}
              <button
                type="button"
                className="small"
                disabled={busy}
                aria-pressed={f.revealed === true}
                aria-label={`${f.revealed === true ? 'Hide' : 'Reveal'} ${f.name} ${f.revealed === true ? 'from' : 'to'} players`}
                onClick={() =>
                  void run(
                    { type: 'faction.reveal', factionId: f.id, revealed: f.revealed !== true },
                    f.revealed === true
                      ? `${f.name} hidden from players`
                      : `${f.name} revealed to players`,
                  )
                }
              >
                {f.revealed === true ? 'Hide from players' : 'Reveal to players'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => void save(e)}
        aria-label={current ? `Edit ${current.name}` : 'New faction'}
      >
        <fieldset className="tracker-form" disabled={busy}>
          <legend>{current ? `Edit ${current.name}` : 'New faction'}</legend>
          <label>
            Faction name
            <input
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
              maxLength={120}
            />
          </label>
          <label>
            Based in
            <select value={draft.regionId} onChange={(e) => edit({ regionId: e.target.value })}>
              <option value="">No region</option>
              {state.regionOrder.map((id) => (
                <option key={id} value={id}>
                  {state.regions[id]?.name ?? id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Survivors
            <input
              inputMode="numeric"
              value={draft.members}
              onChange={(e) => edit({ members: e.target.value })}
              size={6}
            />
          </label>
          <label>
            Standing toward the party
            <input
              value={draft.standing}
              onChange={(e) => edit({ standing: e.target.value })}
              placeholder="Wary, Friendly, Allied…"
              maxLength={60}
            />
          </label>
          <label>
            Faction notes
            <textarea
              value={draft.notes}
              onChange={(e) => edit({ notes: e.target.value })}
              rows={1}
              maxLength={4000}
            />
          </label>
          {problem && <p className="err">{problem}</p>}
          <button type="submit" disabled={command === null || problem !== null}>
            {current ? 'Save faction' : 'Add faction'}
          </button>
          {current && (
            <button type="button" onClick={() => open(null)}>
              New faction
            </button>
          )}
        </fieldset>
      </form>
    </div>
  );
}
