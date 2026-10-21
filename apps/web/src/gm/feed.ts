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
  notifications.forEach((n, index) => {
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
