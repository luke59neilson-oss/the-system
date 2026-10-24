import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Fragment,
  type ReactNode,
} from 'react';
import { titleKey, type OwnSheet, type PlayerView } from '@the-system/engine';
import { friendlyError, notificationText } from '../format';
import { isPaneMode } from '../gm/perspective';
import { LiveClient, type LiveSnapshot } from '../live';
import { playChime, unlockChime } from './chime';
import { contestLines, newContests } from './contest';
import {
  HISTORY_FILTERS,
  filterHistory,
  isDing,
  nextArrival,
  notificationKey,
  readSound,
  whenLabel,
  writeSound,
  type HistoryFilter,
} from './history';
import { allocationText, assignedBatches, nextBatch, spent, step } from './freePoints';
import { browserStorage, remember } from './join';
import { Inventory } from './Inventory';
import { QuestLog } from './QuestLog';
import { IdentifyPanel } from './IdentifyPanel';
import { NotesPanel } from './NotesPanel';
import { PracticePanel } from './PracticePanel';
import { PartyPanel } from './PartyPanel';
import { useChangeCount } from './changeCount';
import { SkillDetail } from './SkillDetail';
import { SkillSelection } from './SkillSelection';
import { EvolutionChoice } from './EvolutionChoice';
import { describeTitleBonuses } from './titles';
import { ProfessionsPanel } from './ProfessionsPanel';
import { closedReason, pendingSelections, pendingText, settleNotice } from './selection';
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
  // Inside the GM app's "View as" frames (MS.3): same client, compact chrome,
  // read-only, and the player's unshared journal entries stay out (M3.10).
  const [pane] = useState(() => isPaneMode(window.location.search));
  const client = useMemo(
    () => new LiveClient({ role: 'player', characterId, viewAs: pane }),
    [characterId, pane],
  );
  useEffect(() => () => client.close(), [client]);
  const live = useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
  const view = live.view;
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
      {!pane && view && <ContestPopup key={live.campaign ?? ''} contests={view.contests} />}
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
          <div className="player-col">
            <Status view={view} client={pane ? null : client} />
            <ProfessionsPanel view={view} client={pane ? null : client} />
            <PartyPanel view={view} />
            <Inventory view={view} client={pane ? null : client} />
          </div>
          <Feed live={live} view={view} client={pane ? null : client} />
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
  // The batch the player opened (by race level): a live change never swaps it
  // for another; if it stops being open (GM override, undo), the panel closes.
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const batch = nextBatch(me.freePointBatches);
  const open =
    openLevel === null
      ? null
      : (me.freePointBatches.find((b) => b.raceLevel === openLevel && b.allocation === null) ??
        null);
  // Set while this screen's own assign is in flight: if the batch closes then,
  // the result decides what to say (success: nothing; refusal: a notice).
  const [confirming, setConfirming] = useState<number | null>(null);
  // Bumped to move focus back to [Assign] once the panel has closed.
  const [focusAssign, setFocusAssign] = useState(0);
  if (openLevel !== null && open === null) {
    if (confirming !== openLevel) {
      setNotice(
        `The race level ${openLevel} points were changed by the GM; your draft was discarded.`,
      );
    }
    setOpenLevel(null);
    setFocusAssign(focusAssign + 1);
  }
  const locked = assignedBatches(me.freePointBatches);
  const assignButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // Runs once per close; if [Assign] is gone (nothing left), focus stays put.
    if (focusAssign > 0) assignButton.current?.focus();
  }, [focusAssign]);
  const close = () => {
    setOpenLevel(null);
    setFocusAssign((n) => n + 1);
  };
  const openNow = useRef<number | null>(null);
  useEffect(() => {
    openNow.current = openLevel;
  });
  /** The result of this screen's own assign, even after the panel closed. */
  const settled = (level: number, ok: boolean) => {
    setConfirming(null);
    // Still open: the panel shows its own error.
    if (!ok && openNow.current !== level)
      setNotice(
        `The race level ${level} points were changed by the GM; your choice was not saved.`,
      );
  };
  // M3.5: the skill whose detail is open, by official name. If it stops
  // existing (merged, transformed by an evolution, undone), the detail closes.
  const [skillOpen, setSkillOpen] = useState<string | null>(null);
  const [skillNotice, setSkillNotice] = useState<string | null>(null);
  const detail = skillOpen === null ? null : (me.skills.find((s) => s.name === skillOpen) ?? null);
  if (skillOpen !== null && detail === null) {
    setSkillNotice(`[${skillOpen}] changed, so its details were closed.`);
    setSkillOpen(null);
  }
  const statusSection = useRef<HTMLElement | null>(null);
  const statusHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (skillNotice === null) return;
    // The dialog unmounted without closing itself: put focus somewhere sane,
    // and let the notice fade after a while.
    if (document.activeElement === document.body) statusHeading.current?.focus();
    const timer = setTimeout(() => setSkillNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [skillNotice]);
  const openSkill = (name: string) => {
    setSkillNotice(null);
    setSkillOpen(name);
  };
  const closeSkill = () => {
    const name = skillOpen;
    setSkillOpen(null);
    // Back to the skill that opened the detail (a modal dialog restores focus
    // itself in most browsers; this covers the rest and a renamed opener).
    requestAnimationFrame(() => {
      const opener = [
        ...(statusSection.current?.querySelectorAll<HTMLButtonElement>('button[data-skill]') ?? []),
      ].find((b) => b.dataset['skill'] === name);
      opener?.focus();
    });
  };
  // M3.6: the selection menu the player opened (level + offer). A live change
  // never swaps it: if the GM re-offers, chooses or undoes it, it closes with
  // a notice (unless this screen's own choice closed it).
  const pending = pendingSelections(me.selections);
  // The evolution dialog (M3.13) is open on one release; a settled, withdrawn
  // or replaced release closes it with a notice (unless this screen chose).
  const [evoOpen, setEvoOpen] = useState<string | null>(null);
  const [evoConfirming, setEvoConfirming] = useState(false);
  const [evoNotice, setEvoNotice] = useState<string | null>(null);
  const [evoFocus, setEvoFocus] = useState(0);
  const evolveButton = useRef<HTMLButtonElement | null>(null);
  if (evoOpen !== null && me.evolution?.releaseId !== evoOpen) {
    setEvoOpen(null);
    if (!evoConfirming)
      setEvoNotice(
        me.evolution === null
          ? 'Your evolution was settled or withdrawn by the GM.'
          : 'The GM changed your evolution; open it again to see the new paths.',
      );
    setEvoConfirming(false);
    setEvoFocus((n) => n + 1);
  }
  useEffect(() => {
    if (evoFocus === 0) return;
    (evolveButton.current ?? statusHeading.current)?.focus();
  }, [evoFocus]);
  const [selOpen, setSelOpen] = useState<{ level: number; offerId: string } | null>(null);
  const [selConfirming, setSelConfirming] = useState<number | null>(null);
  const [selNotice, setSelNotice] = useState<string | null>(null);
  const [selFocus, setSelFocus] = useState<{ n: number; skill: string | null }>({
    n: 0,
    skill: null,
  });
  const selection =
    selOpen === null
      ? null
      : (pending.find((s) => s.level === selOpen.level && s.offerId === selOpen.offerId) ?? null);
  if (selOpen !== null) {
    const why = closedReason(pending, selOpen.level, selOpen.offerId);
    if (why !== null && selConfirming !== selOpen.level) {
      setSelNotice(
        why === 'changed'
          ? `The GM changed the level ${selOpen.level} skill menu; open it again to see the new options.`
          : `The level ${selOpen.level} skill selection was settled by the GM.`,
      );
      setSelOpen(null);
      setSelFocus((f) => ({ n: f.n + 1, skill: null }));
    }
  }
  // After this screen's own choice, until the sheet shows it chosen (the
  // result can land before the new view): [Choose] stays hidden and focus
  // waits for the new skill.
  const [justChose, setJustChose] = useState<{ level: number; skill: string } | null>(null);
  const settling = justChose !== null && pending.some((s) => s.level === justChose.level);
  if (justChose !== null && !settling) setJustChose(null);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selFocus.n === 0 || settling) return;
    requestAnimationFrame(() => {
      // After a choice, land on the new skill; otherwise on [Choose] if still
      // there, else the Status heading.
      const skill =
        selFocus.skill === null
          ? undefined
          : [
              ...(statusSection.current?.querySelectorAll<HTMLButtonElement>(
                'button[data-skill]',
              ) ?? []),
            ].find((b) => b.dataset['skill'] === selFocus.skill);
      (skill ?? chooseButton.current ?? statusHeading.current)?.focus();
    });
  }, [selFocus, settling]);
  useEffect(() => {
    // The "may already be saved" warning stays until the next [Choose].
    if (selNotice === null || selNotice.startsWith('Connection lost')) return;
    const timer = setTimeout(() => setSelNotice(null), 10_000);
    return () => clearTimeout(timer);
  }, [selNotice]);
  const selOpenNow = useRef<number | null>(null);
  useEffect(() => {
    selOpenNow.current = selOpen?.level ?? null;
  });
  const selSettled = (level: number, ok: boolean, skill: string, error: string | undefined) => {
    setSelConfirming(null);
    if (ok) {
      setSelOpen(null);
      setJustChose({ level, skill });
      setSelFocus((f) => ({ n: f.n + 1, skill }));
    } else if (selOpenNow.current !== level) {
      // The dialog was closed during the confirm. If the GM changed the menu
      // meanwhile, the render-time check above replaces this with that reason.
      setSelNotice(settleNotice(level, error));
    }
  };
  return (
    <section
      ref={statusSection}
      className={`window status-window${metal}`}
      aria-labelledby="status"
      data-testid="status"
    >
      <h2 id="status" tabIndex={-1} ref={statusHeading}>
        Status
      </h2>
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
        {view.hunger && (
          // M7.4: the campaign's hunger tracker, while it is on and not outgrown.
          <>
            <dt>Hunger</dt>
            <Live
              testId="hunger"
              value={`${view.hunger.step} (${view.hunger.level + 1}/${view.hunger.steps})`}
            />
          </>
        )}
      </dl>
      <h3>Stats</h3>
      <ul className="stats">
        {rules.stats.list.map((s) => {
          // M3.7 (D81): the effective value, with what gear adds beside it.
          const base = me.stats[s.id] ?? 0;
          const value = me.effectiveStats[s.id] ?? base;
          const withItems = me.itemStats[s.id] ?? value;
          const delta = value - base;
          // M6.A: titles apply after items (DESIGN §4), so split what each adds.
          const itemDelta = withItems - base;
          const titleDelta = value - withItems;
          // MQ.14 (DESIGN §4): gear adds at most a share of the base; say so when it hits it.
          const capped = me.itemCappedStats.includes(s.id);
          const signed = (n: number) =>
            `${n > 0 ? '+' : n < 0 ? '−' : '+'}${formatStatValue(rules, Math.abs(n))}`;
          const split = titleDelta !== 0 && (itemDelta !== 0 || capped);
          return (
            <li key={s.id} data-testid={`stat-${s.id}`}>
              <span>{s.name}</span> <LiveStrong value={formatStatValue(rules, value)} />
              {(delta !== 0 || capped || titleDelta !== 0) && (
                <span
                  className="muted stat-bonus"
                  data-testid={`bonus-${s.id}`}
                  title={
                    capped
                      ? 'Item bonus capped: gear can add only a set share of this stat’s base'
                      : undefined
                  }
                >
                  {' ('}
                  {split ? (
                    <>
                      items {signed(itemDelta)}
                      {capped && <span data-testid={`capped-${s.id}`}>, capped</span>}
                      {`; titles ${signed(titleDelta)}`}
                    </>
                  ) : titleDelta !== 0 ? (
                    `titles ${signed(titleDelta)}`
                  ) : (
                    <>
                      {signed(delta)}
                      {capped && <span data-testid={`capped-${s.id}`}>, capped</span>}
                    </>
                  )}
                  {')'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <dl className="rows">
        <dt>Free points</dt>
        <Live testId="free-points" value={String(free)}>
          {client && batch && openLevel === null && (
            <button
              type="button"
              className="assign-btn"
              ref={assignButton}
              onClick={() => {
                setNotice(null);
                setOpenLevel(batch.raceLevel);
              }}
            >
              [Assign]
            </button>
          )}
        </Live>
        {me.titles.length > 0 && (
          <>
            <dt>Titles</dt>
            <dd data-testid="titles">
              <ul className="title-list">
                {me.titles.map((t) => {
                  const d = me.titleDetails.find((x) => titleKey(x.name) === titleKey(t));
                  const bonus = d
                    ? describeTitleBonuses(d.bonuses, rules.stats.list, rules.stats)
                    : '';
                  return (
                    <li key={t} data-testid="title">
                      <span className="skill-name">[{d?.name ?? t}]</span>
                      {bonus !== '' && (
                        <span className="title-bonus" data-testid="title-bonus">
                          {' '}
                          {bonus}
                        </span>
                      )}
                      {d && d.text.trim() !== '' && (
                        <span className="muted title-text" data-testid="title-text">
                          {d.text}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </>
        )}
      </dl>
      {pending.length > 0 && (
        <p className="selection-pending" data-testid="selection-pending">
          <span className="selection-label">Skill selection</span>
          <span className="badge" data-testid="selection-badge">
            {pendingText(pending.length)}
          </span>
          {client && selOpen === null && !settling && (
            <button
              type="button"
              className="assign-btn"
              ref={chooseButton}
              aria-haspopup="dialog"
              onClick={() => {
                const first = pending[0];
                if (!first) return;
                setSelNotice(null);
                setSelOpen({ level: first.level, offerId: first.offerId });
              }}
            >
              [Choose]
            </button>
          )}
        </p>
      )}
      {me.evolution !== null && (
        <p className="selection-pending evolution-pending" data-testid="evolution-pending">
          <span className="selection-label">Evolution</span>
          <span className="badge" data-testid="evolution-badge">
            {me.evolution.toGrade}-grade available
          </span>
          {client && (
            <button
              type="button"
              className="assign-btn"
              ref={evolveButton}
              aria-haspopup="dialog"
              onClick={() => {
                setEvoNotice(null);
                setEvoOpen(me.evolution?.releaseId ?? null);
              }}
            >
              [Evolve]
            </button>
          )}
        </p>
      )}
      {evoNotice && (
        <p className="err" role="alert" data-testid="evolution-notice">
          {evoNotice}
        </p>
      )}
      {client && me.evolution !== null && evoOpen === me.evolution.releaseId && (
        <EvolutionChoice
          key={me.evolution.releaseId}
          evolution={me.evolution}
          view={view}
          client={client}
          onConfirming={() => setEvoConfirming(true)}
          onSettled={(ok) => {
            setEvoConfirming(false);
            if (ok) {
              setEvoOpen(null);
              setEvoFocus((n) => n + 1);
            }
          }}
          onClose={() => {
            setEvoOpen(null);
            setEvoFocus((n) => n + 1);
          }}
        />
      )}
      {selNotice && (
        <p className="err" role="alert" data-testid="selection-notice">
          {selNotice}
        </p>
      )}
      {client && selection && selOpen && (
        <SkillSelection
          key={`${selection.level}-${selection.offerId}`}
          selection={selection}
          more={pending.length - 1}
          view={view}
          client={client}
          onConfirming={() => setSelConfirming(selection.level)}
          onSettled={(ok, skill, error) => selSettled(selection.level, ok, skill, error)}
          onClose={() => {
            setSelOpen(null);
            setSelFocus((f) => ({ n: f.n + 1, skill: null }));
          }}
        />
      )}
      {notice && (
        <p className="err" role="alert" data-testid="assign-notice">
          {notice}
        </p>
      )}
      {client && open && (
        <AssignPoints
          key={open.raceLevel}
          client={client}
          view={view}
          raceLevel={open.raceLevel}
          points={open.points}
          more={me.freePointBatches.filter((b) => b.allocation === null).length - 1}
          onConfirming={() => setConfirming(open.raceLevel)}
          onSettled={(ok) => settled(open.raceLevel, ok)}
          onClose={close}
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
      <SkillList
        title="Class Skills"
        kind="class"
        list={skills('class')}
        rules={rules}
        onOpen={openSkill}
      />
      {skills('profession').length > 0 && (
        <SkillList
          title="Profession Skills"
          kind="profession"
          list={skills('profession')}
          rules={rules}
          onOpen={openSkill}
        />
      )}
      <SkillList
        title="Race Skills"
        kind="race"
        list={skills('race')}
        rules={rules}
        onOpen={openSkill}
      />
      {skillNotice && (
        <p className="muted" role="status" data-testid="skill-notice">
          {skillNotice}
        </p>
      )}
      {detail && (
        <SkillDetail
          key={detail.name}
          skill={detail}
          view={view}
          client={client}
          onClose={closeSkill}
        />
      )}
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
  onConfirming,
  onSettled,
  onClose,
}: {
  client: LiveClient;
  view: PlayerView;
  raceLevel: number;
  points: number;
  more: number;
  onConfirming: () => void;
  /** Called with the outcome; a refusal after the panel closed becomes a notice. */
  onSettled: (ok: boolean) => void;
  onClose: () => void;
}) {
  const rules = view.rules;
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = points - spent(allocation);
  // Keyboard and screen-reader users land on each step (M3.4 review).
  const heading = useRef<HTMLHeadingElement | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const [stepped, setStepped] = useState(false);
  useEffect(() => {
    if (!stepped) heading.current?.focus();
    else if (review) confirmButton.current?.focus();
    else reviewButton.current?.focus();
  }, [review, stepped]);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    onConfirming();
    const result = await client.command({
      type: 'freePoints.assign',
      characterId: view.me.id,
      raceLevel,
      allocation,
    });
    setBusy(false);
    onSettled(result.ok);
    if (result.ok) onClose();
    else if (result.error === 'Connection lost' || result.error === 'Not connected to the System')
      setError(
        'Connection lost. Check your sheet once you are back: the points may already be assigned.',
      );
    else setError(friendlyError(result.error));
  };
  return (
    <section className="assign" aria-labelledby="assign-heading" data-testid="assign">
      <h3 id="assign-heading" tabIndex={-1} ref={heading}>
        Assign free points
      </h3>
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
            <button
              type="button"
              ref={reviewButton}
              disabled={left !== 0}
              onClick={() => {
                setStepped(true);
                setReview(true);
              }}
            >
              Review
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p id="assign-review" data-testid="assign-review">
            Assign {allocationText(rules, allocation)}? Assigned points lock; only the GM can change
            them.
          </p>
          <div className="assign-actions">
            <button
              type="button"
              ref={confirmButton}
              disabled={busy}
              aria-describedby="assign-review"
              onClick={() => void confirm()}
            >
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
  onOpen,
}: {
  title: string;
  kind: SkillKind;
  list: OwnSheet['skills'];
  rules: PlayerView['rules'];
  onOpen: (name: string) => void;
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
              <button
                type="button"
                className="skill-open"
                data-skill={s.name}
                aria-haspopup="dialog"
                onClick={() => onOpen(s.name)}
              >
                <span className="skill-name">
                  [{s.name} ({rarityName(rules, s.rarity)})]
                </span>
                {s.nickname && <span className="nickname"> “{s.nickname}”</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Counts changes to `value` after the first render (React's "adjust state
 * while rendering" pattern, no refs or effects). Used as a key (or an alternating class), it restarts
 * the element so the CSS glow replays on every change (DESIGN §9 "values
 * update live"), including a change back to an earlier value.
 */
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
    // Alternating animation names replay the glow on every change without
    // remounting, so a control inside (e.g. [Assign]) keeps its focus.
    <dd className={changes > 0 ? `flash flash-${changes % 2}` : undefined}>
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

function Feed({
  live,
  view,
  client,
}: {
  live: LiveSnapshot;
  view: PlayerView;
  client: LiveClient | null;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('dings');
  const [query, setQuery] = useState('');
  const rows = filterHistory(live.notifications, filter, query);
  const messages = [...view.messages].reverse();
  return (
    <div className="feeds">
      <QuestLog view={view} />
      <PracticePanel view={view} client={client} />
      <IdentifyPanel view={view} />
      <NotesPanel view={view} client={client} />
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
          <p className="muted">Level-ups and skill upgrades appear here as they happen.</p>
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

/**
 * Contest result pop-up (M7.3, D88): each contest the GM shares while the page
 * is open, oldest first, until the player dismisses it. Contests shared before
 * the page loaded never pop up.
 */
function ContestPopup({ contests }: { contests: PlayerView['contests'] }) {
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set(contests.map((c) => c.id)));
  const fresh = newContests(contests, known);
  const current = fresh[0];
  if (!current) return null;
  const lines = contestLines(current);
  return (
    <div className="contest-layer">
      <section
        className={`contest-popup ${current.won ? 'won' : 'lost'}`}
        role="dialog"
        aria-labelledby={`contest-${current.id}`}
        data-testid="contest-popup"
      >
        <h2 id={`contest-${current.id}`}>Contest</h2>
        <p className="contest-title">{lines.title}</p>
        <p className="muted">{lines.odds}</p>
        <p className="contest-outcome">{lines.result}</p>
        <button type="button" onClick={() => setKnown((k) => new Set(k).add(current.id))}>
          {fresh.length > 1 ? `Next (${fresh.length - 1} more)` : 'OK'}
        </button>
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
  const latest = live.notifications.filter((n) => isDing(n.notification)).at(-1);
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
