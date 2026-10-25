import { z } from 'zod';
import {
  EVENT_SCHEMA_VERSIONS,
  EventRejectedError,
  parseEvent,
  type Actor,
  type DomainEvent,
  type EventType,
} from './envelope';
import { CharacterRuleError, raceLevel } from '../character';
import { settleContest, type ContestSideRecord, type GradeGapMode } from '../resolution';
import { titleDefByName } from '../titles';
import { hungerLevel } from '../trackers';
import { keptRerate } from '../evolution';
import { normalizeTags } from '../skills/library';
import { missingDefaultEntries } from '../content/defaults';
import { largestRemainderSplit } from '../progression';
import { bankedXp } from './migrations';
import { defaultRules } from '../rules';
import {
  EMPTY_HOLDINGS,
  EconomyRuleError,
  itemsSeenBy,
  lootBundle,
  rollLoot,
  type LootEntry,
  type LootTable,
} from '../economy';
import { appendEvent, type Campaign } from './log';

/**
 * Commands are requests; events are facts. `execute` turns a command into
 * validated events and appends them, or explains why it cannot.
 */
export type Command =
  | { type: 'campaign.create'; name: string; rules: unknown }
  | {
      type: 'character.create';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      className: string;
      race?: string | undefined;
      classSkills: readonly {
        name: string;
        rarity: string;
        description?: string | undefined;
        flavor?: string | undefined;
      }[];
      classWeights?: Readonly<Record<string, number>> | undefined;
      /** Portrait file name the server stored (M4.4). */
      portrait?: string | undefined;
    }
  | { type: 'character.rename'; characterId: string; name: string }
  | { type: 'character.setPortrait'; characterId: string; portrait: string | null }
  | { type: 'character.grantProfession'; characterId: string; profession: string }
  /** Player: take one of the professions the GM offered (MQ.6). */
  | { type: 'profession.choose'; characterId: string; profession: string }
  /** GM only: withdraw an untaken profession offer (M5.2). */
  | { type: 'profession.withdrawOffer'; characterId: string; profession: string }
  | { type: 'title.award'; characterId: string; title: string }
  | {
      type: 'titleDef.define';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      text?: string | undefined;
      bonuses?: readonly StatBonusInput[] | undefined;
    }
  | {
      type: 'titleDef.edit';
      titleDefId: string;
      name?: string | undefined;
      text?: string | undefined;
      bonuses?: readonly StatBonusInput[] | undefined;
    }
  | { type: 'character.setPools'; characterId: string; pools: Readonly<Record<string, number>> }
  | { type: 'character.setStats'; characterId: string; stats: Readonly<Record<string, number>> }
  | {
      type: 'xp.award';
      track: 'class' | 'profession';
      amount: number;
      /**
       * Participants in order. Give every one a `share` to set the split by
       * hand (shares must sum to the amount), or optional `weight`s for a
       * largest-remainder split (even by default).
       */
      participants: readonly {
        characterId: string;
        weight?: number | undefined;
        share?: number | undefined;
      }[];
      enemyLevel?: number | null | undefined;
      /** Target's grade id for the grade-gap XP factor (MQ.10). */
      enemyGrade?: string | null | undefined;
      reason?: string | undefined;
    }
  | {
      type: 'freePoints.assign';
      characterId: string;
      raceLevel: number;
      allocation: Readonly<Record<string, number>>;
    }
  | {
      type: 'freePoints.override';
      characterId: string;
      raceLevel: number;
      /** null unassigns the batch and unlocks it. */
      allocation: Readonly<Record<string, number>> | null;
    }
  | {
      type: 'system.broadcast';
      text: string;
      /** Recipients; omitted or null = every character. */
      characterIds?: readonly string[] | null | undefined;
    }
  | {
      /** M4.7: send on a later in-game day instead of now. */
      type: 'broadcast.schedule';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      text: string;
      /** Recipients; omitted or null = every character (when it is sent). */
      characterIds?: readonly string[] | null | undefined;
      day: number;
    }
  | { type: 'broadcast.unschedule'; id: string }
  | {
      type: 'item.define';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      rarity: string;
      description?: string | undefined;
      slot?: string | null | undefined;
      bonuses?: readonly StatBonusInput[] | undefined;
    }
  | {
      type: 'item.edit';
      itemId: string;
      name?: string | undefined;
      rarity?: string | undefined;
      description?: string | undefined;
      slot?: string | null | undefined;
      bonuses?: readonly StatBonusInput[] | undefined;
    }
  | {
      type: 'lootTable.define';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      rolls?: number | undefined;
      entries: readonly LootEntry[];
    }
  | {
      type: 'lootTable.edit';
      tableId: string;
      name?: string | undefined;
      rolls?: number | undefined;
      entries?: readonly LootEntry[] | undefined;
    }
  | {
      type: 'loot.roll';
      tableId: string;
      /** Who gets what it rolls (a GM gift); null or omitted = the GM only. */
      characterId?: string | null | undefined;
    }
  | {
      type: 'holdings.adjust';
      characterId: string;
      /** Signed: positive gives, negative takes. */
      currency?: number | undefined;
      items?: Readonly<Record<string, number>> | undefined;
      reason?: string | undefined;
    }
  | {
      type: 'gift.give';
      /** Giver; null = the GM. */
      characterId: string | null;
      /** Recipient; null = the GM. */
      to: string | null;
      currency?: number | undefined;
      items?: Readonly<Record<string, number>> | undefined;
    }
  | { type: 'item.equip'; characterId: string; itemId: string; slot: string; index?: number }
  | { type: 'item.unequip'; characterId: string; slot: string; index?: number }
  | {
      type: 'trade.propose';
      /** Optional; a fresh id is generated when omitted. */
      tradeId?: string | undefined;
      /** Proposer; null = the GM. */
      characterId: string | null;
      /** Counterparty; null = the GM. */
      to: string | null;
      give: BundleInput;
      get: BundleInput;
    }
  | {
      type: 'trade.accept' | 'trade.decline' | 'trade.cancel';
      tradeId: string;
      characterId: string | null;
    }
  | {
      type: 'practice.log';
      characterId: string;
      action: string;
      skills?: readonly string[] | undefined;
      stat?: string | null | undefined;
      tags?: readonly string[] | undefined;
      /** Default: "player" for a player, "gm" for the GM. */
      source?: 'gm' | 'player' | 'montage' | undefined;
    }
  | {
      type: 'practice.edit';
      entryId: string;
      action?: string | undefined;
      skills?: readonly string[] | undefined;
      stat?: string | null | undefined;
    }
  | { type: 'practice.remove'; entryId: string }
  | { type: 'practice.review'; entryIds: readonly string[] }
  | {
      type: 'note.create';
      /** Optional; a fresh id is generated when omitted. */
      noteId?: string | undefined;
      /** Author: the player's own character, or null for the GM. */
      characterId: string | null;
      kind: 'journal' | 'party' | 'gm';
      title?: string | undefined;
      body?: string | undefined;
      tags?: readonly string[] | undefined;
      /** Journal only (default false); party notes are always shared, GM notes never. */
      shareable?: boolean | undefined;
    }
  | {
      type: 'note.edit';
      noteId: string;
      characterId: string | null;
      title?: string | undefined;
      body?: string | undefined;
      tags?: readonly string[] | undefined;
      shareable?: boolean | undefined;
    }
  | { type: 'note.delete'; noteId: string; characterId: string | null }
  | { type: 'skill.nickname'; characterId: string; skill: string; nickname: string | null }
  | {
      type: 'skill.describe';
      characterId: string;
      skill: string;
      description: string | null;
      flavor: string | null;
    }
  | { type: 'skill.setUnique'; characterId: string; skill: string; unique: boolean }
  /** GM hands a hand-written skill copy back to the library (MR.4). */
  | { type: 'skill.useLibraryText'; characterId: string; skill: string }
  | {
      type: 'skill.awardMark';
      characterId: string;
      skill: string;
      /** Session the mark was earned in; defaults to the current session. */
      session?: string | undefined;
    }
  | { type: 'skill.upgrade'; characterId: string; skill: string }
  | {
      type: 'skill.merge';
      characterId: string;
      skills: readonly [string, string];
      name: string;
      /** Id for the offer the player answers (MT.2); generated when absent. */
      offerId?: string | undefined;
    }
  | { type: 'skill.answerMerge'; characterId: string; offerId: string; accept: boolean }
  | {
      type: 'selection.offer';
      characterId: string;
      level: number;
      options: readonly {
        name: string;
        rarity: string;
        /** Default "class". */
        kind?: 'class' | 'profession' | undefined;
        description?: string | undefined;
      }[];
    }
  | {
      type: 'selection.choose';
      characterId: string;
      level: number;
      skill: string;
      /** The offer being answered; defaults to the menu pending now. */
      offerId?: string | undefined;
    }
  | {
      /** GM only: a passed-over option leaves later menus (MQ.3). */
      type: 'selection.withdrawOption';
      characterId: string;
      skill: string;
    }
  | {
      type: 'evolution.release';
      characterId: string;
      options: readonly {
        /** Optional; "o1", "o2"... by position when omitted. */
        id?: string | undefined;
        className: string;
        description?: string | undefined;
        transforms?:
          | readonly { skill: string; name: string; rarity: string; merge?: string | undefined }[]
          | undefined;
        classWeights?: Readonly<Record<string, number>> | null | undefined;
        statBonus?: Readonly<Record<string, number>> | undefined;
      }[];
      /** Offered at the profession unlock grade; default none. */
      professions?: readonly string[] | undefined;
      /**
       * The GM's re-rating (MR.1, MT.1): skill name → rarity after the
       * evolution. Skills not named keep the rarity they have going in.
       */
      rerate?: Readonly<Record<string, string>> | undefined;
      /**
       * The GM approved the re-rating list (MT.1, DESIGN §6): the release is
       * refused without it.
       */
      rerateApproved?: boolean | undefined;
    }
  | {
      type: 'evolution.choose';
      characterId: string;
      optionId: string;
      profession?: string | null | undefined;
      /** The release being answered; defaults to the one pending now. */
      releaseId?: string | undefined;
    }
  | {
      type: 'clock.create';
      /** Optional; a fresh id is generated when omitted. */
      clockId?: string | undefined;
      name: string;
      segments: number;
    }
  | {
      type: 'clock.tick';
      clockId: string;
      result: 'success' | 'failure';
      /** Segments a success fills (default 1). */
      amount?: number | undefined;
    }
  | { type: 'clock.remove'; clockId: string }
  | {
      /** GM shares a contest rolled on their screen with the table (M7.3). */
      type: 'contest.share';
      contestId?: string | undefined;
      a: ContestSideRecord;
      b: ContestSideRecord;
      /** Default: the campaign's grade-gap mode. */
      mode?: GradeGapMode | undefined;
      /** The roll drawn, or null when a grade wall settled it. */
      roll: number | null;
    }
  | {
      type: 'montage.offer';
      /** Optional; a fresh id is generated when omitted. */
      montageId?: string | undefined;
      clockId: string;
      /** What players see; default "Montage" (the clock's name stays GM-only). */
      label?: string | undefined;
      characterIds: readonly string[];
    }
  | {
      type: 'montage.focus';
      montageId: string;
      characterId: string;
      action: string;
      skills?: readonly string[] | undefined;
      stat?: string | null | undefined;
    }
  | { type: 'montage.close'; montageId: string }
  | {
      type: 'quest.create';
      /** Optional; a fresh id is generated when omitted. */
      questId?: string | undefined;
      title: string;
      text?: string | undefined;
      /** Default true. */
      visible?: boolean | undefined;
      days?: number | null | undefined;
      stability?:
        | {
            initial?: number | null | undefined;
            /** Default: the config's `stability.visibleToPlayersByDefault`. */
            visible?: boolean | undefined;
            rules?: Readonly<Record<string, number>> | undefined;
          }
        | null
        | undefined;
      /** MQ.7: who gets the hidden-quest notice; default null = every character. */
      noticeTo?: readonly string[] | null | undefined;
    }
  | {
      type: 'quest.edit';
      questId: string;
      title?: string | undefined;
      text?: string | undefined;
      visible?: boolean | undefined;
      days?: number | null | undefined;
      stabilityVisible?: boolean | undefined;
      stabilityRules?: Readonly<Record<string, number>> | undefined;
      noticeTo?: readonly string[] | null | undefined;
    }
  | { type: 'quest.setStatus'; questId: string; status: 'active' | 'completed' | 'failed' }
  | {
      type: 'stability.applyAction';
      questId: string;
      tag: string;
      count?: number | undefined;
      reason?: string | undefined;
    }
  | { type: 'stability.nudge'; questId: string; delta: number; reason?: string | undefined }
  | {
      type: 'skillDef.define';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      rarity: string;
      tags?: readonly string[] | undefined;
      description?: string | undefined;
      flavor?: string | undefined;
      /** GM-only effects text. */
      effects?: string | undefined;
    }
  | {
      type: 'skillDef.edit';
      skillDefId: string;
      name?: string | undefined;
      rarity?: string | undefined;
      tags?: readonly string[] | undefined;
      description?: string | undefined;
      flavor?: string | undefined;
      effects?: string | undefined;
    }
  | {
      type: 'classDef.define';
      /** Optional; a fresh id is generated when omitted. */
      id?: string | undefined;
      name: string;
      description?: string | undefined;
      skills: readonly { name: string; rarity: string }[];
      weights: Readonly<Record<string, number>>;
    }
  | {
      type: 'classDef.edit';
      classDefId: string;
      name?: string | undefined;
      description?: string | undefined;
      skills?: readonly { name: string; rarity: string }[] | undefined;
      weights?: Readonly<Record<string, number>> | undefined;
    }
  | {
      type: 'raceDef.define';
      id?: string | undefined;
      name: string;
      description?: string | undefined;
    }
  | {
      type: 'raceDef.edit';
      raceDefId: string;
      name?: string | undefined;
      description?: string | undefined;
    }
  | {
      type: 'professionDef.define';
      id?: string | undefined;
      name: string;
      description?: string | undefined;
      skills?: readonly { name: string; rarity: string }[] | undefined;
    }
  | {
      type: 'professionDef.edit';
      professionDefId: string;
      name?: string | undefined;
      description?: string | undefined;
      skills?: readonly { name: string; rarity: string }[] | undefined;
    }
  /** Adds every default library entry whose name the campaign's libraries lack (M4.2). */
  | { type: 'library.seedDefaults' }
  | {
      type: 'entity.define';
      /** Optional; a fresh id is generated when omitted. */
      entityId?: string | undefined;
      /** The GM's own name; never sent to players. */
      name: string;
      /** What players see in their Identify list; defaults to `name`. */
      label?: string | undefined;
      tiers: readonly { minRarity: string; text: string }[];
      /** Characters who know it from the start; default none. */
      knownBy?: readonly string[] | undefined;
      /** MQ.8: grade id and level (both or neither) for the Identify range. */
      grade?: string | null | undefined;
      level?: number | null | undefined;
      /** M7.2 bestiary (GM-only): stat id → value, or null for none. */
      stats?: Readonly<Record<string, number>> | null | undefined;
      /** M7.2 bestiary (GM-only) notes. */
      notes?: string | undefined;
    }
  | {
      type: 'entity.edit';
      entityId: string;
      name?: string | undefined;
      label?: string | undefined;
      tiers?: readonly { minRarity: string; text: string }[] | undefined;
      grade?: string | null | undefined;
      level?: number | null | undefined;
      stats?: Readonly<Record<string, number>> | null | undefined;
      notes?: string | undefined;
    }
  | {
      type: 'entity.reveal';
      entityId: string;
      /** Omitted or null = every character who does not know it yet. */
      characterIds?: readonly string[] | null | undefined;
    }
  /** M7.4: turn the hunger tracker on or off, or rename its steps. Omitted fields stay. */
  | {
      type: 'hunger.configure';
      enabled?: boolean | undefined;
      steps?: readonly string[] | undefined;
    }
  | {
      /**
       * M7.4: set these characters' hunger to `level`, or move it by `delta`
       * (clamped to the steps). Give exactly one.
       */
      type: 'hunger.set';
      characterIds: readonly string[];
      level?: number | undefined;
      delta?: number | undefined;
    }
  | {
      type: 'region.define';
      regionId?: string | undefined;
      name: string;
      notes?: string | undefined;
    }
  | { type: 'region.edit'; regionId: string; name?: string | undefined; notes?: string | undefined }
  /** M7.4: the party is now in this region (null: none set). */
  | { type: 'region.setCurrent'; regionId: string | null }
  | {
      type: 'faction.define';
      factionId?: string | undefined;
      name: string;
      regionId?: string | null | undefined;
      members?: number | null | undefined;
      standing?: string | undefined;
      notes?: string | undefined;
    }
  | {
      type: 'faction.edit';
      factionId: string;
      name?: string | undefined;
      regionId?: string | null | undefined;
      members?: number | null | undefined;
      standing?: string | undefined;
      notes?: string | undefined;
    }
  | { type: 'campaign.advanceDay'; days?: number | undefined }
  | { type: 'rules.migrate'; migration: 'xpOverflow' }
  /** M4.9: replaces the campaign's rules with an edited copy (validated). */
  | { type: 'rules.set'; rules: unknown }
  /** M4.9: puts the rules back to the DESIGN defaults. */
  | { type: 'rules.reset' }
  /** Starts a play session (M4.3); the id is generated when omitted. */
  | { type: 'session.start'; sessionId?: string | undefined }
  /** Ends the running play session. */
  | { type: 'session.end' }
  | { type: 'event.undo'; eventId: string };

