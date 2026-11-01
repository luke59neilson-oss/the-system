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
import {
  appDie,
  rollsModeOf,
  settleContest,
  settleD20Contest,
  type ContestSideRecord,
  type DieRoll,
  type GradeGapMode,
  type RollsMode,
} from '../resolution';
import { titleDefByName } from '../titles';
import { evolutionTarget, keptRerate, stepBudgetProblems } from '../evolution';
import { castingForSkill, normalizeTags, poolLabel } from '../skills/library';
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
/** ME.2: one option in a step of a three-step evolution, as the GM sends it. */
export interface StepOptionInput {
  readonly id?: string | undefined;
  readonly name: string;
  readonly rarity?: string | undefined;
  readonly description?: string | undefined;
  readonly distribution: {
    readonly stats: Readonly<Record<string, number>>;
    readonly free: number;
  };
  readonly statBonus?: Readonly<Record<string, number>> | undefined;
  readonly transforms?:
    | readonly { skill: string; name: string; rarity: string; merge?: string | undefined }[]
    | undefined;
}

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
  | {
      type: 'character.grantProfession';
      characterId: string;
      profession: string;
      /** MT.7 GM override: grant one before the unlock grade. */
      override?: boolean | undefined;
    }
  /** Player: take one of the professions the GM offered (MQ.6). */
  | { type: 'profession.choose'; characterId: string; profession: string }
  /** GM only: offer a profession while the character has none (ME.6 b). */
  | {
      type: 'profession.offer';
      characterId: string;
      profession: string;
      distribution?: { stats: Readonly<Record<string, number>>; free: number } | undefined;
      statBonus?: Readonly<Record<string, number>> | undefined;
    }
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
      /** ME.1: what one level of a track grants this character; null resets it (D301). */
      type: 'character.setDistribution';
      characterId: string;
      track: 'class' | 'profession' | 'race';
      distribution: { stats: Readonly<Record<string, number>>; free: number } | null;
    }
  /** GM only (MT.5): set levels, XP and grade directly; see `progressionOverride`. */
  | {
      type: 'character.setProgression';
      characterId: string;
      grade: string;
      classLevel: number;
      professionLevel: number;
      xp: { class: number; profession: number };
    }
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
      /** ME.1: names a class or profession level's batch. */
      track?: 'class' | 'profession' | undefined;
      trackLevel?: number | undefined;
      allocation: Readonly<Record<string, number>>;
    }
  | {
      /**
       * MV.1 (DESIGN §4 "any amount at once"): spend any number of the
       * character's unassigned points; the oldest waiting level-up's go first.
       */
      type: 'freePoints.spend';
      characterId: string;
      allocation: Readonly<Record<string, number>>;
    }
  | {
      type: 'freePoints.override';
      characterId: string;
      raceLevel: number;
      /** ME.1: names a class or profession level's batch. */
      track?: 'class' | 'profession' | undefined;
      trackLevel?: number | undefined;
      /** null unassigns the batch and unlocks it. */
      allocation: Readonly<Record<string, number>> | null;
    }
  | {
      type: 'system.broadcast';
      text: string;
      /** Recipients; omitted or null = every character. */
      characterIds?: readonly string[] | null | undefined;
      /** MT.6: a banner for `seconds`, or pinned until removed; omitted = list only. */
      display?: { mode: 'pinned' } | { mode: 'timed'; seconds: number } | undefined;
    }
  /** MT.6: take a broadcast's banner down. */
  | { type: 'broadcast.remove'; id: string }
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
      /**
       * GM only (MC.7 review M4): the play session the use happened in, when
       * the GM confirms it later (a co-DM draft from an earlier session);
       * null = outside any session. Default: the current session.
       */
      session?: string | null | undefined;
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
  /** MU.5: the owner (or the GM) casts a skill with a cost; the pool pays it. */
  | { type: 'skill.cast'; characterId: string; skill: string }
  | {
      type: 'skill.describe';
      characterId: string;
      skill: string;
      description: string | null;
      flavor: string | null;
    }
  | { type: 'skill.setUnique'; characterId: string; skill: string; unique: boolean }
  | { type: 'skill.setRarity'; characterId: string; skill: string; rarity: string }
  | {
      type: 'skill.grant';
      characterId: string;
      name: string;
      rarity: string;
      kind: 'class' | 'profession' | 'race';
      description?: string | null;
      flavor?: string | null;
    }
  /** GM hands a hand-written skill copy back to the library (MR.4). */
  | { type: 'skill.useLibraryText'; characterId: string; skill: string }
  | {
      type: 'skill.awardMark';
      characterId: string;
      skill: string;
      /** Session the mark was earned in; defaults to the current session. */
      session?: string | undefined;
      /** MT.7 GM override: a further mark in the same session. */
      override?: boolean | undefined;
    }
  | { type: 'skill.upgrade'; characterId: string; skill: string }
  | {
      type: 'skill.merge';
      characterId: string;
      skills: readonly [string, string];
      name: string;
      /** Id for the offer the player answers (MT.2); generated when absent. */
      offerId?: string | undefined;
      /** The merged skill's System text, given to it when accepted. */
      description?: string | null | undefined;
      flavor?: string | null | undefined;
      /** MT.7 GM override: skips the minimum rarity, joint-use and once-per-grade checks. */
      override?: boolean | undefined;
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
      /** The single-choice options (before ME.2); may be empty when `steps` is given. */
      options?: readonly {
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
       * ME.2 (DESIGN §2): class, profession and race steps. When given, the
       * class step's options stand in for `options` (send an empty list).
       */
      steps?:
        | {
            class: readonly StepOptionInput[];
            profession?: readonly StepOptionInput[] | undefined;
            race: readonly StepOptionInput[];
          }
        | undefined;
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
      /** MT.7 GM override: release (and let the player choose) with a skill selection pending. */
      override?: boolean | undefined;
    }
  | {
      type: 'evolution.choose';
      characterId: string;
      /** The class option of a single-choice release (before ME.2). */
      optionId?: string | undefined;
      profession?: string | null | undefined;
      /**
       * ME.2: one option per step of a three-step release (profession null =
       * "none for now", only for a character without a profession).
       */
      choices?: { class: string; profession?: string | null | undefined; race: string } | undefined;
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
      /** The roll drawn, or null when a grade wall settled it (or the contest is d20). */
      roll: number | null;
      /** MK.1: odds or d20 (default: the campaign's `resolution.rolls`). */
      rolls?: RollsMode | undefined;
      /** MK.1: a d20 contest's dice per round, all but the last tied (none when walled). */
      dice?: readonly { a: DieRoll; b: DieRoll }[] | undefined;
    }
  | {
      type: 'montage.offer';
      /** Optional; a fresh id is generated when omitted. */
      montageId?: string | undefined;
      clockId: string;
      /** What players see; default "Montage" (the clock's name stays GM-only). */
      label?: string | undefined;
      characterIds: readonly string[];
      /** MT.7 GM override: offer before the clock is half filled with no failures. */
      override?: boolean | undefined;
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
      /** MU.4 spells: cost per use (pool id and amount); null removes it on edit. */
      cost?: { pool: string; amount: number } | null | undefined;
      cooldown?: string | undefined;
      range?: string | undefined;
      castingNotes?: string | undefined;
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
      /** MU.4 spells: cost per use (pool id and amount); null removes it on edit. */
      cost?: { pool: string; amount: number } | null | undefined;
      cooldown?: string | undefined;
      range?: string | undefined;
      castingNotes?: string | undefined;
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
      /** MV.3: bestiary category id, or null/omitted for Uncategorized. */
      categoryId?: string | null | undefined;
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
      categoryId?: string | null | undefined;
    }
  | {
      type: 'entity.reveal';
      entityId: string;
      /** Omitted or null = every character who does not know it yet. */
      characterIds?: readonly string[] | null | undefined;
    }
  /** MV.3 (DESIGN §7): Identified by… — decides each result now and notifies each character. */
  | { type: 'entity.identify'; entityId: string; characterIds: readonly string[] }
  /** MV.3: the player closes their Identify notification. */
  | { type: 'entity.closeNotice'; entityId: string; characterId: string }
  | { type: 'bestiary.categoryDefine'; categoryId?: string | undefined; name: string }
  | { type: 'bestiary.categoryRename'; categoryId: string; name: string }
  | { type: 'bestiary.categoryRemove'; categoryId: string }
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
  /**
   * MC.3: the GM adds a shop. Each ware names a library item by id or name
   * (any case), so a content file can sell items it defines above.
   */
  | {
      type: 'shop.define';
      shopId?: string | undefined;
      name: string;
      regionId?: string | null | undefined;
      keeper?: string | undefined;
      wares?: readonly { item: string; price: number }[] | undefined;
      hook?: string | undefined;
    }
  /** MC.3 review: the GM removes a shop (a mistyped or closed one). */
  | { type: 'shop.remove'; shopId: string }
  /** MT.8 (Q69): show a faction's name and standing to players, or hide it again. */
  | { type: 'faction.reveal'; factionId: string; revealed: boolean }
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
  /** MT.9 (Q63): ask these characters' players what they practised this scene (default: all). */
  | { type: 'scene.end'; sceneId?: string | undefined; characterIds?: string[] | undefined }
  /** MT.9: the player (or the GM for them) has answered the end-of-scene prompt. */
  | { type: 'scene.answer'; sceneId: string; characterId: string }
  /** MK.2: ask a player's phone for a d20 for this stat. */
  | { type: 'roll.request'; characterId: string; stat: string; requestId?: string | undefined }
  /**
   * MK.2: answer the open roll request: a die thrown at the table (`die`, 1–20)
   * or, without one, a die the app rolls with the context's random source.
   */
  | { type: 'roll.answer'; characterId: string; requestId: string; die?: number | undefined }
  /** MK.2: the GM used or withdrew the open roll request. */
  | { type: 'roll.clear'; characterId: string; requestId: string }
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
  z.object({ type: z.literal('profession.offer') }),
  z.object({ type: z.literal('title.award') }),
  z.object({ type: z.literal('titleDef.define') }),
  z.object({ type: z.literal('titleDef.edit') }),
  z.object({ type: z.literal('character.setPools'), pools: anyRecord }),
  z.object({ type: z.literal('character.setStats'), stats: anyRecord }),
  z.object({ type: z.literal('character.setDistribution'), track: z.string() }),
  z.object({ type: z.literal('character.setProgression'), xp: anyRecord }),
  z.object({
    type: z.literal('xp.award'),
    amount: z.number(),
    participants: z.array(z.object({ characterId: z.string() })).min(1),
  }),
  z.object({ type: z.literal('freePoints.assign'), allocation: anyRecord }),
  z.object({ type: z.literal('freePoints.spend'), allocation: anyRecord }),
  z.object({ type: z.literal('freePoints.override'), allocation: anyRecord.nullable() }),
  z.object({
    type: z.literal('system.broadcast'),
    text: z.string(),
    characterIds: z.array(z.string()).nullable().optional(),
    display: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('pinned') }),
        z.object({ mode: z.literal('timed'), seconds: z.number() }),
      ])
      .optional(),
  }),
  z.object({
    type: z.literal('broadcast.schedule'),
    text: z.string(),
    characterIds: z.array(z.string()).nullable().optional(),
    day: z.number(),
  }),
  z.object({ type: z.literal('broadcast.unschedule'), id: z.string() }),
  z.object({ type: z.literal('broadcast.remove'), id: z.string() }),
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
  z.object({ type: z.literal('skill.cast') }),
  z.object({ type: z.literal('skill.describe') }),
  z.object({ type: z.literal('skill.setUnique') }),
  z.object({ type: z.literal('skill.setRarity') }),
  z.object({ type: z.literal('skill.grant') }),
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
    options: z.array(z.record(z.string(), z.unknown())).optional(),
    steps: z.record(z.string(), z.unknown()).optional(),
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
  z.object({ type: z.literal('entity.identify'), characterIds: z.array(z.string()) }),
  z.object({
    type: z.literal('entity.closeNotice'),
    entityId: z.string(),
    characterId: z.string(),
  }),
  z.object({ type: z.literal('bestiary.categoryDefine'), name: z.string() }),
  z.object({
    type: z.literal('bestiary.categoryRename'),
    categoryId: z.string(),
    name: z.string(),
  }),
  z.object({ type: z.literal('bestiary.categoryRemove'), categoryId: z.string() }),
  z.object({ type: z.literal('region.define') }),
  z.object({ type: z.literal('region.edit') }),
  z.object({ type: z.literal('region.setCurrent') }),
  z.object({ type: z.literal('faction.define') }),
  z.object({
    type: z.literal('shop.define'),
    wares: z.array(z.object({ item: z.string(), price: z.number() })).optional(),
  }),
  z.object({ type: z.literal('shop.remove'), shopId: z.string() }),
  z.object({ type: z.literal('faction.edit') }),
  z.object({ type: z.literal('faction.reveal') }),
  z.object({ type: z.literal('campaign.advanceDay') }),
  z.object({ type: z.literal('rules.migrate'), migration: z.literal('xpOverflow') }),
  z.object({ type: z.literal('rules.set'), rules: z.unknown() }),
  z.object({ type: z.literal('rules.reset') }),
  z.object({ type: z.literal('session.start'), sessionId: z.string().optional() }),
  z.object({ type: z.literal('session.end') }),
  z.object({ type: z.literal('scene.end') }),
  z.object({ type: z.literal('scene.answer') }),
  z.object({
    type: z.literal('roll.request'),
    characterId: z.string(),
    stat: z.string(),
    requestId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    type: z.literal('roll.answer'),
    characterId: z.string(),
    requestId: z.string(),
    die: z.number().optional(),
  }),
  z.object({ type: z.literal('roll.clear'), characterId: z.string(), requestId: z.string() }),
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
  'freePoints.spend',
  'gift.give',
  'item.equip',
  'item.unequip',
  'trade.propose',
  'trade.accept',
  'trade.decline',
  'trade.cancel',
  'practice.log',
  'scene.answer',
  'roll.answer',
  'entity.closeNotice',
  'montage.focus',
  'note.create',
  'note.edit',
  'note.delete',
  'skill.nickname',
  'skill.cast',
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

