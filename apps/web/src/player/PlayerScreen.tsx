import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  Fragment,
  type ReactNode,
} from 'react';
import type { OwnSheet, PlayerView } from '@the-system/engine';
import { notificationText } from '../format';
import { isPaneMode } from '../gm/perspective';
import { LiveClient, type LiveSnapshot } from '../live';
import { browserStorage, remember } from './join';
import { cssToken, formatStatValue, rarityName, themeClass, unassignedPoints } from './sheet';

/**
 * Player status screen (MS.2 walking skeleton; the full M3 screens build on it).
 */
export function PlayerScreen({ characterId }: { characterId: string }) {
  const client = useMemo(() => new LiveClient({ role: 'player', characterId }), [characterId]);
  useEffect(() => () => client.close(), [client]);
  const live = useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
  const view = live.view;
  // Inside the GM app's "View as" frames (MS.3): same client, compact chrome.
  const [pane] = useState(() => isPaneMode(window.location.search));
  // M3.1: this browser remembers who it plays (never the GM's View-as frames).
  // A stale id is harmless: the join screen offers it only while it is listed.
  useEffect(() => {
    if (!pane && live.status === 'joined') remember(browserStorage(), characterId);
  }, [pane, live.status, characterId]);
  return (
    <main className={pane ? 'player pane-mode' : 'player'}>
      <header className="gm-header">
        {pane ? <h1 className="sr-only">The System</h1> : <h1>The System</h1>}
        <span className={`status status-${live.status}`} data-testid="connection">
          {live.status === 'joined'
            ? 'Connected'
            : live.status === 'offline'
              ? 'Reconnecting…'
              : live.status === 'refused'
                ? 'Not connected'
                : 'Connecting…'}
        </span>
        {!pane && (
          <a className="muted" href="/">
            Switch character
          </a>
        )}
      </header>
      {live.campaign === 'demo' && (
        <p className="demo-badge" data-testid="demo-badge">
          Demo campaign: for trying the app out
        </p>
      )}
      {pane && <PaneLatest live={live} view={view} />}
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
  const metal = themeClass(rules.grades.find((g) => g.id === me.grade)?.theme);
  const skills = (kind: SkillKind) => me.skills.filter((s) => s.kind === kind);
  const free = unassignedPoints(me.freePointBatches);
  return (
    <section
      className={`window status-window${metal}`}
      aria-labelledby="status"
      data-testid="status"
    >
      <h2 id="status">Status</h2>
      <dl className="rows">
        <dt>Name</dt>
        <dd data-testid="name">{me.name}</dd>
        <dt>Race</dt>
        <Live testId="race" value={`[${me.race} (${me.grade}) – lvl ${me.raceLevel}]`} />
        <dt>Class</dt>
        <Live testId="class" value={`[${me.className} – lvl ${me.classLevel}]`} />
        {me.profession !== null && (
          <>
            <dt>Profession</dt>
            <Live testId="profession" value={`[${me.profession} – lvl ${me.professionLevel}]`} />
          </>
        )}
        {me.pools.map((p) => (
          <div className="pool" key={p.id}>
            <dt>{poolName(p.id)}</dt>
            <Live testId={`pool-${p.id}`} value={`${p.current}/${p.max}`}>
              <span className="pool-bar" aria-hidden="true">
                <span style={{ width: `${p.max > 0 ? (100 * p.current) / p.max : 0}%` }} />
              </span>
            </Live>
          </div>
        ))}
      </dl>
      <h3>Stats</h3>
      <ul className="stats">
        {rules.stats.list.map((s) => (
          <li key={s.id} data-testid={`stat-${s.id}`}>
            <span>{s.name}</span> <LiveStrong value={formatStatValue(rules, me.stats[s.id] ?? 0)} />
          </li>
        ))}
      </ul>
      <dl className="rows">
        <dt>Free points</dt>
        <Live testId="free-points" value={String(free)} />
        {me.titles.length > 0 && (
          <>
            <dt>Titles</dt>
            <dd data-testid="titles">{me.titles.map((t) => `[${t}]`).join(', ')}</dd>
          </>
        )}
      </dl>
      <SkillList title="Class Skills" kind="class" list={skills('class')} rules={rules} />
      {skills('profession').length > 0 && (
        <SkillList
          title="Profession Skills"
          kind="profession"
          list={skills('profession')}
          rules={rules}
        />
      )}
      <SkillList title="Race Skills" kind="race" list={skills('race')} rules={rules} />
    </section>
  );
}

type SkillKind = 'class' | 'profession' | 'race';

function SkillList({
  title,
  kind,
  list,
  rules,
}: {
  title: string;
  kind: SkillKind;
  list: OwnSheet['skills'];
  rules: PlayerView['rules'];
}) {
  const id = `skills-${kind}`;
  return (
    <>
      <h3 id={id}>{title}</h3>
      {list.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul className="skills" aria-labelledby={id} data-testid={id}>
          {list.map((s) => (
            <li key={s.name} className={`skill rarity-${cssToken(s.rarity)}`} data-testid="skill">
              <span className="skill-name">
                [{s.name} ({rarityName(rules, s.rarity)})]
              </span>
              {s.nickname && <span className="nickname"> “{s.nickname}”</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * A value that glows briefly whenever it changes after the screen opened
 * (DESIGN §9 "values update live"). Re-keying replays the CSS animation.
 */
function Live({
  value,
  testId,
  children,
}: {
  value: string;
  testId: string;
  children?: ReactNode;
}) {
  const [initial] = useState(value);
  return (
    <dd className={value !== initial ? 'flash' : undefined} key={value}>
      <span data-testid={testId}>
        {value.split(' – ').map((part, i) =>
          // Narrow screens wrap at the dash, never inside a bracketed name.
          i === 0 ? (
            <span className="nowrap" key={i}>
              {part}
            </span>
          ) : (
            <Fragment key={i}>
              {' '}
              <span className="nowrap">– {part}</span>
            </Fragment>
          ),
        )}
      </span>
      {children}
    </dd>
  );
}

function LiveStrong({ value }: { value: string }) {
  const [initial] = useState(value);
  return (
    <strong key={value} className={value !== initial ? 'flash' : undefined}>
      {value}
    </strong>
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
        {live.gap && (
          <p className="muted" data-testid="gap">
            Some notifications were missed while you were disconnected; your sheet is up to date.
          </p>
        )}
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

/**
 * Pane mode only: the newest DING and System message pinned above the sheet,
 * so the GM sees them land in a small Table-view pane without scrolling.
 */
function PaneLatest({ live, view }: { live: LiveSnapshot; view: PlayerView | null }) {
  const latest = live.notifications.filter((n) => n.notification.kind === 'level').at(-1);
  const message = view?.messages.at(-1);
  if (!latest && !message) return null;
  return (
    <div className="pane-latest" aria-live="polite">
      {latest && <p data-testid="latest-ding">{notificationText(latest.notification)}</p>}
      {message && (
        <p data-testid="latest-message">
          <span className="muted">System:</span> {message.text}
        </p>
      )}
    </div>
  );
}