export interface StatBonusInput {
  stat: string;
  flat?: number | undefined;
  percent?: number | undefined;
}

export interface BundleInput {
  currency?: number | undefined;
  items?: Readonly<Record<string, number>> | undefined;
}

const bundleOf = (b: BundleInput) => ({ currency: b.currency ?? 0, items: b.items ?? {} });

/** Everything impure is injected: who acts, when, and how ids are made. */
export interface CommandContext {
  readonly actor: Actor;
  readonly sessionId: string | null;
  /** Returns the current time as an ISO-8601 UTC string. */
  readonly now: () => string;
  /** Returns a fresh unique id. */
  readonly newId: () => string;
  /** Random source in [0, 1) for rolls (M6.2); a roll is refused without one. */
  readonly random?: (() => number) | undefined;
}

const anyRecord = z.record(z.string(), z.unknown());
/** Shape check only; the event payload schemas and the reducer do the real validation. */
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('campaign.create') }),
  z.object({ type: z.literal('character.create'), classSkills: z.array(z.unknown()) }),
  z.object({ type: z.literal('character.rename') }),
  z.object({ type: z.literal('character.setPortrait') }),
  z.object({ type: z.literal('character.grantProfession') }),
  z.object({ type: z.literal('profession.choose') }),
  z.object({ type: z.literal('profession.withdrawOffer') }),
  z.object({ type: z.literal('title.award') }),
  z.object({ type: z.literal('titleDef.define') }),
  z.object({ type: z.literal('titleDef.edit') }),
  z.object({ type: z.literal('character.setPools'), pools: anyRecord }),
  z.object({ type: z.literal('character.setStats'), stats: anyRecord }),
  z.object({
    type: z.literal('xp.award'),
    amount: z.number(),
    participants: z.array(z.object({ characterId: z.string() })).min(1),
  }),
  z.object({ type: z.literal('freePoints.assign'), allocation: anyRecord }),
  z.object({ type: z.literal('freePoints.override'), allocation: anyRecord.nullable() }),
  z.object({
    type: z.literal('system.broadcast'),
    text: z.string(),
    characterIds: z.array(z.string()).nullable().optional(),
  }),
  z.object({
    type: z.literal('broadcast.schedule'),
    text: z.string(),
    characterIds: z.array(z.string()).nullable().optional(),
    day: z.number(),
  }),
  z.object({ type: z.literal('broadcast.unschedule'), id: z.string() }),
  z.object({ type: z.literal('item.define') }),
  z.object({ type: z.literal('item.edit') }),
  z.object({ type: z.literal('lootTable.define'), entries: z.array(z.unknown()) }),
  z.object({ type: z.literal('lootTable.edit'), entries: z.array(z.unknown()).optional() }),
  z.object({ type: z.literal('loot.roll') }),
  z.object({ type: z.literal('holdings.adjust') }),
  z.object({ type: z.literal('gift.give') }),
  z.object({ type: z.literal('item.equip') }),
  z.object({ type: z.literal('item.unequip') }),
  z.object({ type: z.literal('trade.propose'), give: anyRecord, get: anyRecord }),
  z.object({ type: z.literal('trade.accept') }),
  z.object({ type: z.literal('trade.decline') }),
  z.object({ type: z.literal('trade.cancel') }),
  z.object({ type: z.literal('practice.log') }),
  z.object({ type: z.literal('practice.edit') }),
  z.object({ type: z.literal('practice.remove') }),
  z.object({ type: z.literal('practice.review') }),
  z.object({ type: z.literal('note.create') }),
  z.object({ type: z.literal('note.edit') }),
  z.object({ type: z.literal('note.delete') }),
  z.object({ type: z.literal('skill.nickname') }),
  z.object({ type: z.literal('skill.describe') }),
  z.object({ type: z.literal('skill.setUnique') }),
  z.object({ type: z.literal('skill.useLibraryText') }),
  z.object({ type: z.literal('skill.awardMark') }),
  z.object({ type: z.literal('skill.upgrade') }),
  z.object({ type: z.literal('skill.merge'), skills: z.array(z.unknown()) }),
  z.object({ type: z.literal('skill.answerMerge') }),
  z.object({ type: z.literal('selection.offer'), options: z.array(z.unknown()) }),
  z.object({ type: z.literal('selection.choose') }),
  z.object({ type: z.literal('selection.withdrawOption') }),
  z.object({
    type: z.literal('evolution.release'),
    options: z.array(z.record(z.string(), z.unknown())),
    rerate: z.record(z.string(), z.string()).optional(),
    rerateApproved: z.boolean().optional(),
  }),
  z.object({ type: z.literal('evolution.choose') }),
  z.object({ type: z.literal('clock.create') }),
  z.object({ type: z.literal('clock.tick') }),
  z.object({ type: z.literal('clock.remove') }),
  z.object({ type: z.literal('contest.share'), a: anyRecord, b: anyRecord }),
  z.object({ type: z.literal('montage.offer'), characterIds: z.array(z.string()) }),
  z.object({ type: z.literal('montage.focus') }),
  z.object({ type: z.literal('montage.close') }),
  z.object({ type: z.literal('quest.create') }),
  z.object({ type: z.literal('quest.edit') }),
  z.object({ type: z.literal('quest.setStatus') }),
  z.object({ type: z.literal('stability.applyAction') }),
  z.object({ type: z.literal('stability.nudge') }),
  z.object({ type: z.literal('skillDef.define'), tags: z.array(z.string()).optional() }),
  z.object({ type: z.literal('skillDef.edit'), tags: z.array(z.string()).optional() }),
  z.object({
    type: z.literal('classDef.define'),
    skills: z.array(z.unknown()),
    weights: anyRecord,
  }),
  z.object({
    type: z.literal('classDef.edit'),
    skills: z.array(z.unknown()).optional(),
    weights: anyRecord.optional(),
  }),
  z.object({ type: z.literal('raceDef.define') }),
  z.object({ type: z.literal('raceDef.edit') }),
  z.object({ type: z.literal('professionDef.define'), skills: z.array(z.unknown()).optional() }),
  z.object({ type: z.literal('professionDef.edit'), skills: z.array(z.unknown()).optional() }),
  z.object({ type: z.literal('library.seedDefaults') }),
  z.object({ type: z.literal('entity.define'), tiers: z.array(z.unknown()) }),
  z.object({ type: z.literal('entity.edit') }),
  z.object({
    type: z.literal('entity.reveal'),
    characterIds: z.array(z.string()).nullable().optional(),
  }),
  z.object({ type: z.literal('hunger.configure'), steps: z.array(z.string()).optional() }),
  z.object({ type: z.literal('hunger.set'), characterIds: z.array(z.string()) }),
  z.object({ type: z.literal('region.define') }),
  z.object({ type: z.literal('region.edit') }),
  z.object({ type: z.literal('region.setCurrent') }),
  z.object({ type: z.literal('faction.define') }),
  z.object({ type: z.literal('faction.edit') }),
  z.object({ type: z.literal('campaign.advanceDay') }),
  z.object({ type: z.literal('rules.migrate'), migration: z.literal('xpOverflow') }),
  z.object({ type: z.literal('rules.set'), rules: z.unknown() }),
  z.object({ type: z.literal('rules.reset') }),
  z.object({ type: z.literal('session.start'), sessionId: z.string().optional() }),
  z.object({ type: z.literal('session.end') }),
  z.object({ type: z.literal('event.undo') }),
]);