/** MC.3: a region by id, else by name (any case); unknown or ambiguous names are refused. */
function regionRef(campaign: Campaign, ref: string | null): string | null {
  if (ref === null) return null;
  const regions = campaign.state?.regions ?? {};
  if (Object.prototype.hasOwnProperty.call(regions, ref)) return ref;
  const wanted = ref.trim().toLowerCase();
  const matches = (campaign.state?.regionOrder ?? []).filter(
    (id) => regions[id]?.name.trim().toLowerCase() === wanted,
  );
  if (matches.length !== 1) {
    throw new EventRejectedError(
      matches.length === 0
        ? `no region named "${ref}"`
        : `${matches.length} regions are named "${ref}"`,
    );
  }
  return matches[0] as string;
}

/**
 * MU.5 (D271): prices a cast now from the library (`castingForSkill`), so a
 * later library edit does not change what an earlier cast cost; refuses a
 * skill with no cost and a pool that is too low, naming only the caster's own
 * numbers.
 */
function castPayload(campaign: Campaign, command: Extract<Command, { type: 'skill.cast' }>) {
  const state = campaign.state;
  const character =
    state && Object.prototype.hasOwnProperty.call(state.characters, command.characterId)
      ? state.characters[command.characterId]
      : undefined;
  if (!state || !character)
    throw new EventRejectedError(`unknown character "${command.characterId}"`);
  const skill = character.skills.find((s) => s.name === command.skill);
  if (!skill) throw new EventRejectedError(`${character.name} has no skill "${command.skill}"`);
  const cost = castingForSkill(state.rules, state.skillLibrary, skill)?.cost;
  if (!cost) throw new EventRejectedError(`[${skill.name}] has no cost to cast`);
  const have = character.pools[cost.pool] ?? 0;
  if (have < cost.amount) {
    throw new EventRejectedError(
      `Not enough ${poolLabel(state.rules, cost.pool)} to cast [${skill.name}]: ${have} of ${cost.amount}`,
    );
  }
  return { characterId: character.id, skill: skill.name, pool: cost.pool, amount: cost.amount };
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

/**
 * ME.2: normalises the three steps and refuses a release whose options miss
 * their step's budget at the new grade or whose one-time bonuses differ within
 * a step, unless the GM ticked Override (DESIGN §2 "Equal totals").
 */
function releaseSteps(
  campaign: Campaign,
  command: Extract<Command, { type: 'evolution.release' }>,
) {
  const state = campaign.state;
  const character = pendingOf(campaign, command.characterId);
  const steps = command.steps!;
  const norm = (list: readonly StepOptionInput[], prefix: string) =>
    list.map((o, i) => ({
      id: o.id ?? `${prefix}${i + 1}`,
      name: o.name,
      rarity: o.rarity ?? 'common',
      description: o.description ?? '',
      distribution: { stats: { ...o.distribution.stats }, free: o.distribution.free },
      statBonus: o.statBonus ?? {},
      transforms: o.transforms ?? [],
    }));
  const out = {
    class: norm(steps.class, 'c'),
    profession: norm(steps.profession ?? [], 'p'),
    race: norm(steps.race, 'r'),
  };
  // Every evolution has a profession step: a character with a profession
  // evolves it, so its step needs at least one option (DESIGN §2).
  if (character && character.profession !== null && out.profession.length === 0) {
    throw new EventRejectedError(
      `${character.name} has the profession [${character.profession}]: add at least one profession option to evolve it`,
    );
  }
  const ids = (list: readonly { id: string }[]) =>
    new Set(list.map((o) => o.id)).size === list.length;
  if (!ids(out.class) || !ids(out.profession) || !ids(out.race)) {
    throw new EventRejectedError('Two options in a step share an id');
  }
  if ((command.options ?? []).length > 0) {
    throw new EventRejectedError('Send the class options in the class step, not as options');
  }
  const target = state && character ? evolutionTarget(state.rules, character) : null;
  // Steps set each track's points per level at the new grade, which only a
  // grade with track budgets uses (D300): an old-rules campaign switches first.
  if (target && target.trackBudget === undefined) {
    throw new EventRejectedError(
      `Three-step evolutions need track budgets at ${target.id}-grade: switch to the new numbers in Rules settings first`,
    );
  }
  if (target && command.override !== true) {
    const budget = target.trackBudget;
    if (budget !== undefined) {
      const problems = [
        ...stepBudgetProblems('Class', budget.class, out.class),
        ...stepBudgetProblems('Profession', budget.profession, out.profession),
        ...stepBudgetProblems('Race', budget.race, out.race),
      ];
      if (problems.length > 0) throw new EventRejectedError(problems.join('; '));
    }
  }
  return out;
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
        payload: {
          characterId: command.characterId,
          profession: command.profession,
          ...(command.override === true ? { override: true as const } : {}),
        },
      };
    case 'profession.offer':
      return {
        type: 'profession.offered',
        payload: {
          characterId: command.characterId,
          profession: command.profession,
          ...(command.distribution === undefined
            ? {}
            : {
                distribution: {
                  stats: { ...command.distribution.stats },
                  free: command.distribution.free,
                },
              }),
          ...(command.statBonus === undefined ? {} : { statBonus: { ...command.statBonus } }),
        },
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
    case 'character.setDistribution':
      return {
        type: 'character.distributionSet',
        payload: {
          characterId: command.characterId,
          track: command.track,
          distribution:
            command.distribution === null
              ? null
              : { stats: { ...command.distribution.stats }, free: command.distribution.free },
        },
      };
    case 'character.setProgression':
      return {
        type: 'character.progressionSet',
        payload: {
          characterId: command.characterId,
          grade: command.grade,
          classLevel: command.classLevel,
          professionLevel: command.professionLevel,
          xp: command.xp,
        },
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
          ...(command.track === undefined
            ? {}
            : { track: command.track, trackLevel: command.trackLevel }),
          allocation: command.allocation,
        },
      };
    case 'freePoints.spend':
      return {
        type: 'freePoints.spent',
        payload: { characterId: command.characterId, allocation: command.allocation },
      };
    case 'freePoints.override':
      return {
        type: 'freePoints.overridden',
        payload: {
          characterId: command.characterId,
          raceLevel: command.raceLevel,
          ...(command.track === undefined
            ? {}
            : { track: command.track, trackLevel: command.trackLevel }),
          allocation: command.allocation,
        },
      };
    case 'system.broadcast':
      return {
        type: 'system.broadcast',
        payload: {
          text: command.text,
          characterIds: command.characterIds ?? null,
          ...(command.display === undefined ? {} : { display: command.display }),
        },
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
    case 'broadcast.remove':
      return { type: 'broadcast.removed', payload: { id: command.id } };
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
          ...(command.session !== undefined ? { session: command.session } : {}),
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
    case 'skill.cast':
      return { type: 'skill.cast', payload: castPayload(campaign, command) };
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
    case 'skill.grant':
      return {
        type: 'skill.granted',
        payload: {
          characterId: command.characterId,
          name: command.name.trim(),
          rarity: command.rarity,
          kind: command.kind,
          description: command.description ?? null,
          flavor: command.flavor ?? null,
        },
      };
    case 'skill.setRarity':
      // MV.3 review round 2: Identify is never re-rated either (DESIGN §7).
      refuseIdentifyChange(campaign, command.characterId, command.skill);
      return {
        type: 'skill.raritySet',
        payload: { characterId: command.characterId, skill: command.skill, rarity: command.rarity },
      };
    case 'skill.setUnique':
      return {
        type: 'skill.uniqueSet',
        payload: { characterId: command.characterId, skill: command.skill, unique: command.unique },
      };
    case 'skill.awardMark': {
      refuseIdentifyChange(campaign, command.characterId, command.skill);
      const session = command.session ?? campaign.state?.currentSession ?? ctx.sessionId;
      if (session === null) throw new EventRejectedError('A mark needs a play session');
      return {
        type: 'skill.markAwarded',
        payload: {
          characterId: command.characterId,
          skill: command.skill,
          session,
          ...(command.override === true ? { override: true as const } : {}),
        },
      };
    }
    case 'skill.upgrade':
      refuseIdentifyChange(campaign, command.characterId, command.skill);
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
          ...(command.description?.trim() ? { description: command.description } : {}),
          ...(command.flavor?.trim() ? { flavor: command.flavor } : {}),
          ...(command.override === true ? { override: true as const } : {}),
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
    case 'evolution.release': {
      if (command.rerateApproved !== true) {
        throw new EventRejectedError(
          "Approve the skill re-rating first: the GM sets each kept skill's rarity and approves the list (DESIGN §6)",
        );
      }
      // MV.3: Identify is never raised at an evolution (a lowering keeps MT.1's own refusal;
      // merges and transforms keep QF.39 and MT.1's refusals and the GM override).
      for (const [skill, rarity] of Object.entries(command.rerate ?? {})) {
        const held = pendingOf(campaign, command.characterId)?.skills.find((s) => s.name === skill);
        const ladder = campaign.state?.rules.skills.rarities.map((r) => r.id) ?? [];
        if (held && ladder.indexOf(rarity) > ladder.indexOf(held.rarity)) {
          refuseIdentifyChange(campaign, command.characterId, skill);
        }
      }
      const steps = command.steps === undefined ? undefined : releaseSteps(campaign, command);
      return {
        type: 'evolution.released',
        payload: {
          characterId: command.characterId,
          ...(steps === undefined ? {} : { steps }),
          options: (steps === undefined
            ? (command.options ?? [])
            : steps.class.map((o) => ({
                id: o.id,
                className: o.name,
                description: o.description,
                transforms: o.transforms,
                classWeights: null,
                statBonus: o.statBonus,
              }))
          ).map((o, i) => ({
            id: o.id ?? `o${i + 1}`,
            className: o.className,
            description: o.description ?? '',
            transforms: o.transforms ?? [],
            classWeights: o.classWeights ?? null,
            statBonus: o.statBonus ?? {},
          })),
          // With steps, the profession step carries the offers (ME.2).
          professions: steps === undefined ? (command.professions ?? []) : [],
          rerate: rerateFor(campaign, command.characterId, command.rerate ?? {}),
          rerateApproved: true,
          ...(command.override === true ? { override: true as const } : {}),
        },
      };
    }
    case 'evolution.choose': {
      const choices = command.choices;
      const optionId = choices?.class ?? command.optionId;
      if (optionId === undefined) {
        throw new EventRejectedError('Choose an evolution option');
      }
      return {
        type: 'evolution.chosen',
        payload: {
          characterId: command.characterId,
          optionId,
          profession: choices === undefined ? (command.profession ?? null) : null,
          ...(choices === undefined
            ? {}
            : {
                choices: {
                  class: choices.class,
                  profession: choices.profession ?? null,
                  race: choices.race,
                },
              }),
          releaseId:
            command.releaseId ?? pendingOf(campaign, command.characterId)?.evolution?.releaseId,
        },
      };
    }
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
          ...(command.override === true ? { override: true as const } : {}),
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
      const rolls = command.rolls ?? rollsModeOf(rules);
      if (rolls === 'd20' && command.roll !== null) {
        throw new EventRejectedError('A d20 contest takes dice, not an odds roll');
      }
      if (rolls === 'odds' && command.dice !== undefined && command.dice.length > 0) {
        throw new EventRejectedError('An odds contest takes a roll, not dice');
      }
      let result;
      let d20 = null;
      try {
        if (rolls === 'd20') {
          const settled = settleD20Contest(rules, command.a, command.b, mode, command.dice ?? []);
          d20 = settled.d20;
          result = settled;
        } else {
          result = settleContest(rules, command.a, command.b, mode, command.roll);
        }
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
          roll: rolls === 'd20' ? null : command.roll,
          yours,
          theirs,
          chance,
          walled,
          success,
          // Odds contests keep the pre-MK payload exactly.
          ...(rolls === 'd20' ? { rolls } : {}),
          ...(d20 ? { d20 } : {}),
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
          ...(command.cost
            ? { cost: { pool: command.cost.pool, amount: command.cost.amount } }
            : {}),
          ...(command.cooldown?.trim() ? { cooldown: command.cooldown } : {}),
          ...(command.range?.trim() ? { range: command.range } : {}),
          ...(command.castingNotes?.trim() ? { castingNotes: command.castingNotes } : {}),
        },
      };
    case 'skillDef.edit': {
      const { skillDefId, name, rarity, tags, description, flavor, effects } = command;
      const { cost, cooldown, range, castingNotes } = command;
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
          cost,
          cooldown,
          range,
          castingNotes,
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
          categoryId: command.categoryId ?? null,
        },
      };
    case 'entity.edit': {
      const { entityId, name, label, tiers, grade, level, notes, categoryId } = command;
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
          categoryId,
        },
      };
    }
    case 'entity.identify':
      if (command.characterIds.length === 0)
        throw new EventRejectedError('Tick at least one character');
      return {
        type: 'entity.identified',
        payload: { entityId: command.entityId, characterIds: [...command.characterIds] },
      };
    case 'entity.closeNotice':
      return {
        type: 'entity.noticeClosed',
        payload: { entityId: command.entityId, characterId: command.characterId },
      };
    case 'bestiary.categoryDefine':
      return {
        type: 'bestiary.categoryDefined',
        payload: { categoryId: command.categoryId ?? ctx.newId(), name: command.name },
      };
    case 'bestiary.categoryRename':
      return {
        type: 'bestiary.categoryRenamed',
        payload: { categoryId: command.categoryId, name: command.name },
      };
    case 'bestiary.categoryRemove':
      return { type: 'bestiary.categoryRemoved', payload: { categoryId: command.categoryId } };
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
    case 'shop.define': {
      const items = campaign.state?.items ?? {};
      const itemOrder = campaign.state?.itemOrder ?? [];
      const wares = (command.wares ?? []).map((w, i) => {
        if (Object.prototype.hasOwnProperty.call(items, w.item)) {
          return { itemId: w.item, price: w.price };
        }
        const wanted = w.item.trim().toLowerCase();
        // QF.29 (D237): item names may repeat; the most recently defined wins.
        const match = itemOrder.findLast((id) => items[id]?.name.trim().toLowerCase() === wanted);
        if (match === undefined) {
          throw new EventRejectedError(`wares[${i}]: no item named "${w.item}" in the library`);
        }
        return { itemId: match, price: w.price };
      });
      return {
        type: 'shop.defined',
        payload: {
          shopId: command.shopId ?? ctx.newId(),
          name: command.name,
          regionId: regionRef(campaign, command.regionId ?? null),
          keeper: command.keeper ?? '',
          wares,
          hook: command.hook ?? '',
        },
      };
    }
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
    case 'shop.remove':
      return { type: 'shop.removed', payload: { shopId: command.shopId } };
    case 'faction.edit': {
      const { factionId, name, regionId, members, standing, notes } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'faction.edited',
        payload: { factionId, name, regionId, members, standing, notes },
      };
    }
    case 'faction.reveal':
      return {
        type: 'faction.revealSet',
        payload: { factionId: command.factionId, revealed: command.revealed },
      };
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
    case 'scene.end':
      return {
        type: 'scene.ended',
        payload: {
          sceneId: command.sceneId ?? ctx.newId(),
          characterIds: command.characterIds ?? [...(campaign.state?.characterOrder ?? [])],
        },
      };
    case 'scene.answer':
      return {
        type: 'scene.answered',
        payload: { sceneId: command.sceneId, characterId: command.characterId },
      };
    case 'roll.request':
      return {
        type: 'roll.requested',
        payload: {
          requestId: command.requestId ?? ctx.newId(),
          characterId: command.characterId,
          stat: command.stat,
        },
      };
    case 'roll.answer': {
      let die: number;
      let how: 'typed' | 'app';
      if (command.die === undefined) {
        if (!ctx.random) throw new EventRejectedError('No random source to roll with');
        ({ die, how } = appDie(ctx.random));
      } else {
        if (!Number.isInteger(command.die) || command.die < 1 || command.die > 20) {
          throw new EventRejectedError('A die is a whole number from 1 to 20');
        }
        die = command.die;
        how = 'typed';
      }
      return {
        type: 'roll.answered',
        payload: { requestId: command.requestId, characterId: command.characterId, die, how },
      };
    }
    case 'roll.clear':
      return {
        type: 'roll.cleared',
        payload: { requestId: command.requestId, characterId: command.characterId },
      };
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
  // QF.62: a player's cast joins the practice log, so it counts toward the same cap.
  if (command.type === 'skill.cast' && actor.role === 'player') {
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
  // QF.62: these checks read the command's raw fields before `toEvent` checks
  // their shape, so a malformed command (a missing or mistyped field) is a bad
  // command, not an engine bug: a TypeError here is answered like a bad shape.
  let early: string | null;
  try {
    early = campaign.state
      ? (itemOutOfReach(campaign.state, command) ?? overLimit(campaign.state, command, ctx.actor))
      : null;
  } catch (error) {
    if (error instanceof TypeError) return { ok: false, error: `Bad command "${command.type}"` };
    throw error;
  }
  if (early) return { ok: false, error: early };
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

/**
 * MV.3 (DESIGN §7 "Identify"): Identify stays Common for good. It earns no
 * marks and is never upgraded. Checked at the command, so stored logs that
 * recorded Identify marks or upgrades still replay unchanged.
 */
function refuseIdentifyChange(campaign: Campaign, characterId: string, skill: string): void {
  const state = campaign.state;
  if (!state) return;
  const name = state.rules.skills.startingRaceSkill.name.toLowerCase();
  if (skill.trim().toLowerCase() !== name) return;
  const character = Object.prototype.hasOwnProperty.call(state.characters, characterId)
    ? state.characters[characterId]
    : undefined;
  const owned = character?.skills.find((s) => s.name.toLowerCase() === name);
  if (owned && owned.kind === 'race') {
    throw new EventRejectedError(
      `${state.rules.skills.startingRaceSkill.name} never changes: it earns no marks and is never upgraded or raised`,
    );
  }
}
