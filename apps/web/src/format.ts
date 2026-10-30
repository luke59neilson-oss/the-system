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
    case 'mergeOffer':
      return `*Skill merge offered: [${n.skills[0]}] + [${n.skills[1]}] → [${n.name}] - Accept or decline it in the Skill Merge window*`;
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
      const why = (n.reason ?? '').trim() === '' ? '' : `: ${(n.reason ?? '').trim()}`;
      return `You received ${what ?? 'a gift'} from ${n.from ?? 'the GM'}${why}`;
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
    case 'itemsTaken': {
      const parts = n.items.map((i) => (i.count > 1 ? `[${i.name}] ×${i.count}` : `[${i.name}]`));
      const what =
        parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
      const why = n.reason.trim() === '' ? '' : `: ${n.reason.trim()}`;
      return `The GM took ${what ?? 'an item'}${why}`;
    }
    case 'gmChange':
      return gmChangeText(n);
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

type GmChange = Extract<LiveNotification, { kind: 'gmChange' }>;

/** "Strength 1.0 → 1.4, Agility 1.0 → 1.1" */
function diffText(n: GmChange): string {
  return (n.diffs ?? []).map((d) => `${d.label} ${d.from} → ${d.to}`).join(', ');
}

/** MU.2: the player log line for a GM change to the character (DESIGN §7). */
export function gmChangeText(n: GmChange): string {
  const s = n.subject ?? '';
  const d = n.detail ?? '';
  const diffs = diffText(n);
  const with_ = (text: string) => (diffs === '' ? text : `${text}: ${diffs}`);
  switch (n.change) {
    case 'renamed':
      return with_('The System has renamed you');
    case 'portrait':
      return 'The GM changed your portrait';
    case 'stats':
      return with_('The GM set your stats');
    case 'pools':
      return with_('The GM set your pools');
    case 'progression':
      return with_('The GM set your progression');
    case 'xp':
      return `+${d} ${s === 'profession' ? 'profession' : 'class'} XP`;
    case 'freePoints':
      return with_(`The GM set your race level ${d} free points`);
    case 'professionWithdrawn':
      return `Profession offer withdrawn: [${s}]`;
    case 'titleEdited':
      return `Title updated: [${s}]`;
    case 'equipped':
      return s === '' ? 'The GM equipped an item' : `The GM equipped [${s}]`;
    case 'unequipped':
      return s === '' ? 'The GM unequipped an item' : `The GM unequipped [${s}]`;
    case 'skillGranted':
      return `*Skill acquired: [${s} (${d})]*`;
    case 'skillRarity':
      return with_(`Skill [${s}] re-rated`);
    case 'skillUnique':
      return d === 'on' ? `Skill [${s}] is now Unique` : `Skill [${s}] is no longer Unique`;
    case 'skillText':
      return `Skill description updated: [${s}]`;
    case 'skillNickname':
      return d === '' ? `Nickname cleared: [${s}]` : `Nickname set: [${s}] "${d}"`;
    case 'skillMark':
      return d === '' ? `Mastery mark earned: [${s}]` : `Mastery mark earned: [${s}] (${d} marks)`;
    case 'mergeDeclined':
      return s === '' ? 'Skill merge declined' : `Skill merge declined: [${s}]`;
    case 'selectionOffered':
      return `*Skill selection available (level ${d}) - Choose in the Skill Selection window*`;
    case 'selectionWithdrawn':
      return `Skill option withdrawn: [${s}]`;
    case 'selectionChosen':
      return `Skill selected for you (level ${d}): [${s}]`;
    case 'evolutionReleased':
      return '*Evolution available - Choose your path in the Evolution window*';
    case 'evolutionChosen':
      return s === '' ? 'Evolution chosen' : `*Evolution complete: [${s}] (${d}-grade)*`;
    case 'questNew':
      return `New quest: ${s}`;
    case 'questUpdated':
      return `Quest updated: ${s}`;
    case 'questStatus':
      return `Quest ${d}: ${s}`;
  }
}

/** Drops the engine's event-id prefix from a rejection so the GM reads only the reason. */
export function friendlyError(error: string): string {
  return error
    .replace(/^Event \S+ \([^)]*\): /, '')
    .replace(/^Event \S+: bad \S+ payload: /, '')
    .replace(/^(\w)/, (c) => c.toUpperCase());
}