export type CommandType = Command['type'];

/**
 * Commands a player may issue, and only for their own character (free points
 * now; nicknames, notes, gifts... as they land). Every
 * other command needs the GM or the system (M2.2 checks the GM key).
 */
export const PLAYER_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  'freePoints.assign',
  'gift.give',
  'item.equip',
  'item.unequip',
  'trade.propose',
  'trade.accept',
  'trade.decline',
  'trade.cancel',
  'practice.log',
  'montage.focus',
  'note.create',
  'note.edit',
  'note.delete',
  'skill.nickname',
  'skill.answerMerge',
  'selection.choose',
  'evolution.choose',
  'profession.choose',
]);

/** Returns why the actor may not issue the command, or null when allowed. */
export function authorize(
  command: Command,
  actor: Actor,
  playerCommands: ReadonlySet<CommandType> = PLAYER_COMMANDS,
): string | null {
  if (actor.role !== 'player') return null;
  if (!playerCommands.has(command.type)) return `only the GM can ${command.type}`;
  const target = 'characterId' in command ? command.characterId : undefined;
  const own = actor.characterId;
  if (typeof target !== 'string' || typeof own !== 'string' || target !== own) {
    return 'players may only act on their own character';
  }
  return null;
}

function awardPayload(command: Extract<Command, { type: 'xp.award' }>) {
  const { participants } = command;
  if (participants.some((p) => p.share !== undefined && p.weight !== undefined)) {
    throw new EventRejectedError('A participant has both a share and a weight; give one');
  }
  const manual = participants.filter((p) => p.share !== undefined).length;
  let shares: { characterId: string; share: number }[];
  if (manual === participants.length) {
    shares = participants.map((p) => ({ characterId: p.characterId, share: p.share as number }));
  } else if (manual > 0) {
    throw new EventRejectedError('Give every participant a share, or none');
  } else {
    try {
      const parts = largestRemainderSplit(
        command.amount,
        participants.map((p) => p.weight ?? 1),
      );
      shares = participants.map((p, i) => ({
        characterId: p.characterId,
        share: parts[i] as number,
      }));
    } catch (error) {
      if (error instanceof CharacterRuleError) throw new EventRejectedError(error.message);
      throw error;
    }
  }
  return {
    track: command.track,
    amount: command.amount,
    shares,
    enemyLevel: command.enemyLevel ?? null,
    ...(command.enemyGrade !== null && command.enemyGrade !== undefined
      ? { enemyGrade: command.enemyGrade }
      : {}),
    reason: command.reason ?? '',
  };
}

