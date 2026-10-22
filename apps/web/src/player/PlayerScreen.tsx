import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Fragment,
  type ReactNode,
} from 'react';
import type { OwnSheet, PlayerView } from '@the-system/engine';
import { friendlyError, notificationText } from '../format';
import { isPaneMode } from '../gm/perspective';
import { LiveClient, type LiveSnapshot } from '../live';
import { playChime, unlockChime } from './chime';
import {
  HISTORY_FILTERS,
  filterHistory,
  nextArrival,
  notificationKey,
  readSound,
  whenLabel,
  writeSound,
  type HistoryFilter,
} from './history';
import { allocationText, assignedBatches, nextBatch, spent, step } from './freePoints';
import { browserStorage, remember } from './join';
import {
  cssToken,
  formatStatValue,
  poolPercent,
  rarityName,
  themeClass,
  unassignedPoints,
} from './sheet';

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
  // M3.3: the optional DING sound, remembered per browser (off by default).
  const [sound, setSound] = useState(() => readSound(browserStorage()));
  const toggleSound = () => {
    const next = !sound;
    if (next) unlockChime();
    writeSound(browserStorage(), next);
    setSound(next);
  };
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
          <button
            type="button"
            className="sound-toggle"
            aria-pressed={sound}
            data-testid="sound"
            onClick={toggleSound}
          >
            Sound: {sound ? 'on' : 'off'}
          </button>
        )}
        {!pane && (
          <a className="muted" href="/">
            Switch character
          </a>
        )}
      </header>
      {!pane && view && <DingQueue key={live.campaign ?? ''} live={live} sound={sound} />}
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
          <Status view={view} client={pane ? null : client} />
          <Feed live={live} view={view} />
        </div>
      )}
    </main>
  );
}

