import {
  EVENT_SCHEMA_VERSIONS,
  EVENT_UPCASTERS,
  EventRejectedError,
  checkEventAuthority,
  parseEvent,
  type DomainEvent,
  type EventUpcasters,
} from './envelope';
import { CAMPAIGN_STATE_SCHEMA_VERSION, applyEvent, type CampaignState } from './reducer';
import { RULES_CONFIG_VERSION } from '../rules';
import { awardXp, shareXp } from '../progression';

/**
 * An event log and the state it folds to. Undo is a compensating
 * `event.undone` event: its target stops counting, and state is the fold of
 * every event that still counts ("as if it never happened").
 */
export interface Campaign {
  /** Every accepted event in order, undo events included (append-only). */
  readonly events: readonly DomainEvent[];
  /** null only for an empty log. */
  readonly state: CampaignState | null;
  /** Undone event id → id of the undo event that undid it. */
  readonly undone: Readonly<Record<string, string>>;
}

export const emptyCampaign = (): Campaign => ({ events: [], state: null, undone: {} });

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Events that still count, in log order. */
function effectiveEvents(events: readonly DomainEvent[], undone: Readonly<Record<string, string>>) {
  return events.filter((e) => e.type !== 'event.undone' && !has(undone, e.id));
}

function fold(events: readonly DomainEvent[]): CampaignState | null {
  let state: CampaignState | null = null;
  for (const event of events) state = applyEvent(state, event);
  return state;
}

/**
 * QF.40: folds `events`, counting per character the XP that the `xp.awarded`
 * events in `later` lose to level caps (DESIGN §2: XP nothing can use is lost).
 */
function foldCountingLoss(
  events: readonly DomainEvent[],
  later: ReadonlySet<string>,
): { state: CampaignState | null; lost: Map<string, number> } {
  let state: CampaignState | null = null;
  const lost = new Map<string, number>();
  for (const event of events) {
    if (event.type === 'xp.awarded' && state !== null && later.has(event.id)) {
      const { track, shares, enemyLevel, enemyGrade } = event.payload;
      for (const { characterId, share, raceLevel } of shares) {
        const character = Object.hasOwn(state.characters, characterId)
          ? state.characters[characterId]
          : undefined;
        if (!character) continue;
        try {
          const gained = shareXp(state.rules, character, share, enemyLevel, enemyGrade, raceLevel);
          const r = awardXp(state.rules, character, track, gained).lost;
          if (r > 0) lost.set(characterId, (lost.get(characterId) ?? 0) + r);
        } catch {
          // applyEvent below reports a share that no longer applies.
        }
      }
    }
    state = applyEvent(state, event);
  }
  return { state, lost };
}

/**
 * QF.40 (D31): a non-latest undo is refused when later XP awards would lose
 * more XP to level caps than they do now (an undone evolution or level set
 * puts the cap back), naming the levels the character would drop to.
 */
function checkNoXpLoss(
  campaign: Campaign,
  target: DomainEvent,
  after: { state: CampaignState | null; lost: Map<string, number> },
): void {
  if (after.lost.size === 0) return;
  const later = laterIds(campaign.events, target.id);
  const before = foldCountingLoss(effectiveEvents(campaign.events, campaign.undone), later);
  const losses: string[] = [];
  for (const [id, n] of after.lost) {
    if (n <= (before.lost.get(id) ?? 0)) continue;
    const was = campaign.state?.characters[id];
    const now = after.state?.characters[id];
    if (!was || !now) continue;
    const drops = [
      `class ${was.classLevel} → ${now.classLevel}`,
      ...(was.professionLevel !== now.professionLevel
        ? [`profession ${was.professionLevel} → ${now.professionLevel}`]
        : []),
    ];
    losses.push(
      `${was.name} would lose ${n - (before.lost.get(id) ?? 0)} XP (${drops.join(', ')})`,
    );
  }
  if (losses.length > 0) {
    throw new EventRejectedError(
      `Cannot undo ${target.id} (${target.type}): later XP awards would be lost at the old level cap: ${losses.join('; ')}. Undo those awards first, or set levels with an override`,
    );
  }
}

function laterIds(events: readonly DomainEvent[], id: string): Set<string> {
  const out = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as DomainEvent;
    if (e.id === id) break;
    out.add(e.id);
  }
  return out;
}

