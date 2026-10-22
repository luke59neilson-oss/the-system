import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  DEFAULT_RULES,
  STARTER_CLASSES,
  largestRemainderSplit,
  raceLevel,
  type CampaignState,
} from '@the-system/engine';
import { friendlyError } from '../format';
import { forgetGmKey, takeGmKey } from '../gmKey';
import { LiveClient, type CommandResult, type LiveSnapshot } from '../live';
import { CampaignSwitch } from './CampaignSwitch';
import { feedRows } from './feed';
import { JoinPanel } from './JoinPanel';
import { SkillLibrary } from './SkillLibrary';
import { OriginLibrary } from './OriginLibrary';
import { entriesOf } from './originLibraryModel';
import { resolvePerspective, type PartyMember, type Perspective } from './perspective';
import { PerspectiveBar, PlayerPane, TablePanes } from './ViewAs';

/**
 * Minimal GM screen (ROADMAP MS.1): create a campaign and characters from a
 * built-in starter class, award XP with the even split, send a System
 * broadcast. The full console replaces this in M4.
 */
export function GmScreen() {
  const [gmKey] = useState(() => takeGmKey());
  const client = useMemo(() => (gmKey ? new LiveClient({ role: 'gm', gmKey }) : null), [gmKey]);
  useEffect(() => () => client?.close(), [client]);
  // A GM link pasted into this tab changes only the fragment: reload to pick up the key.
  useEffect(() => {
    const onHash = () => {
      if (/(^#|&)key=/.test(window.location.hash)) window.location.reload();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!client) {
    return (
      <main className="gm">
        <h1>The System · GM</h1>
        <section className="window" role="alert">
          <h2>GM key needed</h2>
          <p>
            Open the GM console from the desktop app (its “Players join” box has a GM link for other
            browsers on this computer), or use the GM link printed in the server terminal (it ends
            in <code>#key=…</code>).
          </p>
        </section>
      </main>
    );
  }
  return <GmConsole client={client} gmKey={gmKey ?? ''} />;
}

function useLive(client: LiveClient): LiveSnapshot {
  return useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
}

function partyOf(state: CampaignState | null): PartyMember[] {
  if (!state) return [];
  return state.characterOrder.flatMap((id) => {
    const c = state.characters[id];
    return c ? [{ id, name: c.name }] : [];
  });
}

function GmConsole({ client, gmKey }: { client: LiveClient; gmKey: string }) {
  const live = useLive(client);
  const state = live.state;
  const [wanted, setWanted] = useState<Perspective>({ kind: 'gm' });
  const [picked, setPicked] = useState<string[] | null>(null);
  // Once opened, Table view's panes stay connected (hidden) across switches.
  const [tableOpened, setTableOpened] = useState(false);
  const party = useMemo(() => partyOf(state), [state]);
  const view = resolvePerspective(wanted, party);
  if (view.kind === 'table' && !tableOpened) setTableOpened(true);
  const viewed =
    view.kind === 'character' ? party.find((m) => m.id === view.characterId) : undefined;

  if (live.status === 'refused') {
    return (
      <main className="gm">
        <h1>The System · GM</h1>
        <section className="window" role="alert">
          <h2>Not connected</h2>
          <p>{live.error}</p>
          <button
            type="button"
            onClick={() => {
              forgetGmKey();
              window.location.reload();
            }}
          >
            Forget key
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`gm perspective-${state ? view.kind : 'gm'}`}>
      <header className="gm-header">
        <h1>The System · GM</h1>
        <span className={`status status-${live.status}`} data-testid="connection">
          {live.status === 'joined'
            ? 'Connected'
            : live.status === 'offline'
              ? 'Reconnecting…'
              : 'Connecting…'}
        </span>
        {state && <PerspectiveBar party={party} current={view} onChange={setWanted} />}
      </header>
      {live.status === 'joined' && <CampaignSwitch gmKey={gmKey} stateName={state?.name ?? null} />}
      {live.status === 'joined' && state === null && <CreateCampaign client={client} />}
      {state && (
        <div className="perspective-body">
          {/* Kept mounted while viewing as a character so half-filled GM forms survive. */}
          <div className="gm-pane" hidden={view.kind === 'character'}>
            <div className="gm-grid">
              <Party state={state} />
              <JoinPanel gmKey={gmKey} />
              <CreateCharacter client={client} state={state} />
              <AwardXp client={client} state={state} />
              <Broadcast client={client} state={state} />
              <SkillText client={client} state={state} />
              <SkillLibrary client={client} state={state} />
              <OriginLibrary client={client} state={state} />
              <Feed live={live} state={state} />
            </div>
          </div>
          {viewed && (
            <div className="single-pane">
              <PlayerPane key={viewed.id} member={viewed} />
            </div>
          )}
          {tableOpened && (
            <div className="table-side" hidden={view.kind !== 'table'}>
              <TablePanes party={party} picked={picked} onPick={setPicked} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/** Runs a command and keeps its outcome for display. */
function useCommand(client: LiveClient) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const run = async (command: { type: string } & Record<string, unknown>) => {
    setBusy(true);
    const r = await client.command(command);
    setResult(r.ok ? r : { ok: false, error: friendlyError(r.error) });
    setBusy(false);
    return r;
  };
  return { busy, result, run };
}

function Outcome({ result, okText }: { result: CommandResult | null; okText: string }) {
  if (!result) return null;
  return result.ok ? (
    <p className="ok" role="status">
      {okText}
    </p>
  ) : (
    <p className="err" role="alert">
      {result.error}
    </p>
  );
}

function CreateCampaign({ client }: { client: LiveClient }) {
  const [name, setName] = useState('');
  const [defaults, setDefaults] = useState(true);
  const { busy, result, run } = useCommand(client);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run({ type: 'campaign.create', name, rules: DEFAULT_RULES });
    // The default class, race, profession and skill libraries (M4.2); if this
    // fails or is left out, the library window offers it again.
    if (r.ok && defaults) await client.command({ type: 'library.seedDefaults' });
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="new-campaign">
      <h2 id="new-campaign">New campaign</h2>
      <label>
        Campaign name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label className="check">
        <input type="checkbox" checked={defaults} onChange={(e) => setDefaults(e.target.checked)} />
        Start with the default classes, Human race, professions and their skills
      </label>
      <button type="submit" disabled={busy}>
        Create campaign
      </button>
      <Outcome result={result} okText="Campaign created" />
    </form>
  );
}

function Party({ state }: { state: CampaignState }) {
  const characters = state.characterOrder.flatMap((id) => state.characters[id] ?? []);
  return (
    <section className="window party" aria-labelledby="party">
      <h2 id="party">{state.name} · Party</h2>
      {characters.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Class</th>
              <th scope="col">Class lvl</th>
              <th scope="col">Race lvl</th>
              <th scope="col">Grade</th>
              <th scope="col">XP</th>
              <th scope="col">Free pts</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((c) => (
              <tr key={c.id} data-testid={`row-${c.id}`}>
                <td>{c.name}</td>
                <td>[{c.className}]</td>
                <td data-testid={`class-level-${c.id}`}>{c.classLevel}</td>
                <td>{raceLevel(state.rules, c)}</td>
                <td>{c.grade}</td>
                <td>{c.xp.class}</td>
                <td>
                  {c.freePointBatches
                    .filter((b) => b.allocation === null)
                    .reduce((a, b) => a + b.points, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A class the form can start a character with: the library's, else the built-in starters. */
interface ClassChoice {
  id: string;
  name: string;
  description: string;
  skills: readonly { name: string; rarity: string; description?: string; flavor?: string }[];
  weights: Readonly<Record<string, number>>;
}

function CreateCharacter({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [name, setName] = useState('');
  const library = entriesOf(state, 'class') as ClassChoice[];
  // Campaigns made before M4.2 may have no classes yet; the built-in Archer keeps working.
  const classes: readonly ClassChoice[] = library.length > 0 ? library : STARTER_CLASSES;
  const races = entriesOf(state, 'race').map((r) => r.name);
  const raceChoices = races.length > 0 ? races : [state.rules.character.defaultRace];
  const [classId, setClassId] = useState('');
  const [race, setRace] = useState('');
  const { busy, result, run } = useCommand(client);
  const chosen = classes.find((c) => c.id === classId) ?? classes[0];
  const chosenRace = raceChoices.includes(race) ? race : (raceChoices[0] ?? '');
  const rarityName = (id: string) =>
    state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    const r = await run({
      type: 'character.create',
      name,
      className: chosen.name,
      race: chosenRace,
      // Built-in starters carry their own skill text; library classes take it from the skill library.
      classSkills: chosen.skills,
      classWeights: chosen.weights,
    });
    if (r.ok) setName('');
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="new-character">
      <h2 id="new-character">New character</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Starting class
        <select value={chosen?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Race
        <select value={chosenRace} onChange={(e) => setRace(e.target.value)}>
          {raceChoices.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="muted">
          {chosen.description} Skills:{' '}
          {chosen.skills.map((s) => `[${s.name} (${rarityName(s.rarity)})]`).join(' ')}
        </p>
      )}
      <button type="submit" disabled={busy || !chosen}>
        Create character
      </button>
      <Outcome result={result} okText="Character created" />
    </form>
  );
}

function AwardXp({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [amount, setAmount] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState('');
  const { busy, result, run } = useCommand(client);
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const chosen = ids.filter((id) => !excluded.has(id));
  const value = Number(amount);
  const valid = amount !== '' && Number.isInteger(value) && value > 0 && chosen.length > 0;
  const preview = valid
    ? largestRemainderSplit(
        value,
        chosen.map(() => 1),
      )
    : [];
  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const r = await run({
      type: 'xp.award',
      track: 'class',
      amount: value,
      participants: chosen.map((characterId) => ({ characterId })),
      reason,
    });
    if (r.ok) {
      setAmount('');
      setReason('');
    }
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="award-xp">
      <h2 id="award-xp">Award class XP</h2>
      <label>
        Amount
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <fieldset>
        <legend>Participants (even split)</legend>
        {ids.length === 0 && <p className="muted">Create a character first.</p>}
        {ids.map((id) => {
          const i = chosen.indexOf(id);
          return (
            <label key={id} className="check">
              <input type="checkbox" checked={!excluded.has(id)} onChange={() => toggle(id)} />
              {state.characters[id]?.name}
              {i >= 0 && preview[i] !== undefined && (
                <span className="muted" data-testid={`share-${id}`}>
                  {' '}
                  · {preview[i]} XP
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      <label>
        Reason (GM only)
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </label>
      <button type="submit" disabled={busy || !valid}>
        Award XP
      </button>
      <Outcome result={result} okText="XP awarded" />
    </form>
  );
}

/**
 * Writes a skill's System description and flavour (M3.5, D78) until the skill
 * library (M4.1) does it on grant. Picking a skill loads its current text.
 */
function SkillText({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [characterId, setCharacterId] = useState('');
  const [skillName, setSkillName] = useState('');
  // The draft belongs to one character's skill (`<id>/<name>`); null means the
  // fields show the stored text. It resets after a save (M3.5 review).
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [flavor, setFlavor] = useState('');
  const { busy, result, run } = useCommand(client);
  const character =
    state.characters[characterId] ?? state.characters[state.characterOrder[0] ?? ''];
  const skills = character?.skills ?? [];
  const current = skills.find((s) => s.name === skillName) ?? skills[0];
  const draftKey = character && current ? `${character.id}/${current.name}` : '';
  const loaded = draftFor !== null && draftFor === draftKey;
  const shownDescription = loaded ? description : (current?.description ?? '');
  const shownFlavor = loaded ? flavor : (current?.flavor ?? '');
  const edit = (field: 'description' | 'flavor', value: string) => {
    if (!loaded) {
      setDescription(current?.description ?? '');
      setFlavor(current?.flavor ?? '');
      setDraftFor(draftKey);
    }
    if (field === 'description') setDescription(value);
    else setFlavor(value);
  };
  const unchanged =
    current !== undefined &&
    shownDescription.trim() === (current.description ?? '') &&
    shownFlavor.trim() === (current.flavor ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || !current) return;
    const r = await run({
      type: 'skill.describe',
      characterId: character.id,
      skill: current.name,
      description: shownDescription,
      flavor: shownFlavor,
    });
    if (r.ok) setDraftFor(null);
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="skill-text">
      <h2 id="skill-text">Skill text</h2>
      <label>
        Character
        <select
          value={character?.id ?? ''}
          onChange={(e) => {
            setCharacterId(e.target.value);
            setSkillName('');
            setDraftFor(null);
          }}
        >
          {state.characterOrder.map((id) => (
            <option key={id} value={id}>
              {state.characters[id]?.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Skill
        <select
          value={current?.name ?? ''}
          onChange={(e) => {
            setSkillName(e.target.value);
            setDraftFor(null);
          }}
        >
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea
          value={shownDescription}
          onChange={(e) => edit('description', e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </label>
      <label>
        Flavour
        <input
          value={shownFlavor}
          onChange={(e) => edit('flavor', e.target.value)}
          maxLength={1000}
        />
      </label>
      <button type="submit" disabled={busy || !current || unchanged}>
        Save skill text
      </button>
      <Outcome result={result} okText="Skill text saved" />
    </form>
  );
}

function Broadcast({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('all');
  const { busy, result, run } = useCommand(client);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run({
      type: 'system.broadcast',
      text,
      characterIds: to === 'all' ? null : [to],
    });
    if (r.ok) setText('');
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="broadcast">
      <h2 id="broadcast">System broadcast</h2>
      <label>
        Message
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={2000}
          rows={3}
        />
      </label>
      <label>
        To
        <select aria-label="Recipients" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="all">Everyone</option>
          {state.characterOrder.map((id) => (
            <option key={id} value={id}>
              {state.characters[id]?.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        Send broadcast
      </button>
      <Outcome result={result} okText="Broadcast sent" />
    </form>
  );
}

function Feed({ live, state }: { live: LiveSnapshot; state: CampaignState }) {
  const rows = feedRows(live.notifications, state);
  return (
    <section className="window feed" aria-labelledby="feed">
      <h2 id="feed">System feed</h2>
      {rows.length === 0 ? (
        <p className="muted">Level-ups and broadcasts appear here.</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.key}>
              <span className="who">{row.who}</span> {row.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