/** The character a choice is made for, if it exists (choices default to what is pending). */
/** The release's full re-rating: every skill as it goes in, plus the GM's settings (MT.1). */
function rerateFor(
  campaign: Campaign,
  characterId: string,
  overrides: Readonly<Record<string, string>>,
): { skill: string; rarity: string }[] {
  const character = pendingOf(campaign, characterId);
  const rules = campaign.state?.rules;
  if (!character || !rules) return [];
  const known = new Set(character.skills.map((s) => s.name));
  // A name the character lacks stays in the list, so the release is refused.
  const extra = Object.entries(overrides)
    .filter(([name]) => !known.has(name))
    .map(([skill, rarity]) => ({ skill, rarity }));
  return [...keptRerate(character, overrides), ...extra];
}

function pendingOf(campaign: Campaign, characterId: string) {
  const characters = campaign.state?.characters;
  return characters && Object.prototype.hasOwnProperty.call(characters, characterId)
    ? characters[characterId]
    : undefined;
}

function lootTableOf(campaign: Campaign, tableId: string): LootTable {
  const tables = campaign.state?.lootTables;
  const table =
    tables && Object.prototype.hasOwnProperty.call(tables, tableId) ? tables[tableId] : undefined;
  if (!table) throw new EventRejectedError(`No loot table "${tableId}"`);
  return table;
}

/** The default library entries the campaign lacks (`missingDefaultEntries`), with fresh ids. */
function defaultSeed(campaign: Campaign, ctx: CommandContext) {
  const state = campaign.state;
  if (!state) throw new EventRejectedError('Create a campaign first');
  const lacking = missingDefaultEntries(state);
  const withIds = <T extends object>(list: readonly T[]) =>
    list.map((d) => ({ id: ctx.newId(), ...d }));
  const seed = {
    skills: withIds(lacking.skills),
    classes: withIds(lacking.classes),
    races: withIds(lacking.races),
    professions: withIds(lacking.professions),
  };
  if (Object.values(seed).every((list) => list.length === 0)) {
    throw new EventRejectedError('The libraries already hold every default entry');
  }
  return seed;
}

export type CommandResult =
  { ok: true; campaign: Campaign; events: DomainEvent[] } | { ok: false; error: string };