/** Latest-first lookup: undo targets are usually recent. */
function findEvent(events: readonly DomainEvent[], id: string): DomainEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]?.id === id) return events[i];
  return undefined;
}

/**
 * M11.3: an id → position index shared by an events array and every array
 * appended from it, so the duplicate-id check is O(1) instead of a scan of
 * the whole log on every command. Branches (an append whose result is
 * dropped, then another from the same base) share the index, so a hit is
 * only trusted when the array really holds that id at that position; a hit
 * that does not match falls back to the scan. An id with no entry was never
 * appended to this lineage, so it cannot be in the array.
 */
const ID_INDEX = new WeakMap<readonly DomainEvent[], Map<string, number>>();

function idIndex(events: readonly DomainEvent[]): Map<string, number> {
  let index = ID_INDEX.get(events);
  if (!index) {
    index = new Map();
    events.forEach((e, i) => index?.set(e.id, i));
    ID_INDEX.set(events, index);
  }
  return index;
}

function hasEventId(events: readonly DomainEvent[], id: string): boolean {
  const at = idIndex(events).get(id);
  if (at === undefined) return false;
  if (at < events.length && events[at]?.id === id) return true;
  return events.some((e) => e.id === id);
}

/** A new array with `event` appended; it inherits the id index. */
function extend(events: readonly DomainEvent[], event: DomainEvent): readonly DomainEvent[] {
  const index = idIndex(events);
  const next = [...events, event];
  index.set(event.id, events.length);
  ID_INDEX.set(next, index);
  return next;
}

/** Checks that an undo may target its event given the log so far (not the fold). */
function checkUndoTarget(
  campaign: Campaign,
  undo: DomainEvent & { type: 'event.undone' },
): DomainEvent {
  const targetId = undo.payload.eventId;
  const target = findEvent(campaign.events, targetId);
  const reject = (reason: string): never => {
    throw new EventRejectedError(`Event ${undo.id} (event.undone): ${reason}`);
  };
  if (!target) return reject(`no earlier event "${targetId}"`);
  if (target.type === 'event.undone') return reject('an undo cannot be undone');
  if (target.type === 'campaign.created') return reject('campaign creation cannot be undone');
  // MR.3: a rules migration would re-run on the next load, so it stays.
  if (target.type === 'rules.migrated') return reject('a rules migration cannot be undone');
  if (has(campaign.undone, targetId)) return reject(`event "${targetId}" is already undone`);
  return target;
}

/**
 * Appends one parsed event. Throws EventRejectedError (and leaves the
 * campaign untouched) when the event does not apply. Undoing a non-latest
 * event is rejected when any later event would no longer apply.
 */
export function appendEvent(campaign: Campaign, event: DomainEvent): Campaign {
  if (hasEventId(campaign.events, event.id)) {
    throw new EventRejectedError(`Event ${event.id}: duplicate event id`);
  }
  checkEventAuthority(event);
  if (event.type !== 'event.undone') {
    return {
      ...campaign,
      events: extend(campaign.events, event),
      state: applyEvent(campaign.state, event),
    };
  }
  const target = checkUndoTarget(campaign, event);
  const undone = { ...campaign.undone, [target.id]: event.id };
  let state: CampaignState | null;
  let after: ReturnType<typeof foldCountingLoss> | null = null;
  try {
    const later = laterIds(campaign.events, target.id);
    if (campaign.events.some((e) => e.type === 'xp.awarded' && later.has(e.id))) {
      after = foldCountingLoss(effectiveEvents(campaign.events, undone), later);
      state = after.state;
    } else {
      state = fold(effectiveEvents(campaign.events, undone));
    }
  } catch (error) {
    if (!(error instanceof EventRejectedError)) throw error;
    throw new EventRejectedError(
      `Event ${event.id} (event.undone): cannot undo ${target.id} (${target.type}) because a later event depends on it: ${error.message}`,
    );
  }
  if (after !== null) checkNoXpLoss(campaign, target, after);
  return { events: extend(campaign.events, event), state, undone };
}

/**
 * Log-level upcast for changes a payload upcaster cannot express: renaming a
 * type, splitting one stored event into several, or changing the envelope.
 * Runs on a copy of each raw stored event before parsing, on every replay.
 * Contract (enforced): it returns at least one event, and the first keeps the
 * original id so undo targets still resolve. It must be idempotent, leaving
 * events already in the new shape unchanged.
 */
