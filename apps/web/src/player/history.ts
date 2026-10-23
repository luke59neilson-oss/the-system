import { notificationText } from '../format';
import type { LiveNotification, SeqNotification } from '../live';

/**
 * Notification history helpers (ROADMAP M3.3): filters, search, the DING
 * queue and the sound preference. Pure apart from the storage accessors,
 * which never throw.
 */

export type HistoryFilter =
  'dings' | 'all' | 'class' | 'profession' | 'race' | 'freePoints' | 'broadcast' | 'items';

export const HISTORY_FILTERS: readonly { id: HistoryFilter; label: string }[] = [
  { id: 'dings', label: 'Level-ups' },
  { id: 'all', label: 'Everything' },
  { id: 'class', label: 'Class' },
  { id: 'profession', label: 'Profession' },
  { id: 'race', label: 'Race' },
  { id: 'freePoints', label: 'Free points' },
  { id: 'broadcast', label: 'System messages' },
  { id: 'items', label: 'Gifts and trades' },
];

export function matchesFilter(n: LiveNotification, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'dings':
      return n.kind === 'level' || n.kind === 'profession';
    case 'profession':
      return n.kind === 'profession' || (n.kind === 'level' && n.track === filter);
    case 'class':
    case 'race':
      return n.kind === 'level' && n.track === filter;
    case 'freePoints':
      return n.kind === 'freePoints';
    case 'broadcast':
      return n.kind === 'broadcast' || n.kind === 'hiddenQuest';
    case 'items':
      return n.kind === 'gift' || n.kind === 'trade';
  }
}

/** Newest first, narrowed by filter and a case-insensitive text search. */
export function filterHistory(
  items: readonly SeqNotification[],
  filter: HistoryFilter,
  query: string,
): SeqNotification[] {
  const q = query.trim().toLowerCase();
  return items
    .filter((n) => matchesFilter(n.notification, filter))
    .filter((n) => q === '' || searchText(n).includes(q))
    .reverse();
}

/** What a search matches: the book text plus its "Day N" label. */
function searchText(n: SeqNotification): string {
  return `${notificationText(n.notification)} day ${n.day}`.toLowerCase();
}

/** "Day 3 · 14:05" in the browser's time zone. */
export function whenLabel(n: Pick<SeqNotification, 'at' | 'day'>): string {
  const date = new Date(n.at);
  if (Number.isNaN(date.getTime())) return `Day ${n.day}`;
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Day ${n.day} · ${time}`;
}

/** What pops up one at a time as it arrives: DINGs, System messages, gifts and trades. */
export function isQueued(n: LiveNotification): boolean {
  return n.kind !== 'freePoints';
}

/** Identity of a notification that survives a history reset after an undo. */
export function notificationKey(n: SeqNotification): string {
  return `${n.seq}:${JSON.stringify(n.notification)}`;
}

/** The next queued DING not yet shown (keys, not positions: an undo can remove earlier ones). */
export function nextArrival(
  items: readonly SeqNotification[],
  liveSince: number | null,
  shown: ReadonlySet<string>,
): { current: SeqNotification | undefined; waiting: number } {
  const left = arrivals(items, liveSince).filter((n) => !shown.has(notificationKey(n)));
  return { current: left[0], waiting: Math.max(0, left.length - 1) };
}

/** Notifications that arrived while this page was open, oldest first. */
export function arrivals(
  items: readonly SeqNotification[],
  liveSince: number | null,
): SeqNotification[] {
  if (liveSince === null) return [];
  return items.filter((n) => n.seq > liveSince && isQueued(n.notification));
}

export const SOUND_KEY = 'the-system:sound';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Sound is off unless this browser turned it on. Never throws. */
export function readSound(storage: KeyValueStore | null): boolean {
  try {
    return storage?.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSound(storage: KeyValueStore | null, on: boolean): void {
  try {
    storage?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}
