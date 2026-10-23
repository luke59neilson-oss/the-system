import type { LiveNotification } from './live';

/** The System's detail-free hidden-quest notice (MQ.7, DESIGN §7). */
export const HIDDEN_QUEST_NOTICE =
  'Hidden quest detected - A hidden quest exists and can be triggered';

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
    case 'profession':
      return `*'DING!' Profession acquired: [${n.name}] – lvl ${n.level}*`;
    case 'freePoints':
      return n.unassigned > 0
        ? `Free points waiting to be assigned: ${n.unassigned}`
        : 'All free points assigned';
    case 'skillUpgrade':
      return `*'DING!' Skill upgraded: [${n.skill} (${n.from})] → [${n.skill} (${n.to})]*`;
    case 'skillMerge':
      return `*'DING!' Skills merged: [${n.skills[0]}] + [${n.skills[1]}] → [${n.name} (${n.rarity})]*`;
    case 'broadcast':
      return n.text;
    case 'hiddenQuest':
      return `*${HIDDEN_QUEST_NOTICE}*`;
    case 'gift': {
      const parts = n.items.map((i) => (i.count > 1 ? `[${i.name}] ×${i.count}` : `[${i.name}]`));
      if (n.currency > 0) parts.push(`${n.currency} ${n.currencyName}`);
      const what =
        parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
      return `You received ${what ?? 'a gift'} from ${n.from ?? 'the GM'}`;
    }
    case 'title': {
      const text = n.text.trim() === '' ? '' : ` - ${n.text.trim()}`;
      return `*'DING!' Title earned: [${n.title}]${text}*`;
    }
    case 'currency': {
      const why = n.reason.trim() === '' ? '' : `: ${n.reason.trim()}`;
      return n.amount > 0
        ? `You received ${n.amount} ${n.currencyName} from the GM${why}`
        : `Fined ${-n.amount} ${n.currencyName} by the GM${why}`;
    }
    case 'trade': {
      const who = n.other ?? 'The GM';
      switch (n.action) {
        case 'proposed':
          return `${who} offers you a trade`;
        case 'accepted':
          return `${who} accepted your trade`;
        case 'declined':
          return `${who} declined your trade`;
        case 'cancelled':
          return `${who} withdrew a trade offer`;
      }
    }
  }
}

/** Drops the engine's event-id prefix from a rejection so the GM reads only the reason. */
export function friendlyError(error: string): string {
  return error
    .replace(/^Event \S+ \([^)]*\): /, '')
    .replace(/^Event \S+: bad \S+ payload: /, '')
    .replace(/^(\w)/, (c) => c.toUpperCase());
}