export type RawEventUpcaster = (raw: unknown) => unknown[];

export const RAW_EVENT_UPCASTERS: readonly RawEventUpcaster[] = [];

export interface ReplayOptions {
  rawUpcasters?: readonly RawEventUpcaster[];
  upcasters?: EventUpcasters;
  versions?: Readonly<Record<string, number>>;
}

/** Parses, upcasts and checks stored events (ids, authority, undo targets) without folding. */
function parseLog(
  rawEvents: readonly unknown[],
  options: ReplayOptions,
): { events: DomainEvent[]; undone: Record<string, string> } {
  const upcasters = options.upcasters ?? EVENT_UPCASTERS;
  const versions = options.versions ?? EVENT_SCHEMA_VERSIONS;
  const events: DomainEvent[] = [];
  const ids = new Set<string>();
  let undone: Record<string, string> = {};
  let raws: readonly unknown[] = rawEvents;
  for (const upcast of options.rawUpcasters ?? RAW_EVENT_UPCASTERS) {
    raws = raws.flatMap((raw) => {
      const id = (raw as { id?: unknown } | null)?.id;
      const out = upcast(JSON.parse(JSON.stringify(raw ?? null)) as unknown);
      if (out.length === 0)
        throw new EventRejectedError(`Event ${String(id)}: a log upcaster dropped it`);
      if ((out[0] as { id?: unknown } | null)?.id !== id) {
        throw new EventRejectedError(
          `Event ${String(id)}: a log upcaster must keep the original id on the first event`,
        );
      }
      return out;
    });
  }
  for (const raw of raws) {
    const event = parseEvent(raw, upcasters, versions);
    if (ids.has(event.id)) throw new EventRejectedError(`Event ${event.id}: duplicate event id`);
    checkEventAuthority(event);
    if (event.type === 'event.undone') {
      const target = checkUndoTarget({ events, state: null, undone }, event);
      undone = { ...undone, [target.id]: event.id };
    }
    ids.add(event.id);
    events.push(event);
  }
  return { events, undone };
}

/**
 * Rebuilds a campaign from stored events (oldest first), upcasting old
 * versions. Equal to appending the same events one by one, in O(n): every
 * undo is checked against the log, then the events that still count are
 * folded once. Throws EventRejectedError naming the first bad event.
 */
export function replay(rawEvents: readonly unknown[], options: ReplayOptions = {}): Campaign {
  const { events, undone } = parseLog(rawEvents, options);
  return { events, state: fold(effectiveEvents(events, undone)), undone };
}

/** Bumped when the snapshot format changes; older snapshots are ignored (full replay). */
/** v2: records the rules config version (M1.A). */
export const SNAPSHOT_FORMAT_VERSION = 2;

/**
 * A cached fold of the first `eventCount` events (after log upcasting). Only a
 * speed-up: a snapshot that does not match the log, the state schema or the
 * event schema versions is ignored and the log is replayed in full.
 */
export interface Snapshot {
  readonly format: number;
  readonly stateSchemaVersion: number;
  /** Event schema versions the snapshot was folded with. */
  readonly eventVersions: Readonly<Record<string, number>>;
  /** Number of log-level upcasters in force when it was folded (a new one invalidates it). */
  readonly rawUpcasters: number;
  /**
   * Rules config version the state's rules were migrated to: a new rules
   * migration (D23) changes `state.rules` without any event schema bump.
   */
  readonly rulesConfigVersion: number;
  readonly eventCount: number;
  readonly lastEventId: string | null;
  readonly state: CampaignState | null;
  readonly undone: Readonly<Record<string, string>>;
}

/** Snapshot of a campaign, recording the schema and upcasters it was folded under. */
export function snapshotOf(campaign: Campaign, options: ReplayOptions = {}): Snapshot {
  return JSON.parse(
    JSON.stringify({
      format: SNAPSHOT_FORMAT_VERSION,
      stateSchemaVersion: campaign.state?.schemaVersion ?? CAMPAIGN_STATE_SCHEMA_VERSION,
      eventVersions: options.versions ?? EVENT_SCHEMA_VERSIONS,
      rawUpcasters: (options.rawUpcasters ?? RAW_EVENT_UPCASTERS).length,
      rulesConfigVersion: RULES_CONFIG_VERSION,
      eventCount: campaign.events.length,
      lastEventId: campaign.events[campaign.events.length - 1]?.id ?? null,
      state: campaign.state,
      undone: campaign.undone,
    }),
  ) as Snapshot;
}

