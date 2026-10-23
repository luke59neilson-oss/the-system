import { raceLevel, type Character } from '../character';
import type { DomainEvent } from '../events/envelope';
import type { Campaign } from '../events/log';
import { applyEvent, type CampaignState } from '../events/reducer';
import { hiddenQuestNoticed } from '../quests';

/**
 * System notifications (DESIGN §9 "DING!") and their history back to day 1
 * (ROADMAP M3.3). Pure. Only gains notify: an undo's level loss shows in the
 * next view, never as a "DING". Text is formatted by the client from these
 * facts, so wording stays in one place.
 */
export type SystemNotification =
  | {
      readonly kind: 'level';
      readonly characterId: string;
      readonly track: 'class' | 'profession' | 'race';
      /** Track name as shown in the books: class name, profession name or race. */
      readonly name: string;
      readonly from: number;
      readonly to: number;
      /** Free points granted by this change (race track only). */
      readonly freePoints: number;
    }
  | {
      /** A profession taken (MQ.6): it starts at the class level, not a level-up from 0. */
      readonly kind: 'profession';
      readonly characterId: string;
      readonly name: string;
      readonly level: number;
    }
  | {
      readonly kind: 'freePoints';
      readonly characterId: string;
      readonly unassigned: number;
    }
  | {
      /** A GM System broadcast, one per recipient (a player only ever sees their own). */
      readonly kind: 'broadcast';
      readonly characterId: string;
      readonly text: string;
    }
  | {
      /**
       * A hidden quest now concerns this character (MQ.7): it was created
       * hidden, hidden later, reopened or its notice list grew. No details.
       */
      readonly kind: 'hiddenQuest';
      readonly characterId: string;
    }
  | {
      /** Currency and/or items arrived as a gift (M3.7); only the recipient is told. */
      readonly kind: 'gift';
      readonly characterId: string;
      /** The giver's name, or null for the GM. */
      readonly from: string | null;
      readonly currency: number;
      readonly currencyName: string;
      readonly items: readonly { readonly name: string; readonly count: number }[];
    }
  | {
      /** A trade changed by the other party (M3.7); only the party who did not act is told. */
      readonly kind: 'trade';
      readonly characterId: string;
      readonly action: 'proposed' | 'accepted' | 'declined' | 'cancelled';
      /** The other party's name, or null for the GM. */
      readonly other: string | null;
    };

/** A notification with where it sits in the campaign. */
export interface HistoryItem {
  /** Event count after the causing event (index + 1), as the live hub numbers it. */
  readonly seq: number;
  /** The causing event's timestamp (ISO-8601 UTC). */
  readonly at: string;
  /** In-game day after the event. */
  readonly day: number;
  readonly notification: SystemNotification;
}

const granted = (c: Character) => c.freePointBatches.reduce((a, b) => a + b.points, 0);
const open = (c: Character) =>
  c.freePointBatches.filter((b) => b.allocation === null).reduce((a, b) => a + b.points, 0);

const TRADE_ACTION = {
  'trade.proposed': 'proposed',
  'trade.accepted': 'accepted',
  'trade.declined': 'declined',
  'trade.cancelled': 'cancelled',
} as const;

