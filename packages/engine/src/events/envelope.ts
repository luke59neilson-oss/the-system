import { z } from 'zod';

/**
 * Event envelope and payload schemas (ROADMAP M1.3). Events are the only source
 * of truth: state is a fold over the log. Every event type carries its own
 * payload `schemaVersion`; old stored events are upcast before validation.
 */

export class EventRejectedError extends Error {}

const nonBlank = z
  .string()
  .trim()
  .min(1, 'must not be blank')
  .refine((s) => s.length <= 200, 'must be at most 200 characters');
const recordId = z.string().min(1).max(100);
const statValues = z.record(z.string().min(1), z.number().int().nonnegative());

export const actorSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('gm') }),
  z.strictObject({ role: z.literal('system') }),
  z.strictObject({ role: z.literal('player'), characterId: recordId }),
]);
export type Actor = z.output<typeof actorSchema>;

/** Payload schemas by event type, at their current schema version. */
export const EVENT_PAYLOAD_SCHEMAS = {
  /** Must be the first event of a log, exactly once. `rules` is a raw config (migrated on replay). */
  'campaign.created': z.strictObject({ name: nonBlank, rules: z.unknown() }),
  'character.created': z.strictObject({
    id: recordId,
    name: nonBlank,
    className: nonBlank,
    race: nonBlank.optional(),
    classSkills: z.array(z.strictObject({ name: nonBlank, rarity: z.string().min(1) })),
  }),
  'character.renamed': z.strictObject({ characterId: recordId, name: nonBlank }),
  'character.professionGranted': z.strictObject({ characterId: recordId, profession: nonBlank }),
  /** GM sets current pool values; they clamp to 0..max. */
  'character.poolsSet': z.strictObject({
    characterId: recordId,
    pools: z.record(z.string().min(1), z.number().int()),
  }),
  /** GM override of base stats (audited sheet edit, M4.5); pools re-clamp. */
  'character.statsSet': z.strictObject({ characterId: recordId, stats: statValues }),
  /** Compensating event: the target stops counting, as if it had never happened. */
  'event.undone': z.strictObject({ eventId: recordId }),
} as const;

export type EventType = keyof typeof EVENT_PAYLOAD_SCHEMAS;
export const EVENT_TYPES = Object.keys(EVENT_PAYLOAD_SCHEMAS) as EventType[];

export type EventPayload<T extends EventType> = z.output<(typeof EVENT_PAYLOAD_SCHEMAS)[T]>;

/** Current payload schema version per event type. Bump with an upcaster. */
export const EVENT_SCHEMA_VERSIONS: Readonly<Record<EventType, number>> = {
  'campaign.created': 1,
  'character.created': 1,
  'character.renamed': 1,
  'character.professionGranted': 1,
  'character.poolsSet': 1,
  'character.statsSet': 1,
  'event.undone': 1,
};

/** Upgrades a stored payload from version N to N+1. Must be pure. */
export type EventUpcaster = (payload: unknown) => unknown;

/**
 * Upcasters keyed by event type, then by the version they upgrade FROM. Add one
 * whenever a payload schema changes; never edit a released upcaster.
 */
export type EventUpcasters = Readonly<
  Partial<Record<string, Readonly<Record<number, EventUpcaster>>>>
>;
export const EVENT_UPCASTERS: EventUpcasters = {};

interface EnvelopeBase {
  readonly id: string;
  /** ISO-8601 UTC timestamp from the injected clock. */
  readonly timestamp: string;
  readonly actor: Actor;
  /** Play session the event happened in; null outside a session. */
  readonly sessionId: string | null;
  readonly schemaVersion: number;
}

export type DomainEvent = {
  [T in EventType]: EnvelopeBase & { readonly type: T; readonly payload: EventPayload<T> };
}[EventType];

export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

const envelopeSchema = z.strictObject({
  id: recordId,
  type: z.string(),
  timestamp: z.iso.datetime({ offset: false }),
  actor: actorSchema,
  sessionId: recordId.nullable(),
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
});

const isEventType = (type: string): type is EventType =>
  Object.prototype.hasOwnProperty.call(EVENT_PAYLOAD_SCHEMAS, type);

function issuesText(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.map(String).join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Parses a stored event (any supported version): validates the envelope,
 * upcasts the payload to the current version, then validates the payload.
 * Throws EventRejectedError with a readable reason.
 */
export function parseEvent(
  raw: unknown,
  upcasters: EventUpcasters = EVENT_UPCASTERS,
  versions: Readonly<Record<string, number>> = EVENT_SCHEMA_VERSIONS,
): DomainEvent {
  // A JSON round trip detaches the event from the caller's objects and proves
  // it is plain data that survives the JSONL log.
  let plain: unknown;
  try {
    plain = JSON.parse(JSON.stringify(raw ?? null)) as unknown;
  } catch {
    throw new EventRejectedError('Bad event: not plain JSON data');
  }
  const envelope = envelopeSchema.safeParse(plain);
  if (!envelope.success) throw new EventRejectedError(`Bad event: ${issuesText(envelope.error)}`);
  const { type, schemaVersion, id } = envelope.data;
  if (!isEventType(type)) throw new EventRejectedError(`Event ${id}: unknown type "${type}"`);
  const target = versions[type] ?? EVENT_SCHEMA_VERSIONS[type];
  if (schemaVersion > target) {
    throw new EventRejectedError(
      `Event ${id}: ${type} v${schemaVersion} is newer than this app supports (v${target}); update the app`,
    );
  }
  let payload: unknown = envelope.data.payload;
  for (let v = schemaVersion; v < target; v++) {
    const upcast = upcasters[type]?.[v];
    if (!upcast)
      throw new EventRejectedError(`Event ${id}: no upcaster for ${type} v${v} → v${v + 1}`);
    try {
      payload = upcast(payload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new EventRejectedError(`Event ${id}: upcasting ${type} v${v} failed: ${reason}`);
    }
  }
  const parsed = EVENT_PAYLOAD_SCHEMAS[type].safeParse(payload);
  if (!parsed.success) {
    throw new EventRejectedError(`Event ${id}: bad ${type} payload: ${issuesText(parsed.error)}`);
  }
  return { ...envelope.data, type, schemaVersion: target, payload: parsed.data } as DomainEvent;
}
