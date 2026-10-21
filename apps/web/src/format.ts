import type { LiveNotification } from './live';

/** Book-style notification text (DESIGN §9). */
export function notificationText(n: LiveNotification): string {
  switch (n.kind) {
    case 'level': {
      const label =
        n.track === 'class' ? 'Class' : n.track === 'profession' ? 'Profession' : 'Race';
      const gained = n.to - n.from;
      const level = gained > 1 ? `levels ${n.from + 1}–${n.to}` : `level ${n.to}`;
      const reached = gained > 1 ? `has gained ${level}` : `has reached ${level}`;
      const extra =
        n.track === 'class'
          ? ' - Stat points allocated'
          : n.track === 'race' && n.freePoints > 0
            ? ` - +${n.freePoints} free points`
            : '';
      return `*'DING!' ${label}: [${n.name}] ${reached}${extra}*`;
    }
    case 'freePoints':
      return n.unassigned > 0
        ? `Free points waiting to be assigned: ${n.unassigned}`
        : 'All free points assigned';
    case 'broadcast':
      return n.text;
  }
}

/** Drops the engine's event-id prefix from a rejection so the GM reads only the reason. */
export function friendlyError(error: string): string {
  return error
    .replace(/^Event \S+ \([^)]*\): /, '')
    .replace(/^Event \S+: bad \S+ payload: /, '')
    .replace(/^(\w)/, (c) => c.toUpperCase());
}