function toEvent(
  command: Command,
  ctx: CommandContext,
  campaign: Campaign,
): { type: EventType; payload: unknown } {
  switch (command.type) {
    case 'campaign.create':
      return { type: 'campaign.created', payload: { name: command.name, rules: command.rules } };
    case 'character.create': {
      const payload: Record<string, unknown> = {
        id: command.id ?? ctx.newId(),
        name: command.name,
        className: command.className,
        classSkills: command.classSkills,
      };
      if (command.race !== undefined) payload['race'] = command.race;
      if (command.classWeights !== undefined) payload['classWeights'] = command.classWeights;
      if (command.portrait !== undefined) payload['portrait'] = command.portrait;
      return { type: 'character.created', payload };
    }
    case 'character.rename':
      return {
        type: 'character.renamed',
        payload: { characterId: command.characterId, name: command.name },
      };
    case 'character.setPortrait':
      return {
        type: 'character.portraitSet',
        payload: { characterId: command.characterId, portrait: command.portrait },
      };
    case 'character.grantProfession':
      return {
        type: 'character.professionGranted',
        payload: { characterId: command.characterId, profession: command.profession },
      };
    case 'profession.withdrawOffer':
      return {
        type: 'profession.offerWithdrawn',
        payload: { characterId: command.characterId, profession: command.profession },
      };
    case 'profession.choose':
      return {
        type: 'profession.chosen',
        payload: { characterId: command.characterId, profession: command.profession },
      };
    case 'title.award': {
      // M6.4: a name matching a library title (any case) is awarded as the
      // library spells it. The payload schema trims and checks it; a
      // non-string is refused there.
      const def =
        typeof command.title === 'string' && campaign.state
          ? titleDefByName(
              campaign.state.titleLibrary,
              campaign.state.titleLibraryOrder,
              command.title,
            )
          : undefined;
      return {
        type: 'title.awarded',
        payload: { characterId: command.characterId, title: def?.name ?? command.title },
      };
    }
    case 'character.setPools':
      return {
        type: 'character.poolsSet',
        payload: { characterId: command.characterId, pools: command.pools },
      };
    case 'character.setStats':
      return {
        type: 'character.statsSet',
        payload: { characterId: command.characterId, stats: command.stats },
      };
    case 'xp.award': {
      const payload = awardPayload(command);
      // Record each share's race level (M7.3, D71 gap a) so the above-level
      // bonus is priced now, not re-derived when an earlier event is undone.
      const state = campaign.state;
      const shares = payload.shares.map((s) => {
        const c =
          state && Object.prototype.hasOwnProperty.call(state.characters, s.characterId)
            ? state.characters[s.characterId]
            : undefined;
        return state && c && payload.enemyLevel !== null
          ? { ...s, raceLevel: raceLevel(state.rules, c) }
          : s;
      });
      return { type: 'xp.awarded', payload: { ...payload, shares } };
    }
    case 'freePoints.assign':
      return {
        type: 'freePoints.assigned',
        payload: {
          characterId: command.characterId,
          raceLevel: command.raceLevel,
          allocation: command.allocation,
        },
      };
    case 'freePoints.override':
      return {
        type: 'freePoints.overridden',
        payload: {
          characterId: command.characterId,
          raceLevel: command.raceLevel,
          allocation: command.allocation,
        },
      };
    case 'system.broadcast':
      return {
        type: 'system.broadcast',
        payload: { text: command.text, characterIds: command.characterIds ?? null },
      };
    case 'broadcast.schedule':
      return {
        type: 'broadcast.scheduled',
        payload: {
          id: command.id ?? ctx.newId(),
          text: command.text,
          characterIds: command.characterIds ?? null,
          day: command.day,
        },
      };
    case 'broadcast.unschedule':
      return { type: 'broadcast.unscheduled', payload: { id: command.id } };
    case 'titleDef.define':
      return {
        type: 'titleDef.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          text: command.text ?? '',
          bonuses: command.bonuses ?? [],
        },
      };
    case 'titleDef.edit': {
      const { titleDefId, name, text, bonuses } = command;
      return { type: 'titleDef.edited', payload: { titleDefId, name, text, bonuses } };
    }
    case 'item.define':
      return {
        type: 'item.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          rarity: command.rarity,
          description: command.description ?? '',
          slot: command.slot ?? null,
          bonuses: command.bonuses ?? [],
        },
      };
    case 'item.edit': {
      const { itemId, name, rarity, description, slot, bonuses } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'item.edited',
        payload: { itemId, name, rarity, description, slot, bonuses },
      };
    }
    case 'lootTable.define':
      return {
        type: 'lootTable.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          rolls: command.rolls ?? 1,
          entries: command.entries,
        },
      };
    case 'lootTable.edit': {
      const { tableId, name, rolls, entries } = command;
      return { type: 'lootTable.edited', payload: { tableId, name, rolls, entries } };
    }
    case 'loot.roll': {
      const table = lootTableOf(campaign, command.tableId);
      if (!ctx.random) throw new EventRejectedError('No random source to roll with');
      let picks;
      let bundle;
      try {
        picks = rollLoot(table, ctx.random);
        bundle = lootBundle(table, picks);
      } catch (error) {
        if (error instanceof EconomyRuleError) throw new EventRejectedError(error.message);
        throw error;
      }
      return {
        type: 'loot.rolled',
        payload: { tableId: table.id, characterId: command.characterId ?? null, bundle, picks },
      };
    }
    case 'holdings.adjust':
      return {
        type: 'holdings.adjusted',
        payload: {
          characterId: command.characterId,
          currency: command.currency ?? 0,
          items: command.items ?? {},
          reason: command.reason ?? '',
        },
      };
    case 'gift.give':
      return {
        type: 'gift.given',
        payload: {
          characterId: command.characterId,
          to: command.to,
          bundle: bundleOf(command),
        },
      };
    case 'item.equip':
      return {
        type: 'item.equipped',
        payload: {
          characterId: command.characterId,
          itemId: command.itemId,
          slot: command.slot,
          index: command.index ?? 0,
        },
      };
    case 'item.unequip':
      return {
        type: 'item.unequipped',
        payload: {
          characterId: command.characterId,
          slot: command.slot,
          index: command.index ?? 0,
        },
      };
    case 'trade.propose':
      return {
        type: 'trade.proposed',
        payload: {
          tradeId: command.tradeId ?? ctx.newId(),
          characterId: command.characterId,
          to: command.to,
          give: bundleOf(command.give),
          get: bundleOf(command.get),
        },
      };
    case 'trade.accept':
    case 'trade.decline':
    case 'trade.cancel': {
      const type = (
        {
          'trade.accept': 'trade.accepted',
          'trade.decline': 'trade.declined',
          'trade.cancel': 'trade.cancelled',
        } as const
      )[command.type];
      return { type, payload: { tradeId: command.tradeId, characterId: command.characterId } };
    }
    case 'practice.log':
      return {
        type: 'practice.logged',
        payload: {
          characterId: command.characterId,
          action: command.action,
          skills: command.skills ?? [],
          stat: command.stat ?? null,
          tags: command.tags ?? [],
          source: command.source ?? (ctx.actor.role === 'player' ? 'player' : 'gm'),
        },
      };
    case 'practice.edit': {
      const { entryId, action, skills, stat } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return { type: 'practice.edited', payload: { entryId, action, skills, stat } };
    }
    case 'practice.remove':
      return { type: 'practice.removed', payload: { entryId: command.entryId } };
    case 'practice.review':
      return { type: 'practice.reviewed', payload: { entryIds: [...command.entryIds] } };
    case 'note.create':
      return {
        type: 'note.created',
        payload: {
          noteId: command.noteId ?? ctx.newId(),
          characterId: command.characterId,
          kind: command.kind,
          title: command.title ?? '',
          body: command.body ?? '',
          tags: command.tags ?? [],
          shareable: command.shareable ?? command.kind === 'party',
        },
      };
    case 'note.edit': {
      const { noteId, characterId, title, body, tags, shareable } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'note.edited',
        payload: { noteId, characterId, title, body, tags, shareable },
      };
    }
    case 'note.delete':
      return {
        type: 'note.deleted',
        payload: { noteId: command.noteId, characterId: command.characterId },
      };
    case 'skill.nickname':
      return {
        type: 'skill.nicknamed',
        payload: {
          characterId: command.characterId,
          skill: command.skill,
          nickname: command.nickname,
        },
      };
    case 'skill.describe':
      return {
        type: 'skill.described',
        payload: {
          characterId: command.characterId,
          skill: command.skill,
          description: command.description,
          flavor: command.flavor,
        },
      };
    case 'skill.useLibraryText':
      return {
        type: 'skill.libraryTextUsed',
        payload: { characterId: command.characterId, skill: command.skill },
      };
    case 'skill.setUnique':
      return {
        type: 'skill.uniqueSet',
        payload: { characterId: command.characterId, skill: command.skill, unique: command.unique },
      };
    case 'skill.awardMark': {
      const session = command.session ?? campaign.state?.currentSession ?? ctx.sessionId;
      if (session === null) throw new EventRejectedError('A mark needs a play session');
      return {
        type: 'skill.markAwarded',
        payload: { characterId: command.characterId, skill: command.skill, session },
      };
    }
    case 'skill.upgrade':
      return {
        type: 'skill.upgraded',
        payload: { characterId: command.characterId, skill: command.skill },
      };
    case 'skill.merge':
      // MT.2 (Q62): the GM sends the merge as an offer; the player answers it.
      return {
        type: 'skill.mergeOffered',
        payload: {
          characterId: command.characterId,
          offerId: command.offerId ?? ctx.newId(),
          skills: command.skills,
          name: command.name,
        },
      };
    case 'skill.answerMerge':
      return {
        type: 'skill.mergeAnswered',
        payload: {
          characterId: command.characterId,
          offerId: command.offerId,
          accept: command.accept,
        },
      };
    case 'selection.offer':
      return {
        type: 'selection.offered',
        payload: {
          characterId: command.characterId,
          level: command.level,
          options: command.options.map((o) => ({
            name: o.name,
            rarity: o.rarity,
            kind: o.kind ?? 'class',
            description: o.description ?? '',
          })),
        },
      };
    case 'selection.choose':
      return {
        type: 'selection.chosen',
        payload: {
          characterId: command.characterId,
          level: command.level,
          skill: command.skill,
          offerId:
            command.offerId ??
            pendingOf(campaign, command.characterId)?.selections.find(
              (s) => s.level === command.level,
            )?.offerId,
        },
      };
    case 'selection.withdrawOption':
      return {
        type: 'selection.optionWithdrawn',
        payload: { characterId: command.characterId, skill: command.skill },
      };
    case 'evolution.release':
      if (command.rerateApproved !== true) {
        throw new EventRejectedError(
          "Approve the skill re-rating first: the GM sets each kept skill's rarity and approves the list (DESIGN §6)",
        );
      }
      return {
        type: 'evolution.released',
        payload: {
          characterId: command.characterId,
          options: command.options.map((o, i) => ({
            id: o.id ?? `o${i + 1}`,
            className: o.className,
            description: o.description ?? '',
            transforms: o.transforms ?? [],
            classWeights: o.classWeights ?? null,
            statBonus: o.statBonus ?? {},
          })),
          professions: command.professions ?? [],
          rerate: rerateFor(campaign, command.characterId, command.rerate ?? {}),
          rerateApproved: true,
        },
      };
    case 'evolution.choose':
      return {
        type: 'evolution.chosen',
        payload: {
          characterId: command.characterId,
          optionId: command.optionId,
          profession: command.profession ?? null,
          releaseId:
            command.releaseId ?? pendingOf(campaign, command.characterId)?.evolution?.releaseId,
        },
      };
    case 'clock.create':
      return {
        type: 'clock.created',
        payload: {
          clockId: command.clockId ?? ctx.newId(),
          name: command.name,
          segments: command.segments,
        },
      };
    case 'clock.tick':
      return {
        type: 'clock.ticked',
        payload: { clockId: command.clockId, result: command.result, amount: command.amount ?? 1 },
      };
    case 'montage.offer':
      return {
        type: 'montage.offered',
        payload: {
          montageId: command.montageId ?? ctx.newId(),
          clockId: command.clockId,
          label: command.label ?? 'Montage',
          characterIds: [...command.characterIds],
        },
      };
    case 'montage.focus':
      return {
        type: 'montage.focused',
        payload: {
          montageId: command.montageId,
          characterId: command.characterId,
          action: command.action,
          skills: command.skills ?? [],
          stat: command.stat ?? null,
        },
      };
    case 'montage.close':
      return { type: 'montage.closed', payload: { montageId: command.montageId } };
    case 'clock.remove':
      return { type: 'clock.removed', payload: { clockId: command.clockId } };
    case 'contest.share': {
      const rules = campaign.state?.rules;
      if (!rules) throw new EventRejectedError('No campaign yet');
      const mode = command.mode ?? rules.resolution.gradeGapMode;
      let result;
      try {
        result = settleContest(rules, command.a, command.b, mode, command.roll);
      } catch (error) {
        if (error instanceof CharacterRuleError) throw new EventRejectedError(error.message);
        throw error;
      }
      const { yours, theirs, chance, walled, success } = result;
      return {
        type: 'contest.shared',
        payload: {
          contestId: command.contestId ?? ctx.newId(),
          a: command.a,
          b: command.b,
          mode,
          roll: command.roll,
          yours,
          theirs,
          chance,
          walled,
          success,
        },
      };
    }
    case 'quest.create': {
      const st = command.stability;
      return {
        type: 'quest.created',
        payload: {
          questId: command.questId ?? ctx.newId(),
          title: command.title,
          text: command.text ?? '',
          visible: command.visible ?? true,
          days: command.days ?? null,
          stability:
            st === null || st === undefined
              ? null
              : {
                  initial: st.initial ?? null,
                  visible:
                    st.visible ??
                    campaign.state?.rules.stability.visibleToPlayersByDefault ??
                    false,
                  rules: st.rules ?? {},
                },
          noticeTo:
            command.noticeTo === undefined || command.noticeTo === null
              ? null
              : [...command.noticeTo],
        },
      };
    }
    case 'quest.edit': {
      const { questId, title, text, visible, days, stabilityVisible, stabilityRules } = command;
      const noticeTo =
        command.noticeTo === undefined || command.noticeTo === null
          ? command.noticeTo
          : [...command.noticeTo];
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'quest.edited',
        payload: {
          questId,
          title,
          text,
          visible,
          days,
          stabilityVisible,
          stabilityRules,
          noticeTo,
        },
      };
    }
    case 'quest.setStatus':
      return {
        type: 'quest.statusSet',
        payload: { questId: command.questId, status: command.status },
      };
    case 'skillDef.define':
      return {
        type: 'skillDef.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          rarity: command.rarity,
          tags: normalizeTags(command.tags ?? []),
          description: command.description ?? '',
          flavor: command.flavor ?? '',
          effects: command.effects ?? '',
        },
      };
    case 'skillDef.edit': {
      const { skillDefId, name, rarity, tags, description, flavor, effects } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'skillDef.edited',
        payload: {
          skillDefId,
          name,
          rarity,
          tags: tags === undefined ? undefined : normalizeTags(tags),
          description,
          flavor,
          effects,
        },
      };
    }
    case 'classDef.define':
      return {
        type: 'classDef.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          description: command.description ?? '',
          skills: command.skills,
          weights: command.weights,
        },
      };
    case 'classDef.edit': {
      const { classDefId, name, description, skills, weights } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'classDef.edited',
        payload: { classDefId, name, description, skills, weights },
      };
    }
    case 'raceDef.define':
      return {
        type: 'raceDef.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          description: command.description ?? '',
        },
      };
    case 'raceDef.edit': {
      const { raceDefId, name, description } = command;
      return { type: 'raceDef.edited', payload: { raceDefId, name, description } };
    }
    case 'professionDef.define':
      return {
        type: 'professionDef.defined',
        payload: {
          id: command.id ?? ctx.newId(),
          name: command.name,
          description: command.description ?? '',
          skills: command.skills ?? [],
        },
      };
    case 'professionDef.edit': {
      const { professionDefId, name, description, skills } = command;
      return {
        type: 'professionDef.edited',
        payload: { professionDefId, name, description, skills },
      };
    }
    case 'library.seedDefaults':
      return { type: 'library.seeded', payload: defaultSeed(campaign, ctx) };
    case 'entity.define':
      return {
        type: 'entity.defined',
        payload: {
          entityId: command.entityId ?? ctx.newId(),
          name: command.name,
          label: command.label ?? command.name,
          tiers: command.tiers.map((t) => ({ minRarity: t.minRarity, text: t.text })),
          knownBy: command.knownBy ?? [],
          grade: command.grade ?? null,
          level: command.level ?? null,
          stats: command.stats ? { ...command.stats } : null,
          notes: command.notes ?? '',
        },
      };
    case 'entity.edit': {
      const { entityId, name, label, tiers, grade, level, notes } = command;
      const stats = command.stats ? { ...command.stats } : command.stats;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'entity.edited',
        payload: {
          entityId,
          name,
          label,
          tiers: tiers?.map((t) => ({ minRarity: t.minRarity, text: t.text })),
          grade,
          level,
          stats,
          notes,
        },
      };
    }
    case 'entity.reveal': {
      const state = campaign.state;
      const entity =
        state && Object.prototype.hasOwnProperty.call(state.entities, command.entityId)
          ? state.entities[command.entityId]
          : undefined;
      const known = entity?.knownBy ?? [];
      const characterIds =
        command.characterIds ?? (state?.characterOrder ?? []).filter((id) => !known.includes(id));
      if (characterIds.length === 0 && entity !== undefined) {
        throw new EventRejectedError('Every character already knows this entity');
      }
      return { type: 'entity.revealed', payload: { entityId: command.entityId, characterIds } };
    }
    case 'stability.applyAction':
      return {
        type: 'stability.actionApplied',
        payload: {
          questId: command.questId,
          // Rule tags are stored lower-case and trimmed (D67).
          tag: command.tag.trim().toLowerCase(),
          count: command.count ?? 1,
          reason: command.reason ?? '',
        },
      };
    case 'stability.nudge':
      return {
        type: 'stability.nudged',
        payload: { questId: command.questId, delta: command.delta, reason: command.reason ?? '' },
      };
    case 'hunger.configure': {
      const state = campaign.state;
      if (!state) throw new EventRejectedError('Create a campaign first');
      return {
        type: 'hunger.configured',
        payload: {
          enabled: command.enabled ?? state.hunger.enabled,
          steps: (command.steps ?? state.hunger.steps).map((s) => s.trim()),
        },
      };
    }
    case 'hunger.set': {
      const state = campaign.state;
      if (!state) throw new EventRejectedError('Create a campaign first');
      if ((command.level === undefined) === (command.delta === undefined)) {
        throw new EventRejectedError('Give a hunger level or a change, not both');
      }
      const top = state.hunger.steps.length - 1;
      const levels: Record<string, number> = {};
      for (const id of command.characterIds) {
        const next = command.level ?? hungerLevel(state.hunger, id) + (command.delta ?? 0);
        levels[id] = Math.min(Math.max(Math.trunc(next), 0), top);
      }
      return { type: 'hunger.levelsSet', payload: { levels } };
    }
    case 'region.define':
      return {
        type: 'region.defined',
        payload: {
          regionId: command.regionId ?? ctx.newId(),
          name: command.name,
          notes: command.notes ?? '',
        },
      };
    case 'region.edit':
      return {
        type: 'region.edited',
        payload: { regionId: command.regionId, name: command.name, notes: command.notes },
      };
    case 'region.setCurrent':
      return { type: 'region.currentSet', payload: { regionId: command.regionId } };
    case 'faction.define':
      return {
        type: 'faction.defined',
        payload: {
          factionId: command.factionId ?? ctx.newId(),
          name: command.name,
          regionId: command.regionId ?? null,
          members: command.members ?? null,
          standing: command.standing ?? '',
          notes: command.notes ?? '',
        },
      };
    case 'faction.edit': {
      const { factionId, name, regionId, members, standing, notes } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'faction.edited',
        payload: { factionId, name, regionId, members, standing, notes },
      };
    }
    case 'campaign.advanceDay':
      return { type: 'campaign.dayAdvanced', payload: { days: command.days ?? 1 } };
    case 'rules.migrate': {
      const state = campaign.state;
      if (!state || state.rules.xp.overflow) {
        throw new EventRejectedError('XP overflow is already on');
      }
      return {
        type: 'rules.migrated',
        payload: { migration: 'xpOverflow', banked: bankedXp(state) },
      };
    }
    case 'rules.set':
      return { type: 'rules.edited', payload: { rules: command.rules } };
    case 'rules.reset':
      return { type: 'rules.edited', payload: { rules: defaultRules() } };
    case 'session.start':
      if ((campaign.state?.currentSession ?? null) !== null) {
        throw new EventRejectedError('A session is already running; end it first');
      }
      return { type: 'session.started', payload: { sessionId: command.sessionId ?? ctx.newId() } };
    case 'session.end': {
      const running = campaign.state?.currentSession ?? null;
      if (running === null) throw new EventRejectedError('No session is running');
      return { type: 'session.ended', payload: { sessionId: running } };
    }
    case 'event.undo':
      return { type: 'event.undone', payload: { eventId: command.eventId } };
  }
}

