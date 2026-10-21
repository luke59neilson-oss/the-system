import {
  EVENT_SCHEMA_VERSIONS,
  EVENT_UPCASTERS,
  EventRejectedError,
  parseEvent,
  type DomainEvent,
  type EventUpcasters,
} from './envelope';
import { applyEvent, type CampaignState } from './reducer';

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

/** Checks that an undo may target `targetId` given the log so far (not the fold). */
/** Latest-first lookup: undo targets are usually recent. */
function findEvent(events: readonly DomainEvent[], id: string): DomainEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]?.id === id) return events[i];
  return undefined;
}

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
  if (has(campaign.undone, targetId)) return reject(`event "${targetId}" is already undone`);
  return target;
}

/**
 * Appends one parsed event. Throws EventRejectedError (and leaves the
 * campaign untouched) when the event does not apply. Undoing a non-latest
 * event is rejected when any later event would no longer apply.
 */
export function appendEvent(campaign: Campaign, event: DomainEvent): Campaign {
  if (campaign.events.some((e) => e.id === event.id)) {
    throw new EventRejectedError(`Event ${event.id}: duplicate event id`);
  }
  if (event.type !== 'event.undone') {
    return {
      ...campaign,
      events: [...campaign.events, event],
      state: applyEvent(campaign.state, event),
    };
  }
  const target = checkUndoTarget(campaign, event);
  const undone = { ...campaign.undone, [target.id]: event.id };
  let state: CampaignState | null;
  try {
    state = fold(effectiveEvents(campaign.events, undone));
  } catch (error) {
    if (!(error instanceof EventRejectedError)) throw error;
    throw new EventRejectedError(
      `Event ${event.id} (event.undone): cannot undo ${target.id} (${target.type}) because a later event depends on it: ${error.message}`,
    );
  }
  return { events: [...campaign.events, event], state, undone };
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

/**
 * Rebuilds a campaign from stored events (oldest first), upcasting old
 * versions. Equal to appending the same events one by one, in O(n): every
 * undo is checked against the log, then the events that still count are
 * folded once. Throws EventRejectedError naming the first bad event.
 */
export function replay(rawEvents: readonly unknown[], options: ReplayOptions = {}): Campaign {
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
    if (event.type === 'event.undone') {
      const target = checkUndoTarget({ events, state: null, undone }, event);
      undone = { ...undone, [target.id]: event.id };
    }
    ids.add(event.id);
    events.push(event);
  }
  return { events, state: fold(effectiveEvents(events, undone)), undone };
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
