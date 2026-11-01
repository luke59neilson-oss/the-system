import type { CampaignState } from '@the-system/engine';
import { notificationText } from '../format';
import type { SeqNotification } from '../live';

export interface FeedRow {
  key: string;
  who: string;
  text: string;
}

/** Notifications newest first; one broadcast to several characters is one row. */
export function feedRows(
  notifications: readonly SeqNotification[],
  state: CampaignState,
  limit = 50,
): FeedRow[] {
  const nameOf = (id: string) => state.characters[id]?.name ?? '—';
  const rows: (FeedRow & { ids: string[] })[] = [];
  // QF.55: only the newest `limit` rows are shown, so start at the first entry
  // of the limit-th row from the end (a broadcast row is a run of entries with
  // one seq) instead of building a row for every notification of the campaign.
  const sameRow = (i: number) => {
    const a = notifications[i]!;
    const b = notifications[i - 1]!;
    return (
      a.notification.kind === 'broadcast' && b.notification.kind === 'broadcast' && a.seq === b.seq
    );
  };
  let start = notifications.length;
  for (let groups = 0; start > 0 && groups < limit; groups++) {
    start--;
    while (start > 0 && sameRow(start)) start--;
  }
  notifications.forEach((n, index) => {
    if (index < start) return;
    const note = n.notification;
    const prev = rows[rows.length - 1];
    if (note.kind === 'broadcast' && prev && prev.key.startsWith(`b${n.seq}:`)) {
      prev.ids.push(note.characterId);
      return;
    }
    rows.push({
      key: note.kind === 'broadcast' ? `b${n.seq}:${index}` : `n${n.seq}:${index}`,
      who: nameOf(note.characterId),
      text: notificationText(note),
      ids: [note.characterId],
    });
  });
  const everyone = state.characterOrder.length;
  return rows
    .map(({ ids, ...row }) =>
      ids.length > 1
        ? { ...row, who: ids.length === everyone ? 'Everyone' : ids.map(nameOf).join(', ') }
        : row,
    )
    .reverse()
    .slice(0, limit);
}