/** One message for an unknown item and one the character does not hold (QF.2). */
export const ITEM_NOT_AVAILABLE = 'That item is not available';
/**
 * Accepting a trade when either side no longer has its part (QF.9): one
 * message that names nothing and shows no one's holdings.
 */
export const TRADE_NOT_POSSIBLE = 'That trade can no longer go through';

const countOf = (inventory: Readonly<Record<string, number>>, id: string): number =>
  Object.prototype.hasOwnProperty.call(inventory, id) ? (inventory[id] ?? 0) : 0;

/**
 * Items a command may name (QF.2): each side of a trade only what that side
 * holds now (the proposer's give, the counterparty's get); a character asking
 * the GM for items is refused (the GM offers items); gift and equip only held
 * items.
 * Unknown and not held read the same and name nothing, so a player cannot
 * probe the GM's item library. Checked on commands, not in the reducer, so
 * stored logs replay unchanged.
 */
function itemOutOfReach(state: NonNullable<Campaign['state']>, command: Command): string | null {
  const known = (id: string) => Object.prototype.hasOwnProperty.call(state.items, id);
  const inv = (who: string) =>
    Object.prototype.hasOwnProperty.call(state.holdings, who)
      ? (state.holdings[who]?.inventory ?? {})
      : {};
  const holds = (who: string, items: Readonly<Record<string, unknown>>) =>
    Object.entries(items).every(
      // A bad count reads like a missing item too, or the payload schema's
      // error would confirm that the id exists (QF.2 review).
      ([id, n]) =>
        typeof n === 'number' &&
        Number.isSafeInteger(n) &&
        n > 0 &&
        known(id) &&
        countOf(inv(who), id) >= n,
    );
  const asksOnlySeen = (who: string, items: Readonly<Record<string, unknown>>) => {
    const holdings = Object.prototype.hasOwnProperty.call(state.holdings, who)
      ? (state.holdings[who] ?? EMPTY_HOLDINGS)
      : EMPTY_HOLDINGS;
    const seen = itemsSeenBy(holdings, Object.values(state.trades), who);
    return Object.entries(items).every(
      ([id, n]) =>
        typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && known(id) && seen.has(id),
    );
  };
  if (command.type === 'item.equip') {
    return known(command.itemId) && countOf(inv(command.characterId), command.itemId) >= 1
      ? null
      : ITEM_NOT_AVAILABLE;
  }
  if (command.type === 'gift.give') {
    const giver = command.characterId;
    if (giver === null || !Object.prototype.hasOwnProperty.call(state.characters, giver)) {
      return null;
    }
    return holds(giver, command.items ?? {}) ? null : ITEM_NOT_AVAILABLE;
  }
  if (command.type === 'trade.propose') {
    // Malformed parties get the reducer's own message (they name no item).
    const isCharacter = (id: string | null) =>
      id === null || Object.prototype.hasOwnProperty.call(state.characters, id);
    if (command.characterId === command.to) return null;
    if (!isCharacter(command.characterId) || !isCharacter(command.to)) return null;
    const give = command.give.items ?? {};
    const get = command.get.items ?? {};
    if (command.characterId !== null && !holds(command.characterId, give))
      return ITEM_NOT_AVAILABLE;
    if (command.to === null && command.characterId !== null && Object.keys(get).length > 0) {
      return 'A trade with the GM can ask only for currency; the GM offers items';
    }
    if (command.characterId === null) {
      // The GM sees every inventory, so it may ask only for what is there.
      if (command.to !== null && !holds(command.to, get)) return ITEM_NOT_AVAILABLE;
    } else if (!asksOnlySeen(command.characterId, get)) {
      // A character's ask never depends on the counterparty's holdings (QF.9):
      // only items the proposer has seen, checked again on accept.
      return ITEM_NOT_AVAILABLE;
    }
  }
  if (command.type === 'trade.accept') {
    // Both sides must still hold their part; one message that names nothing (QF.9).
    const trade = Object.prototype.hasOwnProperty.call(state.trades, command.tradeId)
      ? state.trades[command.tradeId]
      : undefined;
    if (!trade || trade.status !== 'open' || command.characterId !== trade.to) return null;
    // Currency too: the reducer's message would show the other side's balance.
    const pays = (who: string, amount: number) =>
      (Object.prototype.hasOwnProperty.call(state.holdings, who)
        ? (state.holdings[who]?.currency ?? 0)
        : 0) >= amount;
    if (
      trade.from !== null &&
      !(holds(trade.from, trade.give.items) && pays(trade.from, trade.give.currency))
    )
      return TRADE_NOT_POSSIBLE;
    if (
      trade.to !== null &&
      !(holds(trade.to, trade.get.items) && pays(trade.to, trade.get.currency))
    )
      return TRADE_NOT_POSSIBLE;
  }
  return null;
}