const sameRecord = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => has(b, k) && a[k] === b[k]);
};

/** Why a snapshot cannot be used for these events, or null when it can. */
function snapshotMismatch(
  snapshot: Snapshot,
  events: readonly DomainEvent[],
  undone: Readonly<Record<string, string>>,
  versions: Readonly<Record<string, number>>,
  rawUpcasters: number,
): string | null {
  if (typeof snapshot !== 'object' || snapshot === null) return 'shape';
  if (snapshot.rawUpcasters !== rawUpcasters) return 'log upcasters';
  if (typeof snapshot.eventVersions !== 'object' || snapshot.eventVersions === null) return 'shape';
  if (typeof snapshot.undone !== 'object' || snapshot.undone === null) return 'shape';
  if (snapshot.format !== SNAPSHOT_FORMAT_VERSION) return 'format';
  if (snapshot.rulesConfigVersion !== RULES_CONFIG_VERSION) return 'rules config version';
  if (snapshot.stateSchemaVersion !== CAMPAIGN_STATE_SCHEMA_VERSION) return 'state schema';
  if (snapshot.state !== null && snapshot.state.schemaVersion !== CAMPAIGN_STATE_SCHEMA_VERSION)
    return 'state schema';
  if (!sameRecord(snapshot.eventVersions, versions)) return 'event versions';
  const count = snapshot.eventCount;
  if (!Number.isInteger(count) || count < 0 || count > events.length) return 'event count';
  const last = count === 0 ? null : (events[count - 1]?.id ?? null);
  if (last !== snapshot.lastEventId) return 'last event id';
  if ((count === 0) !== (snapshot.state === null)) return 'state';
  // The undo map over the prefix must be what the snapshot folded.
  const prefixIds = new Set(events.slice(0, count).map((e) => e.id));
  const expected: Record<string, string> = {};
  for (const [target, by] of Object.entries(undone)) if (prefixIds.has(by)) expected[target] = by;
  if (!sameRecord(expected, snapshot.undone)) return 'undo map';
  return null;
}

/**
 * Loads a campaign from stored events, starting from a snapshot when it
 * matches (the remaining events are appended with full checks), otherwise by
 * full replay. Every event is still parsed and checked for ids, authority and
 * undo targets. `usedSnapshot` says which path ran.
 */
export function resume(
  snapshot: Snapshot | null,
  rawEvents: readonly unknown[],
  options: ReplayOptions = {},
): { campaign: Campaign; usedSnapshot: boolean } {
  const versions = options.versions ?? EVENT_SCHEMA_VERSIONS;
  const rawCount = (options.rawUpcasters ?? RAW_EVENT_UPCASTERS).length;
  const { events, undone } = parseLog(rawEvents, options);
  const full = () => ({
    campaign: { events, state: fold(effectiveEvents(events, undone)), undone },
    usedSnapshot: false,
  });
  if (snapshot === null) return full();
  try {
    if (snapshotMismatch(snapshot, events, undone, versions, rawCount) !== null) return full();
  } catch {
    return full(); // A malformed snapshot is only a lost speed-up.
  }
  let campaign: Campaign = {
    events: events.slice(0, snapshot.eventCount),
    state: snapshot.state,
    undone: { ...snapshot.undone },
  };
  try {
    for (const event of events.slice(snapshot.eventCount)) campaign = appendEvent(campaign, event);
  } catch {
    // A tail append can refuse what a full fold accepts (an event later undone
    // in a hand-edited log), or trip on a malformed snapshot body: replay decides.
    return full();
  }
  return { campaign, usedSnapshot: true };
}

/** Parses a JSONL event log (one event per line; blank lines ignored). */
export function parseEventLines(text: string): unknown[] {
  const out: unknown[] = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      out.push(JSON.parse(line));
    } catch {
      throw new EventRejectedError(`Line ${index + 1}: not valid JSON`);
    }
  });
  return out;
}
