import { raceLevel, type Character } from '../character';
import type { DomainEvent } from '../events/envelope';
import type { Campaign } from '../events/log';
import { applyEvent, type CampaignState } from '../events/reducer';
import { hiddenQuestNoticed } from '../quests';
import { titleDefByName } from '../titles';
import { isEmptyBundle, type Bundle } from '../economy';

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
      /** QF.19: the GM's reason for an item give (M6.A), when one was given. */
      readonly reason?: string;
    }
  | {
      /**
       * The GM granted or fined currency (M6.3); only that character is told,
       * with the GM's reason.
       */
      readonly kind: 'currency';
      readonly characterId: string;
      /** Signed change (a fine is negative). */
      readonly amount: number;
      readonly currencyName: string;
      readonly reason: string;
    }
  | {
      /**
       * The GM took items back (M6.A); only that character is told, with the
       * GM's reason. Items the GM gives arrive as a `gift` from the GM.
       */
      readonly kind: 'itemsTaken';
      readonly characterId: string;
      readonly items: readonly { readonly name: string; readonly count: number }[];
      readonly reason: string;
    }
  | {
      /** A trade changed by the other party (M3.7); only the party who did not act is told. */
      readonly kind: 'trade';
      readonly characterId: string;
      readonly action: 'proposed' | 'accepted' | 'declined' | 'cancelled';
      /** The other party's name, or null for the GM. */
      readonly other: string | null;
    }
  | {
      /** A title awarded (M6.4); only its holder is told, with the System's text. */
      readonly kind: 'title';
      readonly characterId: string;
      readonly title: string;
      /** The library entry's text, or '' when the title has none. */
      readonly text: string;
    }
  | {
      /** A skill upgraded by mastery marks (M5.3); only its owner is told. */
      readonly kind: 'skillUpgrade';
      readonly characterId: string;
      readonly skill: string;
      /** Rarity display names before and after. */
      readonly from: string;
      readonly to: string;
    }
  | {
      /** Two skills merged into one (M5.4); only their owner is told. */
      readonly kind: 'skillMerge';
      readonly characterId: string;
      readonly skills: readonly [string, string];
      readonly name: string;
      /** Rarity display name of the merged skill. */
      readonly rarity: string;
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
  // M6.2: loot rolled for a character reaches them as a gift from the GM.
  const lootGift =
    event?.type === 'loot.rolled' && event.payload.characterId !== null
      ? after.lootLog.find((r) => r.id === event.id)
      : undefined;
  if (lootGift && lootGift.characterId !== null && !isEmptyBundle(lootGift.bundle)) {
    out.push(giftNotice(after, lootGift.characterId, null, lootGift.bundle));
  }
  if (event?.type === 'title.awarded') {
    const def = titleDefByName(after.titleLibrary, after.titleLibraryOrder, event.payload.title);
    out.push({
      kind: 'title',
      characterId: event.payload.characterId,
      title: def?.name ?? event.payload.title.trim(),
      text: def?.text ?? '',
    });
  }
  if ((event?.type === 'titleDef.defined' || event?.type === 'titleDef.edited') && before) {
    // M6.A: defining or renaming a library title can match a title someone
    // already holds by name (free text, D69). That holder now gets its
    // bonuses, so they hear about it like an award.
    const defId = event.type === 'titleDef.defined' ? event.payload.id : event.payload.titleDefId;
    const def = has(after.titleLibrary, defId) ? after.titleLibrary[defId] : undefined;
    const linked = (state: CampaignState, id: string) => {
      const c = has(state.characters, id) ? state.characters[id] : undefined;
      return (c?.titles ?? []).some(
        (t) => titleDefByName(state.titleLibrary, state.titleLibraryOrder, t)?.id === defId,
      );
    };
    for (const characterId of def ? after.characterOrder : []) {
      if (def && linked(after, characterId) && !linked(before, characterId)) {
        out.push({ kind: 'title', characterId, title: def.name, text: def.text });
      }
    }
  }
  if (event?.type === 'holdings.adjusted' && event.payload.currency !== 0) {
    const { characterId, currency, reason } = event.payload;
    out.push({
      kind: 'currency',
      characterId,
      amount: currency,
      currencyName: after.rules.economy.currencyName,
      reason,
    });
  }
  if (event?.type === 'holdings.adjusted') {
    // M6.A: items the GM gives or takes reach the holder like loot and gifts.
    const { characterId, items } = event.payload;
    const entries = Object.entries(items);
    const name = (itemId: string) =>
      (has(after.items, itemId) ? after.items[itemId]?.name : undefined) ?? itemId;
    const given = entries.filter(([, n]) => n > 0);
    if (given.length > 0) {
      // QF.19: the Give form says the player sees the reason, so carry it.
      out.push(
        giftNotice(
          after,
          characterId,
          null,
          { currency: 0, items: Object.fromEntries(given) },
          event.payload.reason,
        ),
      );
    }
    const taken = entries.filter(([, n]) => n < 0);
    if (taken.length > 0) {
      out.push({
        kind: 'itemsTaken',
        characterId,
        items: taken.map(([itemId, n]) => ({ name: name(itemId), count: -n })),
        reason: event.payload.reason,
      });
    }
  }
  if (event?.type === 'gift.given' && event.payload.to !== null) {
    const { characterId: giver, to, bundle } = event.payload;
    out.push(giftNotice(after, to, giver, bundle));
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
  if (event?.type === 'skill.upgraded' && before) {
    const { characterId, skill } = event.payload;
    const rarityOf = (state: CampaignState) =>
      (has(state.characters, characterId) ? state.characters[characterId] : undefined)?.skills.find(
        (s) => s.name === skill,
      )?.rarity;
    const from = rarityOf(before);
    const to = rarityOf(after);
    if (from && to && from !== to) {
      const name = (id: string) => after.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
      out.push({ kind: 'skillUpgrade', characterId, skill, from: name(from), to: name(to) });
    }
  }
  if (event?.type === 'skill.merged') {
    const { characterId, skills, name } = event.payload;
    const merged = (
      has(after.characters, characterId) ? after.characters[characterId] : undefined
    )?.skills.find((s) => s.name === name);
    if (merged) {
      const rarity =
        after.rules.skills.rarities.find((r) => r.id === merged.rarity)?.name ?? merged.rarity;
      out.push({ kind: 'skillMerge', characterId, skills: [skills[0], skills[1]], name, rarity });
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

/** A gift notification for `to` (M3.7); `giver` null = the GM. */
function giftNotice(
  after: CampaignState,
  to: string,
  giver: string | null,
  bundle: Bundle,
  reason = '',
): SystemNotification {
  const why = reason.trim();
  return {
    ...(why === '' ? {} : { reason: why }),
    kind: 'gift',
    characterId: to,
    from: giver === null ? null : (after.characters[giver]?.name ?? giver),
    currency: bundle.currency,
    currencyName: after.rules.economy.currencyName,
    items: Object.entries(bundle.items).map(([itemId, count]) => ({
      name: after.items[itemId]?.name ?? itemId,
      count,
    })),
  };
}