/** Characters a note counts toward its author's `noteCharsPerCharacter` (QF.3). */
const noteChars = (note: {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
}): number => note.title.length + note.body.length + note.tags.reduce((n, t) => n + t.length, 0);

/**
 * Per-character caps from `rules.limits` (QF.3): notes written, their total
 * size, and open proposed trades. Only characters are capped (the GM is
 * trusted). Checked on commands, not in the reducer, so stored logs replay
 * unchanged and a GM can lower a cap without breaking a campaign.
 */
function overLimit(
  state: NonNullable<Campaign['state']>,
  command: Command,
  actor: Actor,
): string | null {
  const limits = state.rules.limits;
  if (command.type === 'practice.log' && actor.role === 'player') {
    const size =
      command.action.length +
      [...(command.skills ?? []), ...(command.tags ?? [])].reduce((n, t) => n + t.length, 0);
    if (size > limits.practiceEntryChars) {
      return `A practice entry can be at most ${limits.practiceEntryChars} characters`;
    }
    const logged = state.practice.filter((p) => p.characterId === command.characterId).length;
    if (logged >= limits.practiceEntriesPerCharacter) {
      return `Practice log is full (${limits.practiceEntriesPerCharacter.toLocaleString('en-US')} entries); ask the GM`;
    }
    return null;
  }
  if (command.type === 'note.create' || command.type === 'note.edit') {
    const author = command.characterId;
    if (author === null) return null;
    const own = Object.values(state.notes).filter((n) => n.author === author);
    let chars = own.reduce((n, note) => n + noteChars(note), 0);
    if (command.type === 'note.create') {
      if (own.length >= limits.notesPerCharacter) {
        return `Note limit reached (${limits.notesPerCharacter} notes); delete one to add another`;
      }
      chars += noteChars({
        title: (command.title ?? '').trim(),
        body: command.body ?? '',
        tags: command.tags ?? [],
      });
    } else {
      const note = own.find((n) => n.id === command.noteId);
      // Unknown or unreadable notes get the reducer's own message.
      if (!note) return null;
      const next = {
        title: command.title === undefined ? note.title : command.title.trim(),
        body: command.body ?? note.body,
        tags: command.tags ?? note.tags,
      };
      // An edit that does not grow a note is always allowed (e.g. after a GM lowers the cap).
      if (noteChars(next) <= noteChars(note)) return null;
      chars += noteChars(next) - noteChars(note);
    }
    if (chars > limits.noteCharsPerCharacter) {
      return `Notes are full (${limits.noteCharsPerCharacter.toLocaleString('en-US')} characters in all); shorten or delete a note first`;
    }
    return null;
  }
  if (command.type === 'trade.propose' && command.characterId !== null) {
    const from = command.characterId;
    const open = Object.values(state.trades).filter(
      (t) => t.status === 'open' && t.from === from,
    ).length;
    if (open >= limits.openTradesPerCharacter) {
      return `Too many open trades (${limits.openTradesPerCharacter}); cancel one first`;
    }
  }
  return null;
}

