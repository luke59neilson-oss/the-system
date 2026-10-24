import type { DomainEvent } from '../events/envelope';
import type { Campaign } from '../events/log';
import { applyEvent, type CampaignState } from '../events/reducer';
import { describeEvent } from '../report/sessionLog';

/** One row of the GM's change log (M4.8): an event and what it did, in words. */
export interface ChangeLogRow {
  /** Index of the event in the campaign log. */
  readonly seq: number;
  readonly id: string;
  readonly type: string;
  /** What area of the game it touched, for the GM's "Kind" filter. */
  readonly category: ChangeLogCategory;
  /** ISO-8601 UTC. */
  readonly at: string;
  readonly actor: 'gm' | 'player' | 'system';
  /** Plain-text lines: the session log's wording, else a short summary. */
  readonly lines: readonly string[];
  /** Id of the `event.undone` that undid it, if any. */
  readonly undoneBy: string | null;
}

export const CHANGE_LOG_CATEGORIES = [
  'campaign',
  'characters',
  'xp',
  'skills',
  'items',
  'quests',
  'notes',
  'messages',
  'library',
] as const;
export type ChangeLogCategory = (typeof CHANGE_LOG_CATEGORIES)[number];

const CATEGORY_BY_PREFIX: Readonly<Record<string, ChangeLogCategory>> = {
  campaign: 'campaign',
  session: 'campaign',
  rules: 'campaign',
  clock: 'campaign',
  montage: 'campaign',
  character: 'characters',
  freePoints: 'characters',
  profession: 'characters',
  title: 'characters',
  evolution: 'characters',
  xp: 'xp',
  skill: 'skills',
  selection: 'skills',
  practice: 'skills',
  item: 'items',
  holdings: 'items',
  gift: 'items',
  trade: 'items',
  quest: 'quests',
  stability: 'quests',
  entity: 'quests',
  note: 'notes',
  system: 'messages',
  broadcast: 'messages',
  skillDef: 'library',
  classDef: 'library',
  raceDef: 'library',
  professionDef: 'library',
  titleDef: 'library',
  library: 'library',
};

/** The change log's "Kind" for an event type (unknown prefixes count as campaign). */
export function changeLogCategory(type: string): ChangeLogCategory {
  return CATEGORY_BY_PREFIX[type.split('.')[0] ?? ''] ?? 'campaign';
}

