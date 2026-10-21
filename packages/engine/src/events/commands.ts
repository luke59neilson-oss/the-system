import { z } from 'zod';
import {
  EVENT_SCHEMA_VERSIONS,
  EventRejectedError,
  parseEvent,
  type Actor,
  type DomainEvent,
  type EventType,
} from './envelope';
import { CharacterRuleError } from '../character';
import { largestRemainderSplit } from '../progression';
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
      classSkills: readonly { name: string; rarity: string }[];
      classWeights?: Readonly<Record<string, number>> | undefined;
    }
  | { type: 'character.rename'; characterId: string; name: string }
  | { type: 'character.grantProfession'; characterId: string; profession: string }
  | { type: 'title.award'; characterId: string; title: string }
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
  | { type: 'skill.setUnique'; characterId: string; skill: string; unique: boolean }
  | {
      type: 'skill.awardMark';
      characterId: string;
      skill: string;
      /** Session the mark was earned in; defaults to the current session. */
      session?: string | undefined;
    }
  | { type: 'skill.upgrade'; characterId: string; skill: string }
  | { type: 'skill.merge'; characterId: string; skills: readonly [string, string]; name: string }
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
      type: 'evolution.release';
      characterId: string;
      options: readonly {
        /** Optional; "o1", "o2"... by position when omitted. */
        id?: string | undefined;
        className: string;
        description?: string | undefined;
        transforms?: readonly { skill: string; name: string; rarity: string }[] | undefined;
        classWeights?: Readonly<Record<string, number>> | null | undefined;
      }[];
      /** Offered at the profession unlock grade; default none. */
      professions?: readonly string[] | undefined;
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
  | { type: 'campaign.advanceDay'; days?: number | undefined }
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
}

const anyRecord = z.record(z.string(), z.unknown());
/** Shape check only; the event payload schemas and the reducer do the real validation. */
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('campaign.create') }),
  z.object({ type: z.literal('character.create'), classSkills: z.array(z.unknown()) }),
  z.object({ type: z.literal('character.rename') }),
  z.object({ type: z.literal('character.grantProfession') }),
  z.object({ type: z.literal('title.award') }),
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
  z.object({ type: z.literal('item.define') }),
  z.object({ type: z.literal('item.edit') }),
  z.object({ type: z.literal('holdings.adjust') }),
  z.object({ type: z.literal('gift.give') }),
  z.object({ type: z.literal('item.equip') }),
  z.object({ type: z.literal('item.unequip') }),
  z.object({ type: z.literal('trade.propose'), give: anyRecord, get: anyRecord }),
  z.object({ type: z.literal('trade.accept') }),
  z.object({ type: z.literal('trade.decline') }),
  z.object({ type: z.literal('trade.cancel') }),
  z.object({ type: z.literal('practice.log') }),
  z.object({ type: z.literal('note.create') }),
  z.object({ type: z.literal('note.edit') }),
  z.object({ type: z.literal('note.delete') }),
  z.object({ type: z.literal('skill.nickname') }),
  z.object({ type: z.literal('skill.setUnique') }),
  z.object({ type: z.literal('skill.awardMark') }),
  z.object({ type: z.literal('skill.upgrade') }),
  z.object({ type: z.literal('skill.merge'), skills: z.array(z.unknown()) }),
  z.object({ type: z.literal('selection.offer'), options: z.array(z.unknown()) }),
  z.object({ type: z.literal('selection.choose') }),
  z.object({
    type: z.literal('evolution.release'),
    options: z.array(z.record(z.string(), z.unknown())),
  }),
  z.object({ type: z.literal('evolution.choose') }),
  z.object({ type: z.literal('clock.create') }),
  z.object({ type: z.literal('clock.tick') }),
  z.object({ type: z.literal('clock.remove') }),
  z.object({ type: z.literal('quest.create') }),
  z.object({ type: z.literal('quest.edit') }),
  z.object({ type: z.literal('quest.setStatus') }),
  z.object({ type: z.literal('stability.applyAction') }),
  z.object({ type: z.literal('stability.nudge') }),
  z.object({ type: z.literal('campaign.advanceDay') }),
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
  'note.create',
  'note.edit',
  'note.delete',
  'skill.nickname',
  'selection.choose',
  'evolution.choose',
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
    reason: command.reason ?? '',
  };
}

/** The character a choice is made for, if it exists (choices default to what is pending). */
function pendingOf(campaign: Campaign, characterId: string) {
  const characters = campaign.state?.characters;
  return characters && Object.prototype.hasOwnProperty.call(characters, characterId)
    ? characters[characterId]
    : undefined;
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
      return { type: 'character.created', payload };
    }
    case 'character.rename':
      return {
        type: 'character.renamed',
        payload: { characterId: command.characterId, name: command.name },
      };
    case 'character.grantProfession':
      return {
        type: 'character.professionGranted',
        payload: { characterId: command.characterId, profession: command.profession },
      };
    case 'title.award':
      return {
        type: 'title.awarded',
        // The payload schema trims and checks it; a non-string is refused there.
        payload: { characterId: command.characterId, title: command.title },
      };
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
    case 'xp.award':
      return { type: 'xp.awarded', payload: awardPayload(command) };
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
    case 'skill.setUnique':
      return {
        type: 'skill.uniqueSet',
        payload: { characterId: command.characterId, skill: command.skill, unique: command.unique },
      };
    case 'skill.awardMark': {
      const session = command.session ?? ctx.sessionId;
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
      return {
        type: 'skill.merged',
        payload: { characterId: command.characterId, skills: command.skills, name: command.name },
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
    case 'evolution.release':
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
          })),
          professions: command.professions ?? [],
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
    case 'clock.remove':
      return { type: 'clock.removed', payload: { clockId: command.clockId } };
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
        },
      };
    }
    case 'quest.edit': {
      const { questId, title, text, visible, days, stabilityVisible, stabilityRules } = command;
      // Undefined fields vanish in the event's JSON round trip (= unchanged).
      return {
        type: 'quest.edited',
        payload: { questId, title, text, visible, days, stabilityVisible, stabilityRules },
      };
    }
    case 'quest.setStatus':
      return {
        type: 'quest.statusSet',
        payload: { questId: command.questId, status: command.status },
      };
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
    case 'campaign.advanceDay':
      return { type: 'campaign.dayAdvanced', payload: { days: command.days ?? 1 } };
    case 'event.undo':
      return { type: 'event.undone', payload: { eventId: command.eventId } };
  }
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
  try {
    const { type, payload } = toEvent(command, ctx, campaign);
    const event = parseEvent({
      id: ctx.newId(),
      type,
      timestamp: ctx.now(),
      actor: ctx.actor,
      sessionId: ctx.sessionId,
      schemaVersion: EVENT_SCHEMA_VERSIONS[type],
      payload,
    });
    return { ok: true, campaign: appendEvent(campaign, event), events: [event] };
  } catch (error) {
    if (error instanceof EventRejectedError) return { ok: false, error: error.message };
    throw error;
  }
}
