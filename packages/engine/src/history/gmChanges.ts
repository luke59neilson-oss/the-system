import type { Character } from '../character';
import type { DomainEvent, EventType } from '../events/envelope';
import type { CampaignState } from '../events/reducer';
import { shareXp } from '../progression';
import { slotKey } from '../economy';

/**
 * MU.2 (DESIGN §7 "Player log"): every change the GM makes to a character
 * reaches its player. The older notification kinds (DINGs, gifts, titles,
 * trades…) cover most events; this module adds a `gmChange` notice for the
 * rest, and `PLAYER_NOTICE_AUDIT` lists every event type with how it reaches
 * the player, or why it is silent on purpose. Pure.
 */

export type GmChangeKind =
  | 'renamed'
  | 'portrait'
  | 'stats'
  | 'pools'
  | 'progression'
  | 'xp'
  | 'freePoints'
  | 'professionWithdrawn'
  | 'titleEdited'
  | 'equipped'
  | 'unequipped'
  | 'skillGranted'
  | 'skillRarity'
  | 'skillUnique'
  | 'skillText'
  | 'skillNickname'
  | 'skillMark'
  | 'mergeDeclined'
  | 'selectionOffered'
  | 'selectionWithdrawn'
  | 'selectionChosen'
  | 'evolutionReleased'
  | 'evolutionChosen'
  | 'questNew'
  | 'questUpdated'
  | 'questStatus';