/** Short phrases for events the session log does not describe. */
export const CHANGE_LOG_PHRASES: Readonly<Record<string, string>> = {
  'campaign.created': 'Campaign created',
  'character.poolsSet': 'HP, MP or Stamina set by the GM',
  'character.statsSet': 'stats set by the GM',
  'character.professionGranted': 'profession offered',
  'profession.chosen': 'profession chosen',
  'profession.offerWithdrawn': 'profession offer withdrawn',
  'freePoints.assigned': 'free points assigned',
  'freePoints.overridden': 'free points changed by the GM',
  'skill.described': 'skill text edited',
  'skill.libraryTextUsed': 'skill text handed back to the library',
  'skill.nicknamed': 'skill nicknamed',
  'skill.uniqueSet': 'skill Unique tag changed',
  'practice.logged': 'practice logged',
  'item.defined': 'item added to the library',
  'item.edited': 'item edited',
  'lootTable.defined': 'loot table added',
  'lootTable.edited': 'loot table edited',
  'item.equipped': 'item equipped',
  'item.unequipped': 'item unequipped',
  'trade.proposed': 'trade proposed',
  'trade.declined': 'trade declined',
  'trade.cancelled': 'trade cancelled',
  'practice.edited': 'practice entry corrected',
  'practice.removed': 'practice entry removed',
  'practice.reviewed': 'practice entries reviewed',
  'note.created': 'note written',
  'note.edited': 'note edited',
  'note.deleted': 'note deleted',
  'skillDef.defined': 'skill added to the library',
  'skillDef.edited': 'library skill edited',
  'classDef.defined': 'class added to the library',
  'classDef.edited': 'library class edited',
  'raceDef.defined': 'race added to the library',
  'raceDef.edited': 'library race edited',
  'professionDef.defined': 'profession added to the library',
  'professionDef.edited': 'library profession edited',
  'titleDef.defined': 'title added to the library',
  'titleDef.edited': 'library title edited',
  'library.seeded': 'Default libraries added',
  'rules.edited': 'Rules settings changed',
  'clock.created': 'progress clock created',
  'clock.ticked': 'progress clock ticked',
  'clock.removed': 'progress clock removed',
  'montage.offered': 'montage offered',
  'montage.focused': 'montage focus given',
  'montage.closed': 'montage closed',
  'contest.shared': 'contest roll shared',
  'entity.defined': 'Identify entry added',
  'entity.edited': 'Identify entry edited',
  'entity.revealed': 'Identify entry revealed',
};

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "quest.statusSet" → "quest status set": never a raw type in a row. */
export function humanize(type: string): string {
  return type
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

/**
 * A one-line summary for an event the session log has no words for: who it
 * touched, what happened and, where the payload names one, what. Notes never
 * show their title or text (a private journal stays private, DESIGN §7).
 */
function fallbackLine(state: CampaignState | null, event: DomainEvent): string {
  const p = event.payload as Record<string, unknown>;
  const phrase = CHANGE_LOG_PHRASES[event.type] ?? humanize(event.type);
  const parts: string[] = [];
  if (typeof p.characterId === 'string') {
    parts.push(oneLine(state?.characters[p.characterId]?.name ?? p.characterId));
  } else if (has(p, 'characterId') && p.characterId === null) {
    parts.push('GM');
  }
  const capital = parts.length === 0;
  parts.push(capital ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase);
  if (!event.type.startsWith('note.')) {
    const label = [p.name, p.skill, p.profession, p.title].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    if (label) parts.push(`(${oneLine(label)})`);
  }
  return parts.join(' ');
}

/**
 * Every event but undo markers, oldest first, in the session log's words
 * (M4.8). An undone event is described against the state it was applied to
 * then, without counting it. GM-only: rows carry GM notes and schedules.
 */
export function changeLog(campaign: Campaign): ChangeLogRow[] {
  return [...describeFrom(campaign, [], null, 0).rows];
}

/**
 * QF.13: the change log kept up to date one event at a time, so a long
 * campaign never replays its whole log per request. Holds the rows so far,
 * the state after them, and the last event seen, to tell an append (extend)
 * from anything else (rebuild).
 */
export interface ChangeLogCache {
  readonly rows: readonly ChangeLogRow[];
  /** State after every counted event so far (undone ones skipped). */
  readonly state: CampaignState | null;
  /** Events consumed (undo markers included). */
  readonly count: number;
  readonly firstId: string | null;
  readonly lastId: string | null;
}

const cacheOf = (campaign: Campaign, rows: ChangeLogRow[], state: CampaignState | null) => ({
  rows,
  state,
  count: campaign.events.length,
  firstId: campaign.events[0]?.id ?? null,
  lastId: campaign.events.at(-1)?.id ?? null,
});

/**
 * The change log for `campaign`, reusing `prev` when the log only grew by
 * events that are not undos: the new rows are described exactly as
 * `changeLog` would. An undo (which changes the state later rows were
 * described against) or a different log rebuilds from scratch. Rows already
 * built are shared, never mutated.
 */
export function updateChangeLog(prev: ChangeLogCache | null, campaign: Campaign): ChangeLogCache {
  const events = campaign.events;
  const extends_ =
    prev !== null &&
    prev.count <= events.length &&
    (events[0]?.id ?? null) === prev.firstId &&
    (prev.count === 0 ? null : events[prev.count - 1]?.id) === prev.lastId &&
    !events.slice(prev.count).some((e) => e.type === 'event.undone');
  if (!extends_) {
    return describeFrom(campaign, [], null, 0);
  }
  if (prev.count === events.length) return prev;
  return describeFrom(campaign, [...prev.rows], prev.state, prev.count);
}

function describeFrom(
  campaign: Campaign,
  rows: ChangeLogRow[],
  start: CampaignState | null,
  from: number,
): ChangeLogCache {
  let state = start;
  for (let seq = from; seq < campaign.events.length; seq++) {
    const event = campaign.events[seq]!;
    if (event.type === 'event.undone') continue;
    const undone = has(campaign.undone, event.id);
    let lines: string[] = [];
    try {
      const after = applyEvent(state, event);
      lines = describeEvent(state, after, event).map((e) => e.text);
      if (!undone) state = after;
    } catch {
      // An undone event may no longer apply where it stood; the summary still names it.
    }
    rows.push({
      seq,
      id: event.id,
      type: event.type,
      category: changeLogCategory(event.type),
      at: event.timestamp,
      actor: event.actor.role,
      lines: lines.length ? lines : [fallbackLine(state, event)],
      undoneBy: undone ? (campaign.undone[event.id] as string) : null,
    });
  }
  return cacheOf(campaign, rows, state);
}

/** Most rows one change-log page may hold (QF.13). */
export const CHANGE_LOG_MAX_PAGE = 500;
export const CHANGE_LOG_DEFAULT_PAGE = 100;

export interface ChangeLogQuery {
  /** Only rows with `seq` below this (the previous page's `older`). */
  readonly before?: number | null;
  readonly limit?: number | null;
  readonly who?: 'all' | 'gm' | 'player';
  readonly kind?: 'all' | ChangeLogCategory;
  /** Case-insensitive text the row's words must contain. */
  readonly text?: string;
}

export interface ChangeLogPage {
  /** Newest first. */
  readonly rows: readonly ChangeLogRow[];
  /** Pass as `before` for the next older page; null when there is none. */
  readonly older: number | null;
  /** Rows matching the filters across the whole log. */
  readonly matching: number;
  /**
   * Undone rows across the whole log, ignoring filters: when it changes, rows
   * a client loaded earlier may be stale (an undo changes the target row and
   * can change the words of later ones).
   */
  readonly undone: number;
}

/**
 * One bounded page of the change log, newest first, filtered across the
 * whole log (so a search still finds old changes). `limit` is clamped to
 * 1…CHANGE_LOG_MAX_PAGE.
 */
export function changeLogPage(rows: readonly ChangeLogRow[], query: ChangeLogQuery = {}) {
  const raw = query.limit ?? CHANGE_LOG_DEFAULT_PAGE;
  const limit = Math.min(
    CHANGE_LOG_MAX_PAGE,
    Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : CHANGE_LOG_DEFAULT_PAGE),
  );
  const who = query.who ?? 'all';
  const kind = query.kind ?? 'all';
  const text = (query.text ?? '').trim().toLowerCase();
  const before = query.before ?? Number.POSITIVE_INFINITY;
  const page: ChangeLogRow[] = [];
  let matching = 0;
  let undone = 0;
  let older: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.undoneBy !== null) undone++;
    if (who !== 'all' && r.actor !== who && !(who === 'gm' && r.actor === 'system')) continue;
    if (kind !== 'all' && r.category !== kind) continue;
    if (text !== '' && !r.lines.join(' ').toLowerCase().includes(text)) continue;
    matching++;
    if (r.seq >= before) continue;
    if (page.length < limit) page.push(r);
    else if (older === null) older = page.at(-1)!.seq;
  }
  return { rows: page, older, matching, undone } satisfies ChangeLogPage;
}
