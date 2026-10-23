import type { Campaign } from '../events/log';
import { buildSessionLog } from '../report/sessionLog';

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

/**
 * Every event but undo markers, oldest first, with session-log wording (M4.8).
 * GM-only: it includes GM notes on awards and scheduled broadcasts.
 */
export function changeLog(campaign: Campaign): ChangeLogRow[] {
  const bySeq = new Map<number, string[]>();
  for (const e of buildSessionLog(campaign, 0).entries) {
    const list = bySeq.get(e.seq) ?? [];
    list.push(e.text);
    bySeq.set(e.seq, list);
  }
  const rows: ChangeLogRow[] = [];
  campaign.events.forEach((event, seq) => {
    if (event.type === 'event.undone') return;
    rows.push({
      seq,
      id: event.id,
      type: event.type,
      at: event.timestamp,
      actor: event.actor.role,
      lines: bySeq.get(seq) ?? [event.type],
      undoneBy: Object.prototype.hasOwnProperty.call(campaign.undone, event.id)
        ? (campaign.undone[event.id] as string)
        : null,
    });
  });
  return rows;
}
