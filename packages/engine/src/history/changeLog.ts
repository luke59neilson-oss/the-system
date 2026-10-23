import type { Campaign } from '../events/log';
import { applyEvent, type CampaignState } from '../events/reducer';
import { describeEvent } from '../report/sessionLog';

/** One row of the GM's change log (M4.8): an event and what it did, in words. */
export interface ChangeLogRow {
  /** Index of the event in the campaign log. */
  readonly seq: number;
  readonly id: string;
  readonly type: string;
  /** ISO-8601 UTC. */
  readonly at: string;
  readonly actor: 'gm' | 'player' | 'system';
  /** Plain-text lines (the session log's wording); the event type when it has none. */
  readonly lines: readonly string[];
  /** Id of the `event.undone` that undid it, if any. */
  readonly undoneBy: string | null;
}

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/**
 * Every event but undo markers, oldest first, in the session log's words
 * (M4.8). An undone event is described against the state it was applied to
 * then, without counting it. GM-only: rows carry GM notes and schedules.
 */
export function changeLog(campaign: Campaign): ChangeLogRow[] {
  const rows: ChangeLogRow[] = [];
  let state: CampaignState | null = null;
  campaign.events.forEach((event, seq) => {
    if (event.type === 'event.undone') return;
    const undone = has(campaign.undone, event.id);
    let lines: string[] = [];
    try {
      const after = applyEvent(state, event);
      lines = describeEvent(state, after, event).map((e) => e.text);
      if (!undone) state = after;
    } catch {
      // An undone event may no longer apply where it stood; its type still names it.
    }
    rows.push({
      seq,
      id: event.id,
      type: event.type,
      at: event.timestamp,
      actor: event.actor.role,
      lines: lines.length ? lines : [event.type],
      undoneBy: undone ? (campaign.undone[event.id] as string) : null,
    });
  });
  return rows;
}
