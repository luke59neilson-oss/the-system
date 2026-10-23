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
  'freePoints.assigned': 'free points assigned',
  'freePoints.overridden': 'free points changed by the GM',
  'skill.described': 'skill text edited',
  'skill.libraryTextUsed': 'skill text handed back to the library',
  'skill.nicknamed': 'skill nicknamed',
  'skill.uniqueSet': 'skill Unique tag changed',
  'practice.logged': 'practice logged',
  'item.defined': 'item added to the library',
  'item.edited': 'item edited',
  'item.equipped': 'item equipped',
  'item.unequipped': 'item unequipped',
  'trade.proposed': 'trade proposed',
  'trade.declined': 'trade declined',
  'trade.cancelled': 'trade cancelled',
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
  'library.seeded': 'Default libraries added',
  'clock.created': 'progress clock created',
  'clock.ticked': 'progress clock ticked',
  'clock.removed': 'progress clock removed',
  'montage.offered': 'montage offered',
  'montage.focused': 'montage focus given',
  'montage.closed': 'montage closed',
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
  const rows: ChangeLogRow[] = [];
  let state: CampaignState | null = null;
  campaign.events.forEach((event, seq) => {
    if (event.type === 'event.undone') return;
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
  });
  return rows;
}
