import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ENGINE_NAME, type OwnSheet, type PlayerView } from '@the-system/engine';
import { notificationText } from '../format';
import { LiveClient, type LiveSnapshot } from '../live';
import { formatStatValue, rarityName, unassignedPoints } from './sheet';

/**
 * Minimal player screen (ROADMAP MS.2): pick a character, then the DESIGN §9
 * core rows and a live DING feed. The full player app replaces this in M3.
 */
export function PlayerHome() {
  const [characters, setCharacters] = useState<
    { id: string; name: string; grade: string }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/characters')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list: { id: string; name: string; grade: string }[]) => setCharacters(list))
      .catch(() => setError('Could not reach the System. Is the GM’s laptop on?'));
  }, []);
  return (
    <main className="player" data-engine={ENGINE_NAME}>
      <h1>The System</h1>
      <section className="window" aria-labelledby="choose">
        <h2 id="choose">Choose your character</h2>
        {error && <p className="err">{error}</p>}
        {!error && characters === null && <p className="muted">Connecting to the System…</p>}
        {characters?.length === 0 && (
          <p className="muted">No characters yet. Your GM will create them.</p>
        )}
        <ul className="choices">
          {characters?.map((c) => (
            <li key={c.id}>
              <a href={`/play/${encodeURIComponent(c.id)}`}>
                {c.name} <span className="muted">({c.grade})</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export function PlayerScreen({ characterId }: { characterId: string }) {
  const client = useMemo(() => new LiveClient({ role: 'player', characterId }), [characterId]);
  useEffect(() => () => client.close(), [client]);
  const live = useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
  const view = live.view;
  return (
    <main className="player">
      <header className="gm-header">
        <h1>The System</h1>
        <span className={`status status-${live.status}`} data-testid="connection">
          {live.status === 'joined'
            ? 'Connected'
            : live.status === 'offline'
              ? 'Reconnecting…'
              : live.status === 'refused'
                ? 'Not connected'
                : 'Connecting…'}
        </span>
        <a className="muted" href="/">
          Switch character
        </a>
      </header>
      {(live.status === 'refused' || live.error) && (
        <p className="err" role="alert">
          {live.error}
        </p>
      )}
      {view && live.status !== 'refused' && (
        <div className="player-grid">
          <Status view={view} />
          <Feed live={live} view={view} />
        </div>
      )}
    </main>
  );
}

function Status({ view }: { view: PlayerView }) {
  const me: OwnSheet = view.me;
  const rules = view.rules;
  const poolName = (id: string) => rules.pools.find((p) => p.id === id)?.name ?? id;
  const skills = (kind: 'class' | 'profession' | 'race') =>
    me.skills.filter((s) => s.kind === kind);
  const skillList = (kind: 'class' | 'profession' | 'race') =>
    skills(kind)
      .map(
        (s) =>
          `[${s.name} (${rarityName(rules, s.rarity)})]${s.nickname ? ` “${s.nickname}”` : ''}`,
      )
      .join(' ');
  return (
    <section className="window status-window" aria-labelledby="status" data-testid="status">
      <h2 id="status">Status</h2>
      <dl className="rows">
        <dt>Name</dt>
        <dd data-testid="name">{me.name}</dd>
        <dt>Race</dt>
        <dd data-testid="race">
          [{me.race} ({me.grade}) – lvl {me.raceLevel}]
        </dd>
        <dt>Class</dt>
        <dd data-testid="class">
          [{me.className} – lvl {me.classLevel}]
        </dd>
        {me.profession !== null && (
          <>
            <dt>Profession</dt>
            <dd data-testid="profession">
              [{me.profession} – lvl {me.professionLevel}]
            </dd>
          </>
        )}
        {me.pools.map((p) => (
          <div className="pool" key={p.id}>
            <dt>{poolName(p.id)}</dt>
            <dd data-testid={`pool-${p.id}`}>
              {p.current}/{p.max}
            </dd>
          </div>
        ))}
      </dl>
      <h3>Stats</h3>
      <ul className="stats">
        {rules.stats.list.map((s) => (
          <li key={s.id} data-testid={`stat-${s.id}`}>
            <span>{s.name}</span> <strong>{formatStatValue(rules, me.stats[s.id] ?? 0)}</strong>
          </li>
        ))}
      </ul>
      <dl className="rows">
        <dt>Free points</dt>
        <dd data-testid="free-points">{unassignedPoints(me.freePointBatches)}</dd>
        {me.titles.length > 0 && (
          <>
            <dt>Titles</dt>
            <dd>{me.titles.map((t) => `[${t}]`).join(', ')}</dd>
          </>
        )}
        <dt>Class Skills</dt>
        <dd>{skillList('class') || '—'}</dd>
        {skills('profession').length > 0 && (
          <>
            <dt>Profession Skills</dt>
            <dd>{skillList('profession')}</dd>
          </>
        )}
        <dt>Race Skills</dt>
        <dd>{skillList('race') || '—'}</dd>
      </dl>
    </section>
  );
}

function Feed({ live, view }: { live: LiveSnapshot; view: PlayerView }) {
  const dings = live.notifications
    .filter((n) => n.notification.kind === 'level')
    .slice()
    .reverse();
  const messages = [...view.messages].reverse();
  return (
    <div className="feeds">
      <section className="window feed" aria-labelledby="dings">
        <h2 id="dings">Notifications</h2>
        {dings.length === 0 ? (
          <p className="muted">Level-ups appear here as they happen.</p>
        ) : (
          <ol data-testid="dings">
            {dings.map((n, i) => (
              <li key={`${n.seq}-${dings.length - i}`} className={i === 0 ? 'fresh' : undefined}>
                {notificationText(n.notification)}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="window feed" aria-labelledby="messages">
        <h2 id="messages">System messages</h2>
        {messages.length === 0 ? (
          <p className="muted">Nothing from the System yet.</p>
        ) : (
          <ol data-testid="messages">
            {messages.map((m) => (
              <li key={m.id}>{m.text}</li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