function Status({ view, client }: { view: PlayerView; client: LiveClient | null }) {
  const me: OwnSheet = view.me;
  const rules = view.rules;
  const poolName = (id: string) => rules.pools.find((p) => p.id === id)?.name ?? id;
  const metal = themeClass(rules.grades.find((g) => g.id === me.grade)?.theme);
  const skills = (kind: SkillKind) => me.skills.filter((s) => s.kind === kind);
  const free = unassignedPoints(me.freePointBatches);
  const [assigning, setAssigning] = useState(false);
  const batch = nextBatch(me.freePointBatches);
  const locked = assignedBatches(me.freePointBatches);
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
        <Track testId="race" name={`${me.race} (${me.grade})`} level={me.raceLevel} />
        <dt>Class</dt>
        <Track testId="class" name={me.className} level={me.classLevel} />
        {me.profession !== null && (
          <>
            <dt>Profession</dt>
            <Track testId="profession" name={me.profession} level={me.professionLevel} />
          </>
        )}
        {me.pools.map((p) => (
          <div className="pool" key={p.id}>
            <dt>{poolName(p.id)}</dt>
            <Live testId={`pool-${p.id}`} value={`${p.current}/${p.max}`}>
              <span className="pool-bar" aria-hidden="true">
                <span
                  data-testid={`pool-bar-${p.id}`}
                  style={{ width: `${poolPercent(p.current, p.max)}%` }}
                />
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
        <Live testId="free-points" value={String(free)}>
          {client && batch && !assigning && (
            <button type="button" className="assign-btn" onClick={() => setAssigning(true)}>
              [Assign]
            </button>
          )}
        </Live>
        {me.titles.length > 0 && (
          <>
            <dt>Titles</dt>
            <dd data-testid="titles">{me.titles.map((t) => `[${t}]`).join(', ')}</dd>
          </>
        )}
      </dl>
      {client && batch && assigning && (
        <AssignPoints
          key={batch.raceLevel}
          client={client}
          view={view}
          raceLevel={batch.raceLevel}
          points={batch.points}
          more={me.freePointBatches.filter((b) => b.allocation === null).length - 1}
          onClose={() => setAssigning(false)}
        />
      )}
      {locked.length > 0 && (
        <details className="locked-points" data-testid="locked-points">
          <summary>Assigned points (locked)</summary>
          <ul>
            {locked.map((b) => (
              <li key={b.raceLevel}>
                Race level {b.raceLevel}: {allocationText(rules, b.allocation ?? {})}
              </li>
            ))}
          </ul>
        </details>
      )}
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

/**
 * Assign one free-point batch (M3.4): spread exactly its points, review,
 * confirm. Assigned points lock; only the GM can change them (D38).
 */
function AssignPoints({
  client,
  view,
  raceLevel,
  points,
  more,
  onClose,
}: {
  client: LiveClient;
  view: PlayerView;
  raceLevel: number;
  points: number;
  more: number;
  onClose: () => void;
}) {
  const rules = view.rules;
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = points - spent(allocation);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await client.command({
      type: 'freePoints.assign',
      characterId: view.me.id,
      raceLevel,
      allocation,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(friendlyError(result.error));
  };
  return (
    <section className="assign" aria-labelledby="assign-heading" data-testid="assign">
      <h3 id="assign-heading">Assign free points</h3>
      <p className="muted">
        Race level {raceLevel}: {points} points
        {more > 0 ? ` (${more} more ${more === 1 ? 'batch' : 'batches'} waiting)` : ''}
      </p>
      {!review ? (
        <>
          <ul className="assign-stats">
            {rules.stats.list.map((s) => {
              const added = allocation[s.id] ?? 0;
              const base = view.me.stats[s.id] ?? 0;
              return (
                <li key={s.id} data-testid={`assign-${s.id}`}>
                  <span className="assign-name">{s.name}</span>
                  <span className="assign-value">
                    {formatStatValue(rules, base + added)}
                    {added > 0 && <span className="assign-added"> (+{added})</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove a point from ${s.name}`}
                    disabled={added === 0}
                    onClick={() => setAllocation((a) => step(a, s.id, -1, points))}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Add a point to ${s.name}`}
                    disabled={left === 0}
                    onClick={() => setAllocation((a) => step(a, s.id, 1, points))}
                  >
                    +
                  </button>
                </li>
              );
            })}
          </ul>
          <p data-testid="points-left" aria-live="polite">
            Points left: {left}
          </p>
          <div className="assign-actions">
            <button type="button" disabled={left !== 0} onClick={() => setReview(true)}>
              Review
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p data-testid="assign-review">
            Assign {allocationText(rules, allocation)}? Assigned points lock; only the GM can change
            them.
          </p>
          <div className="assign-actions">
            <button type="button" disabled={busy} onClick={() => void confirm()}>
              Confirm
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Back
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
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
 * Counts changes to `value` after the first render (React's "adjust state
 * while rendering" pattern, no refs or effects). Used as a key, it remounts
 * the element so the CSS glow replays on every change (DESIGN §9 "values
 * update live"), including a change back to an earlier value.
 */
function useChangeCount(value: string): number {
  const [seen, setSeen] = useState(value);
  const [count, setCount] = useState(0);
  if (value !== seen) {
    setSeen(value);
    setCount(count + 1);
  }
  return count;
}

/**
 * A live row value. `parts` (default: the whole value) are kept unbroken, so
 * narrow screens wrap between them, never inside a bracketed name.
 */
function Live({
  value,
  parts = [value],
  testId,
  children,
}: {
  value: string;
  parts?: readonly string[];
  testId: string;
  children?: ReactNode;
}) {
  const changes = useChangeCount(value);
  return (
    <dd className={changes > 0 ? 'flash' : undefined} key={changes}>
      <span data-testid={testId}>
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="nowrap">{part}</span>
          </Fragment>
        ))}
      </span>
      {children}
    </dd>
  );
}

function LiveStrong({ value }: { value: string }) {
  const changes = useChangeCount(value);
  return (
    <strong key={changes} className={changes > 0 ? 'flash' : undefined}>
      {value}
    </strong>
  );
}

/** A `[Name – lvl N]` track row that wraps only before the dash. */
function Track({ testId, name, level }: { testId: string; name: string; level: number }) {
  return (
    <Live
      testId={testId}
      value={`[${name} – lvl ${level}]`}
      parts={[`[${name}`, `– lvl ${level}]`]}
    />
  );
}

function Feed({ live, view }: { live: LiveSnapshot; view: PlayerView }) {
  const [filter, setFilter] = useState<HistoryFilter>('dings');
  const [query, setQuery] = useState('');
  const rows = filterHistory(live.notifications, filter, query);
  const messages = [...view.messages].reverse();
  return (
    <div className="feeds">
      <section className="window feed" aria-labelledby="dings" data-testid="history">
        <h2 id="dings">Notifications</h2>
        <div className="history-tools">
          <label>
            <span className="sr-only">Show</span>
            <select
              aria-label="Show"
              value={filter}
              onChange={(e) => setFilter(e.target.value as HistoryFilter)}
            >
              {HISTORY_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            aria-label="Search notifications"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {live.notifications.length === 0 ? (
          <p className="muted">Level-ups appear here as they happen.</p>
        ) : rows.length === 0 ? (
          <p className="muted" data-testid="history-empty">
            No notifications match.
          </p>
        ) : (
          <ol data-testid="dings" className="history">
            {rows.map((n, i) => (
              <li
                key={`${n.seq}-${rows.length - i}`}
                className={i === 0 && filter === 'dings' && query === '' ? 'fresh' : undefined}
              >
                <span className="when">{whenLabel(n)}</span>{' '}
                <span className="ding-text">{notificationText(n.notification)}</span>
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

/** How long each queued DING stays up (ms). UI timing, not a rule number. */
const DING_MS = 2600;

/**
 * Book-style DINGs that arrive while the page is open pop up one at a time
 * (M3.3), oldest first, each with the optional chime. Click to skip ahead.
 * Older history never pops up; it is in the Notifications list.
 */
function DingQueue({ live, sound }: { live: LiveSnapshot; sound: boolean }) {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const { current, waiting } = nextArrival(live.notifications, live.liveSince, shown);
  const key = current ? notificationKey(current) : null;
  const done = (k: string) => setShown((s) => new Set(s).add(k));
  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => done(key), DING_MS);
    return () => clearTimeout(timer);
  }, [key]);
  // The chime plays once per DING, not again when sound is toggled.
  const chimed = useRef<string | null>(null);
  useEffect(() => {
    if (key === null || chimed.current === key) return;
    chimed.current = key;
    if (sound) playChime();
  }, [key, sound]);
  return (
    <div className="ding-layer" aria-live="polite">
      {current && (
        <button
          type="button"
          className="ding-toast"
          key={key}
          data-testid="ding-toast"
          onClick={() => key !== null && done(key)}
        >
          <span>{notificationText(current.notification)}</span>
          {waiting > 0 && (
            <span className="ding-more" data-testid="ding-more">
              +{waiting} more
            </span>
          )}
        </button>
      )}
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