/**
 * Validates a command, builds its event(s) and appends them. Never throws on a
 * bad or unauthorised command; the context (actor, clock, ids) is trusted.
 */
export function execute(campaign: Campaign, command: Command, ctx: CommandContext): CommandResult {
  const shape = commandSchema.safeParse(command);
  if (!shape.success) {
    const type = (command as { type?: unknown } | null)?.type;
    return { ok: false, error: `Bad command${typeof type === 'string' ? ` "${type}"` : ''}` };
  }
  const denied = authorize(command, ctx.actor);
  if (denied) return { ok: false, error: `Not allowed: ${denied}` };
  const unreachable = campaign.state ? itemOutOfReach(campaign.state, command) : null;
  if (unreachable) return { ok: false, error: unreachable };
  const capped = campaign.state ? overLimit(campaign.state, command, ctx.actor) : null;
  if (capped) return { ok: false, error: capped };
  try {
    const { type, payload } = toEvent(command, ctx, campaign);
    // Events carry the running session (M4.3); a session's own start and end carry its id.
    const sessionId =
      type === 'session.started' || type === 'session.ended'
        ? (payload as { sessionId: string }).sessionId
        : (campaign.state?.currentSession ?? ctx.sessionId);
    const event = parseEvent({
      id: ctx.newId(),
      type,
      timestamp: ctx.now(),
      actor: ctx.actor,
      sessionId,
      schemaVersion: EVENT_SCHEMA_VERSIONS[type],
      payload,
    });
    return { ok: true, campaign: appendEvent(campaign, event), events: [event] };
  } catch (error) {
    if (error instanceof EventRejectedError) return { ok: false, error: error.message };
    throw error;
  }
}
