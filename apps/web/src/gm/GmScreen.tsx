import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  DEFAULT_RULES,
  STARTER_CLASSES,
  largestRemainderSplit,
  raceLevel,
  type CampaignState,
} from '@the-system/engine';
import { friendlyError, notificationText } from '../format';
import { forgetGmKey, takeGmKey } from '../gmKey';
import { LiveClient, type CommandResult, type LiveSnapshot } from '../live';

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
            Open the GM console from the desktop app, or use the GM link printed in the server
            terminal (it ends in <code>#key=…</code>).
          </p>
        </section>
      </main>
    );
  }
  return <GmConsole client={client} />;
}

function useLive(client: LiveClient): LiveSnapshot {
  return useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
}

function GmConsole({ client }: { client: LiveClient }) {
  const live = useLive(client);
  const state = live.state;

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
    <main className="gm">
      <header className="gm-header">
        <h1>The System · GM</h1>
        <span className={`status status-${live.status}`} data-testid="connection">
          {live.status === 'joined'
            ? 'Connected'
            : live.status === 'offline'
              ? 'Reconnecting…'
              : 'Connecting…'}
        </span>
      </header>
      {live.status === 'joined' && state === null && <CreateCampaign client={client} />}
      {state && (
        <div className="gm-grid">
          <Party state={state} />
          <CreateCharacter client={client} />
          <AwardXp client={client} state={state} />
          <Broadcast client={client} state={state} />
          <Feed live={live} state={state} />
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
  const { busy, result, run } = useCommand(client);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ type: 'campaign.create', name, rules: DEFAULT_RULES });
  };
  return (
    <form className="window" onSubmit={submit} aria-labelledby="new-campaign">
      <h2 id="new-campaign">New campaign</h2>
      <label>
        Campaign name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
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

function CreateCharacter({ client }: { client: LiveClient }) {
  const [name, setName] = useState('');
  const [starterId, setStarterId] = useState(STARTER_CLASSES[0]?.id ?? '');
  const { busy, result, run } = useCommand(client);
  const starter = STARTER_CLASSES.find((s) => s.id === starterId);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!starter) return;
    const r = await run({
      type: 'character.create',
      name,
      className: starter.name,
      classSkills: starter.skills,
      classWeights: starter.weights,
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
        <select value={starterId} onChange={(e) => setStarterId(e.target.value)}>
          {STARTER_CLASSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {starter && (
        <p className="muted">
          {starter.description} Skills:{' '}
          {starter.skills.map((s) => `[${s.name} (${s.rarity})]`).join(' ')}
        </p>
      )}
      <button type="submit" disabled={busy}>
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
  const valid = amount !== '' && Number.isInteger(value) && value >= 0 && chosen.length > 0;
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
          min={0}
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
        <select value={to} onChange={(e) => setTo(e.target.value)}>
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
  const items = [...live.notifications].reverse().slice(0, 50);
  return (
    <section className="window feed" aria-labelledby="feed">
      <h2 id="feed">System feed</h2>
      {items.length === 0 ? (
        <p className="muted">Level-ups and broadcasts appear here.</p>
      ) : (
        <ol>
          {items.map((n, i) => (
            <li key={`${n.seq}-${i}`}>
              <span className="who">
                {state.characters[n.notification.characterId]?.name ?? '—'}
              </span>{' '}
              {notificationText(n.notification)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