/** Notifications caused by one event, comparing the states before and after it. */
export function notificationsBetween(
  before: CampaignState | null,
  after: CampaignState | null,
  /** The event that caused the change; broadcasts notify from it. */
  event?: DomainEvent,
): SystemNotification[] {
  if (after === null) return [];
  const out: SystemNotification[] = [];
  if (event?.type === 'system.broadcast') {
    const recipients = event.payload.characterIds ?? after.characterOrder;
    for (const characterId of recipients) {
      out.push({ kind: 'broadcast', characterId, text: event.payload.text });
    }
  }
  if (event?.type === 'campaign.dayAdvanced' && before) {
    // M4.7: scheduled broadcasts sent as the day counter reached their day.
    for (const b of after.broadcasts.slice(before.broadcasts.length)) {
      for (const characterId of b.characterIds ?? after.characterOrder) {
        out.push({ kind: 'broadcast', characterId, text: b.text });
      }
    }
  }
  if (
    event?.type === 'quest.created' ||
    event?.type === 'quest.edited' ||
    event?.type === 'quest.statusSet'
  ) {
    const id = event.payload.questId;
    const was = before && has(before.quests, id) ? before.quests[id] : undefined;
    const now = has(after.quests, id) ? after.quests[id] : undefined;
    const told = was && before ? hiddenQuestNoticed(was, before.characterOrder) : [];
    for (const characterId of now ? hiddenQuestNoticed(now, after.characterOrder) : []) {
      if (!told.includes(characterId)) out.push({ kind: 'hiddenQuest', characterId });
    }
  }
  if (event?.type === 'character.created') {
    // A newcomer is told of every hidden quest meant for everyone (noticeTo null).
    const characterId = event.payload.id;
    for (const id of after.questOrder) {
      const q = has(after.quests, id) ? after.quests[id] : undefined;
      if (q && hiddenQuestNoticed(q, after.characterOrder).includes(characterId)) {
        out.push({ kind: 'hiddenQuest', characterId });
      }
    }
  }
  if (event?.type === 'gift.given' && event.payload.to !== null) {
    const { characterId: giver, to, bundle } = event.payload;
    out.push({
      kind: 'gift',
      characterId: to,
      from: giver === null ? null : (after.characters[giver]?.name ?? giver),
      currency: bundle.currency,
      currencyName: after.rules.economy.currencyName,
      items: Object.entries(bundle.items).map(([itemId, count]) => ({
        name: after.items[itemId]?.name ?? itemId,
        count,
      })),
    });
  }
  if (
    event?.type === 'trade.proposed' ||
    event?.type === 'trade.accepted' ||
    event?.type === 'trade.declined' ||
    event?.type === 'trade.cancelled'
  ) {
    const trade = has(after.trades, event.payload.tradeId)
      ? after.trades[event.payload.tradeId]
      : undefined;
    if (trade) {
      // The proposer acts on proposed/cancelled; the counterparty on accept/decline.
      const proposerActs = event.type === 'trade.proposed' || event.type === 'trade.cancelled';
      const told = proposerActs ? trade.to : trade.from;
      const actor = proposerActs ? trade.from : trade.to;
      if (told !== null) {
        out.push({
          kind: 'trade',
          characterId: told,
          action: TRADE_ACTION[event.type],
          other: actor === null ? null : (after.characters[actor]?.name ?? actor),
        });
      }
    }
  }
  for (const id of after.characterOrder) {
    const now = after.characters[id];
    const was = before?.characters[id];
    if (!now || !was) continue;
    if (now.classLevel > was.classLevel) {
      out.push({
        kind: 'level',
        characterId: id,
        track: 'class',
        name: now.className,
        from: was.classLevel,
        to: now.classLevel,
        freePoints: 0,
      });
    }
    if (now.profession !== null && was.profession === null) {
      out.push({
        kind: 'profession',
        characterId: id,
        name: now.profession,
        level: now.professionLevel,
      });
    } else if (now.profession !== null && now.professionLevel > was.professionLevel) {
      out.push({
        kind: 'level',
        characterId: id,
        track: 'profession',
        name: now.profession,
        from: was.professionLevel,
        to: now.professionLevel,
        freePoints: 0,
      });
    }
    const raceBefore = raceLevel(before?.rules ?? after.rules, was);
    const raceAfter = raceLevel(after.rules, now);
    if (raceAfter > raceBefore) {
      out.push({
        kind: 'level',
        characterId: id,
        track: 'race',
        name: now.race,
        from: raceBefore,
        to: raceAfter,
        freePoints: granted(now) - granted(was),
      });
    }
    if (open(now) !== open(was)) {
      out.push({ kind: 'freePoints', characterId: id, unassigned: open(now) });
    }
  }
  return out;
}

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/**
 * Every notification the campaign has produced, oldest first, folded the
 * way the campaign is: undone events and undo events are skipped, so the
 * history reads "as if it never happened" (D27). Filter by `characterId`
 * before anything reaches a player.
 */
export function notificationHistory(campaign: Campaign): HistoryItem[] {
  const out: HistoryItem[] = [];
  let state: CampaignState | null = null;
  campaign.events.forEach((event, index) => {
    if (event.type === 'event.undone' || has(campaign.undone, event.id)) return;
    const after = applyEvent(state, event);
    for (const notification of notificationsBetween(state, after, event)) {
      out.push({ seq: index + 1, at: event.timestamp, day: after.day, notification });
    }
    state = after;
  });
  return out;
}
export * from './changeLog';
