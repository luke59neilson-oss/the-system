import { z } from 'zod';
import {
  EVENT_SCHEMA_VERSIONS,
  EventRejectedError,
  parseEvent,
  type Actor,
  type DomainEvent,
  type EventType,
} from './envelope';
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
    }
  | { type: 'character.rename'; characterId: string; name: string }
  | { type: 'character.grantProfession'; characterId: string; profession: string }
  | { type: 'character.setPools'; characterId: string; pools: Readonly<Record<string, number>> }
  | { type: 'character.setStats'; characterId: string; stats: Readonly<Record<string, number>> }
  | { type: 'event.undo'; eventId: string };

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
  z.object({ type: z.literal('character.setPools'), pools: anyRecord }),
  z.object({ type: z.literal('character.setStats'), stats: anyRecord }),
  z.object({ type: z.literal('event.undo') }),
]);

export type CommandType = Command['type'];

/**
 * Commands a player may issue, and only for their own character. Empty until
 * player actions land (free points M1.5, nicknames, notes, gifts...). Every
 * other command needs the GM or the system (M2.2 checks the GM key).
 */
export const PLAYER_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>();

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

export type CommandResult =
  { ok: true; campaign: Campaign; events: DomainEvent[] } | { ok: false; error: string };

function toEvent(command: Command, ctx: CommandContext): { type: EventType; payload: unknown } {
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
    const { type, payload } = toEvent(command, ctx);
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