/** One changed value, already in display form ("2.3", "85/100"). */
export interface GmChangeDiff {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export interface GmChangeNotice {
  readonly kind: 'gmChange';
  readonly characterId: string;
  readonly change: GmChangeKind;
  /** The skill, item, profession, title or quest the change is about, when one. */
  readonly subject?: string;
  /** What changed, value by value (stats, pools, levels, name, rarity). */
  readonly diffs?: readonly GmChangeDiff[];
  /** XP gained, selection level, quest status… the one number or word it carries. */
  readonly detail?: string;
}

/**
 * How each event type reaches the player whose character it changes:
 * `notifies` (a notification names that character), `silent` with the reason
 * it is on purpose, or `none` when it changes no character. Exhaustive by
 * type, so a new event type must be placed here before the engine compiles.
 */
export type PlayerNoticeAudit =
  | { readonly audit: 'notifies' }
  | { readonly audit: 'silent'; readonly reason: string }
  | { readonly audit: 'none' };

const notifies: PlayerNoticeAudit = { audit: 'notifies' };
const none: PlayerNoticeAudit = { audit: 'none' };
const silent = (reason: string): PlayerNoticeAudit => ({ audit: 'silent', reason });

const LIBRARY_EDIT =
  'a library edit, not a change to one character: holders see the new text or bonuses on their sheet at once, and a notice per holder for every tweak while the GM tunes an entry would bury the log';

export const PLAYER_NOTICE_AUDIT: Readonly<Record<EventType, PlayerNoticeAudit>> = {
  'campaign.created': none,
  'character.created': none,
  'character.renamed': notifies,
  'character.portraitSet': notifies,
  'character.professionGranted': notifies,
  'profession.chosen': notifies,
  'profession.offerWithdrawn': notifies,
  'title.awarded': notifies,
  'titleDef.defined': notifies,
  'titleDef.edited': notifies,
  'character.poolsSet': notifies,
  'character.statsSet': notifies,
  'character.progressionSet': notifies,
  'xp.awarded': notifies,
  'freePoints.assigned': notifies,
  'freePoints.overridden': notifies,
  'system.broadcast': notifies,
  'broadcast.scheduled': none,
  'broadcast.unscheduled': none,
  'broadcast.removed': none,
  'item.defined': none,
  'item.edited': silent(LIBRARY_EDIT),
  'holdings.adjusted': notifies,
  'lootTable.defined': none,
  'lootTable.edited': none,
  'loot.rolled': notifies,
  'gift.given': notifies,
  'item.equipped': notifies,
  'item.unequipped': notifies,
  'trade.proposed': notifies,
  'trade.accepted': notifies,
  'trade.declined': notifies,
  'trade.cancelled': notifies,
  'practice.logged': silent(
    "the practice log is the GM's review material (DESIGN §7); the marks, upgrades and merges that come of it notify",
  ),
  'practice.edited': silent('GM review material, as practice.logged'),
  'practice.removed': silent('GM review material, as practice.logged'),
  'practice.reviewed': silent('GM review material, as practice.logged'),
  'note.created': none,
  'note.edited': none,
  'note.deleted': none,
  'skill.nicknamed': notifies,
  'skill.described': notifies,
  'skill.uniqueSet': notifies,
  'skill.raritySet': notifies,
  'skill.granted': notifies,
  'skill.libraryTextUsed': notifies,
  'skill.markAwarded': notifies,
  'skill.upgraded': notifies,
  'skill.merged': notifies,
  'skill.mergeOffered': notifies,
  'skill.mergeAnswered': notifies,
  'skillDef.defined': silent(LIBRARY_EDIT),
  'skillDef.edited': silent(LIBRARY_EDIT),
  'classDef.defined': none,
  'classDef.edited': none,
  'raceDef.defined': none,
  'raceDef.edited': none,
  'professionDef.defined': none,
  'professionDef.edited': none,
  'library.seeded': silent(LIBRARY_EDIT),
  'selection.offered': notifies,
  'selection.chosen': notifies,
  'selection.optionWithdrawn': notifies,
  'evolution.released': notifies,
  'evolution.chosen': notifies,
  'clock.created': none,
  'clock.ticked': none,
  'clock.removed': none,
  'montage.offered': none,
  'montage.focused': none,
  'montage.closed': none,
  'contest.shared': none,
  'quest.created': notifies,
  'quest.edited': notifies,
  'quest.statusSet': notifies,
  'stability.actionApplied': none,
  'stability.nudged': none,
  'entity.defined': none,
  'entity.edited': none,
  'entity.revealed': none,
  'hunger.configured': none,
  'hunger.levelsSet': none,
  'region.defined': none,
  'region.edited': none,
  'region.currentSet': none,
  'faction.defined': none,
  'faction.edited': none,
  'faction.revealSet': none,
  'shop.defined': none,
  'shop.removed': none,
  'campaign.dayAdvanced': notifies,
  'rules.edited': silent(
    "a campaign-wide rules change, not one character's; the GM tells the table, and any level or pool it moves shows on the sheet",
  ),
  'rules.migrated': silent('a load-time upgrade of an older campaign, not a GM action'),
  'session.started': none,
  'session.ended': none,
  'scene.ended': none,
  'scene.answered': none,
  'event.undone': silent(
    'an undo makes the history read as if the event never happened (D27); the sheet shows the result',
  ),
};

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const charOf = (state: CampaignState | null, id: string): Character | undefined =>
  state && has(state.characters, id) ? state.characters[id] : undefined;

function statText(state: CampaignState, value: number): string {
  const { displayDivisor, displayDecimals } = state.rules.stats;
  return (value / displayDivisor).toFixed(displayDecimals);
}

function statDiffs(before: Character, after: Character, state: CampaignState): GmChangeDiff[] {
  return state.rules.stats.list
    .filter((s) => (before.stats[s.id] ?? 0) !== (after.stats[s.id] ?? 0))
    .map((s) => ({
      label: s.name,
      from: statText(state, before.stats[s.id] ?? 0),
      to: statText(state, after.stats[s.id] ?? 0),
    }));
}

function poolDiffs(before: Character, after: Character, state: CampaignState): GmChangeDiff[] {
  return state.rules.pools
    .filter((p) => (before.pools[p.id] ?? 0) !== (after.pools[p.id] ?? 0))
    .map((p) => ({
      label: p.name,
      from: String(before.pools[p.id] ?? 0),
      to: String(after.pools[p.id] ?? 0),
    }));
}

function rarityName(state: CampaignState, id: string): string {
  return state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
}

/** Grades are named by their id ("F"). */
function gradeName(_state: CampaignState, id: string): string {
  return id;
}

/** The `gmChange` notices one event causes (MU.2). Player-made changes tell nobody. */
export function gmChangeNotices(
  before: CampaignState | null,
  after: CampaignState,
  event: DomainEvent,
): GmChangeNotice[] {
  if (event.actor.role === 'player' || before === null) return [];
  const out: GmChangeNotice[] = [];
  const push = (n: Omit<GmChangeNotice, 'kind'>) => out.push({ kind: 'gmChange', ...n });
  switch (event.type) {
    case 'character.renamed': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now && was.name !== now.name) {
        push({
          characterId: now.id,
          change: 'renamed',
          diffs: [{ label: 'Name', from: was.name, to: now.name }],
        });
      }
      break;
    }
    case 'character.portraitSet':
      push({ characterId: event.payload.characterId, change: 'portrait' });
      break;
    case 'character.statsSet': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now) {
        const diffs = statDiffs(was, now, after);
        if (diffs.length > 0) push({ characterId: now.id, change: 'stats', diffs });
      }
      break;
    }
    case 'character.poolsSet': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now) {
        const diffs = poolDiffs(was, now, after);
        if (diffs.length > 0) push({ characterId: now.id, change: 'pools', diffs });
      }
      break;
    }
    case 'character.progressionSet': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now) {
        const diffs: GmChangeDiff[] = [];
        const add = (label: string, from: string | number, to: string | number) => {
          if (String(from) !== String(to))
            diffs.push({ label, from: String(from), to: String(to) });
        };
        add('Grade', gradeName(before, was.grade), gradeName(after, now.grade));
        add('Class level', was.classLevel, now.classLevel);
        if (now.profession !== null) {
          add('Profession level', was.professionLevel, now.professionLevel);
        }
        add('Class XP', was.xp.class, now.xp.class);
        if (now.profession !== null) add('Profession XP', was.xp.profession, now.xp.profession);
        push({ characterId: now.id, change: 'progression', diffs });
      }
      break;
    }
    case 'xp.awarded': {
      const { track, shares, enemyLevel, enemyGrade } = event.payload;
      for (const s of shares) {
        const was = charOf(before, s.characterId);
        if (!was) continue;
        const gained = shareXp(before.rules, was, s.share, enemyLevel, enemyGrade, s.raceLevel);
        push({ characterId: s.characterId, change: 'xp', subject: track, detail: String(gained) });
      }
      break;
    }
    case 'freePoints.overridden': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now) {
        push({
          characterId: now.id,
          change: 'freePoints',
          detail: String(event.payload.raceLevel),
          diffs: statDiffs(was, now, after),
        });
      }
      break;
    }
    case 'freePoints.assigned': {
      const was = charOf(before, event.payload.characterId);
      const now = charOf(after, event.payload.characterId);
      if (was && now) {
        push({
          characterId: now.id,
          change: 'freePoints',
          detail: String(event.payload.raceLevel),
          diffs: statDiffs(was, now, after),
        });
      }
      break;
    }
    case 'profession.offerWithdrawn':
      push({
        characterId: event.payload.characterId,
        change: 'professionWithdrawn',
        subject: event.payload.profession,
      });
      break;
    case 'titleDef.edited': {
      // Holders whose title the edit touches (by its name before or after).
      const def = has(after.titleLibrary, event.payload.titleDefId)
        ? after.titleLibrary[event.payload.titleDefId]
        : undefined;
      const old = has(before.titleLibrary, event.payload.titleDefId)
        ? before.titleLibrary[event.payload.titleDefId]
        : undefined;
      if (!def || !old) break;
      const holds = (c: Character | undefined, name: string) =>
        (c?.titles ?? []).some((t) => t.trim().toLowerCase() === name.toLowerCase());
      for (const id of after.characterOrder) {
        // Only a holder linked to this title before and after; a newly linked
        // holder gets the 'title' notice instead (M6.A), never both.
        if (holds(charOf(before, id), old.name) && holds(charOf(after, id), def.name))
          push({ characterId: id, change: 'titleEdited', subject: def.name });
      }
      break;
    }
    case 'item.equipped':
    case 'item.unequipped': {
      const itemId =
        event.type === 'item.equipped'
          ? event.payload.itemId
          : (equippedItem(
              before,
              event.payload.characterId,
              event.payload.slot,
              event.payload.index,
            ) ?? '');
      const name = has(after.items, itemId) ? (after.items[itemId]?.name ?? itemId) : itemId;
      push({
        characterId: event.payload.characterId,
        change: event.type === 'item.equipped' ? 'equipped' : 'unequipped',
        ...(name === '' ? {} : { subject: name }),
      });
      break;
    }
    case 'skill.granted':
      push({
        characterId: event.payload.characterId,
        change: 'skillGranted',
        subject: event.payload.name,
        detail: rarityName(after, event.payload.rarity),
      });
      break;
    case 'skill.raritySet': {
      const { characterId, skill } = event.payload;
      const from = charOf(before, characterId)?.skills.find((s) => s.name === skill)?.rarity;
      const to = charOf(after, characterId)?.skills.find((s) => s.name === skill)?.rarity;
      if (from && to && from !== to) {
        push({
          characterId,
          change: 'skillRarity',
          subject: skill,
          diffs: [{ label: 'Rarity', from: rarityName(before, from), to: rarityName(after, to) }],
        });
      }
      break;
    }
    case 'skill.uniqueSet':
      push({
        characterId: event.payload.characterId,
        change: 'skillUnique',
        subject: event.payload.skill,
        detail: event.payload.unique ? 'on' : 'off',
      });
      break;
    case 'skill.described':
    case 'skill.libraryTextUsed':
      push({
        characterId: event.payload.characterId,
        change: 'skillText',
        subject: event.payload.skill,
      });
      break;
    case 'skill.nicknamed':
      push({
        characterId: event.payload.characterId,
        change: 'skillNickname',
        subject: event.payload.skill,
        detail: (event.payload.nickname ?? '').trim(),
      });
      break;
    case 'skill.markAwarded': {
      const { characterId, skill } = event.payload;
      const marks = charOf(after, characterId)?.skills.find((s) => s.name === skill)?.marks;
      push({
        characterId,
        change: 'skillMark',
        subject: skill,
        ...(marks === undefined ? {} : { detail: String(marks) }),
      });
      break;
    }
    case 'skill.mergeAnswered':
      if (!event.payload.accept) {
        const offer = charOf(before, event.payload.characterId)?.mergeOffer ?? null;
        push({
          characterId: event.payload.characterId,
          change: 'mergeDeclined',
          ...(offer ? { subject: offer.name } : {}),
        });
      }
      break;
    case 'selection.offered':
      push({
        characterId: event.payload.characterId,
        change: 'selectionOffered',
        detail: String(event.payload.level),
      });
      break;
    case 'selection.optionWithdrawn':
      push({
        characterId: event.payload.characterId,
        change: 'selectionWithdrawn',
        subject: event.payload.skill,
      });
      break;
    case 'selection.chosen':
      push({
        characterId: event.payload.characterId,
        change: 'selectionChosen',
        subject: event.payload.skill,
        detail: String(event.payload.level),
      });
      break;
    case 'evolution.released':
      push({ characterId: event.payload.characterId, change: 'evolutionReleased' });
      break;
    case 'evolution.chosen': {
      const now = charOf(after, event.payload.characterId);
      push({
        characterId: event.payload.characterId,
        change: 'evolutionChosen',
        ...(now ? { subject: now.className, detail: gradeName(after, now.grade) } : {}),
      });
      break;
    }
    case 'quest.created':
    case 'quest.edited':
    case 'quest.statusSet': {
      const id = event.payload.questId;
      const was = has(before.quests, id) ? before.quests[id] : undefined;
      const now = has(after.quests, id) ? after.quests[id] : undefined;
      if (!now?.visible) break;
      const change: GmChangeKind = !was?.visible
        ? 'questNew'
        : event.type === 'quest.statusSet' && was.status !== now.status
          ? 'questStatus'
          : 'questUpdated';
      for (const characterId of after.characterOrder) {
        push({
          characterId,
          change,
          subject: now.title,
          ...(change === 'questStatus' ? { detail: now.status } : {}),
        });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

function equippedItem(
  state: CampaignState,
  characterId: string,
  slot: string,
  index: number,
): string | null {
  const holdings = has(state.holdings, characterId) ? state.holdings[characterId] : undefined;
  return holdings?.equipped[slotKey(slot, index)] ?? null;
}
