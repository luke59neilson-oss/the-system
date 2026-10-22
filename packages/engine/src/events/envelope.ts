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
/** Skill System text (M3.5): trimmed by the engine; blank means none. */
const skillDescription = z.string().max(2000);
const skillFlavor = z.string().max(1000);
const statValues = z.record(z.string().min(1), z.number().int().nonnegative());
/** A party in a gift or trade: a character id, or null for the GM. */
const party = recordId.nullable();
const itemCount = z.number().int().positive().max(1_000_000);
const bundle = z.strictObject({
  currency: z.number().int().nonnegative().max(1_000_000_000),
  items: z.record(recordId, itemCount),
});
const statBonus = z.strictObject({
  stat: recordId,
  flat: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  percent: z.number().min(-0.99).max(100).optional(),
});
const itemFields = {
  name: nonBlank,
  rarity: recordId,
  description: z.string().trim().max(2000),
  slot: recordId.nullable(),
  bonuses: z.array(statBonus).max(30),
};
/** Skill library entry fields (M4.1). Text is trimmed; blank means none. */
const skillDefFields = {
  name: nonBlank,
  rarity: recordId,
  tags: z.array(z.string().trim().max(40)).max(20),
  description: skillDescription.trim(),
  flavor: skillFlavor.trim(),
  effects: z.string().trim().max(4000),
};
/** Class, race and profession library fields (M4.2). */
const librarySkillRef = z.strictObject({ name: nonBlank, rarity: recordId });
const classDefFields = {
  name: nonBlank,
  description: skillDescription.trim(),
  skills: z.array(librarySkillRef).max(20),
  weights: statValues,
};
const raceDefFields = { name: nonBlank, description: skillDescription.trim() };
const professionDefFields = {
  name: nonBlank,
  description: skillDescription.trim(),
  skills: z.array(librarySkillRef).max(10),
};
const stabilityRules = z.record(
  z.string().min(1).max(60),
  z.number().finite().min(-1_000).max(1_000),
);
const questText = z.string().trim().max(5000);
const questDays = z.number().int().min(1).max(10_000).nullable();
/** Identify tiers (M3.9, DESIGN §7): one text per minimum Identify rarity. */
const identifyTiers = z
  .array(z.strictObject({ minRarity: recordId, text: z.string().trim().min(1).max(1000) }))
  .min(1)
  .max(12);
const tradeAction = z.strictObject({ tradeId: recordId, characterId: party });
const distinctParties = (p: { characterId: string | null; to: string | null }) =>
  p.characterId !== p.to;

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
    /** `description`/`flavor` optional since M3.5, so older payloads stay valid. */
    classSkills: z.array(
      z.strictObject({
        name: nonBlank,
        rarity: z.string().min(1),
        description: skillDescription.optional(),
        flavor: skillFlavor.optional(),
      }),
    ),
    /** Optional since M1.4 (absent = equal weights), so v1 payloads stay valid. */
    classWeights: statValues.optional(),
  }),
  'character.renamed': z.strictObject({ characterId: recordId, name: nonBlank }),
  'character.professionGranted': z.strictObject({ characterId: recordId, profession: nonBlank }),
  /** GM awards a title by name (M1.15; the title library, bonuses and System text are M6.4). */
  'title.awarded': z.strictObject({ characterId: recordId, title: nonBlank.max(80) }),
  /** GM sets current pool values; each must be within 0..max (D31). */
  'character.poolsSet': z.strictObject({
    characterId: recordId,
    pools: z.record(z.string().min(1), z.number().int()),
  }),
  /** GM override of base stats (audited sheet edit, M4.5); pools re-clamp. */
  'character.statsSet': z.strictObject({ characterId: recordId, stats: statValues }),
  /**
   * GM XP award (DESIGN §5). `shares` are the parts of `amount` per
   * participant and must sum to it; each one's above-level bonus is derived
   * from `enemyLevel` on apply, and level-ups follow from the rules.
   */
  'xp.awarded': z.strictObject({
    track: z.enum(['class', 'profession']),
    amount: z.number().int().nonnegative().max(100_000_000),
    shares: z
      .array(z.strictObject({ characterId: recordId, share: z.number().int().nonnegative() }))
      .min(1),
    enemyLevel: z.number().int().nonnegative().max(10_000).nullable(),
    /** Free text for the session log ("Pale hunter pack"). */
    reason: z.string().trim().max(200),
  }),
  /** A player (or the GM) assigns one level-up's free points; the batch then locks (DESIGN §4). */
  'freePoints.assigned': z.strictObject({
    characterId: recordId,
    raceLevel: z.number().int().positive(),
    allocation: statValues,
  }),
  /** GM override of a batch: replace its allocation, or null to unassign and unlock it. */
  'freePoints.overridden': z.strictObject({
    characterId: recordId,
    raceLevel: z.number().int().positive(),
    allocation: statValues.nullable(),
  }),
  /**
   * GM System broadcast (DESIGN §7 "GM broadcasts"; ROADMAP MS.1/M4.7): a
   * System-style message to the listed characters, or to everyone when
   * `characterIds` is null. Changes no state; players receive it as a
   * notification addressed to their own character only.
   */
  'system.broadcast': z.strictObject({
    text: z
      .string()
      .trim()
      .min(1, 'must not be blank')
      .refine((t) => t.length <= 2000, 'must be at most 2000 characters'),
    characterIds: z.array(recordId).min(1).nullable(),
  }),
  /** GM adds an item definition to the campaign library (M1.7). */
  'item.defined': z.strictObject({ id: recordId, ...itemFields }),
  /** GM edits a definition (rarity edits etc.); every copy changes. Omitted fields stay. */
  'item.edited': z.strictObject({
    itemId: recordId,
    name: itemFields.name.optional(),
    rarity: itemFields.rarity.optional(),
    description: itemFields.description.optional(),
    slot: itemFields.slot.optional(),
    bonuses: itemFields.bonuses.optional(),
  }),
  /** GM gives or takes currency and items (signed deltas); nothing may go negative. */
  'holdings.adjusted': z.strictObject({
    characterId: recordId,
    currency: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    items: z.record(
      recordId,
      z
        .number()
        .int()
        .min(-1_000_000)
        .max(1_000_000)
        .refine((n) => n !== 0, 'must not be 0'),
    ),
    reason: z.string().trim().max(200),
  }),
  /** A one-way gift from the giver (`characterId`; null = GM) to `to` (null = GM). */
  'gift.given': z
    .strictObject({ characterId: party, to: party, bundle })
    .refine(distinctParties, 'giver and recipient must differ'),
  /** Moves one item from the inventory into a slot (a previous item there returns). */
  'item.equipped': z.strictObject({
    characterId: recordId,
    itemId: recordId,
    slot: recordId,
    index: z.number().int().nonnegative().max(100),
  }),
  'item.unequipped': z.strictObject({
    characterId: recordId,
    slot: recordId,
    index: z.number().int().nonnegative().max(100),
  }),
  /** Two-sided trade offer from `characterId` (null = GM) to `to` (null = GM). */
  'trade.proposed': z
    .strictObject({ tradeId: recordId, characterId: party, to: party, give: bundle, get: bundle })
    .refine(distinctParties, 'a trade needs two different parties'),
  /** The counterparty accepts: both sides move at once, or the event is rejected. */
  'trade.accepted': tradeAction,
  'trade.declined': tradeAction,
  /** The proposer withdraws an open offer. */
  'trade.cancelled': tradeAction,
  /** A practice log entry (M1.8): who did what, with which skills and/or stat. */
  'practice.logged': z.strictObject({
    characterId: recordId,
    action: nonBlank,
    skills: z.array(nonBlank).max(10),
    stat: recordId.nullable(),
    tags: z.array(nonBlank).max(20),
    source: z.enum(['gm', 'player', 'montage']),
  }),
  /** A note; `characterId` is the author as the actor acts (null = the GM). */
  'note.created': z.strictObject({
    noteId: recordId,
    characterId: recordId.nullable(),
    kind: z.enum(['journal', 'party', 'gm']),
    title: z.string().trim().max(200),
    body: z.string().max(20_000),
    tags: z.array(nonBlank).max(20),
    shareable: z.boolean(),
  }),
  /** Edits a note's text, tags or (journal) shareable flag; omitted fields stay. */
  'note.edited': z.strictObject({
    noteId: recordId,
    characterId: recordId.nullable(),
    title: z.string().trim().max(200).optional(),
    body: z.string().max(20_000).optional(),
    tags: z.array(nonBlank).max(20).optional(),
    shareable: z.boolean().optional(),
  }),
  'note.deleted': z.strictObject({ noteId: recordId, characterId: recordId.nullable() }),
  /** A player (or the GM) nicknames a skill; null or blank clears it (M1.9). */
  'skill.nicknamed': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    nickname: z.string().max(200).nullable(),
  }),
  /** GM writes a skill's System description and flavour; null or blank clears (M3.5). */
  'skill.described': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    description: skillDescription.nullable(),
    flavor: skillFlavor.nullable(),
  }),
  /** GM sets or clears a skill's Unique tag. */
  'skill.uniqueSet': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    unique: z.boolean(),
  }),
  /** GM confirms a mastery mark earned in a play session (end-of-session review). */
  'skill.markAwarded': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    session: recordId,
  }),
  /** GM applies a mark upgrade: one rarity up, marks reset. */
  'skill.upgraded': z.strictObject({ characterId: recordId, skill: nonBlank }),
  /** GM merges two skills logged together into a new one (originals consumed). */
  'skill.merged': z.strictObject({
    characterId: recordId,
    skills: z.tuple([nonBlank, nonBlank]),
    name: nonBlank,
  }),
  /** GM adds a skill to the campaign's skill library (M4.1; GM-only, D90). */
  'skillDef.defined': z.strictObject({ id: recordId, ...skillDefFields }),
  /** GM edits a library skill; omitted fields stay. Characters' granted skills keep their text. */
  'skillDef.edited': z.strictObject({
    skillDefId: recordId,
    name: skillDefFields.name.optional(),
    rarity: skillDefFields.rarity.optional(),
    tags: skillDefFields.tags.optional(),
    description: skillDefFields.description.optional(),
    flavor: skillDefFields.flavor.optional(),
    effects: skillDefFields.effects.optional(),
  }),
  /** GM adds a starting class to the class library (M4.2; GM-only). */
  'classDef.defined': z.strictObject({ id: recordId, ...classDefFields }),
  /** GM edits a library class; omitted fields stay. Existing characters are untouched. */
  'classDef.edited': z.strictObject({
    classDefId: recordId,
    name: classDefFields.name.optional(),
    description: classDefFields.description.optional(),
    skills: classDefFields.skills.optional(),
    weights: classDefFields.weights.optional(),
  }),
  /** GM adds a race to the race library (M4.2; GM-only). */
  'raceDef.defined': z.strictObject({ id: recordId, ...raceDefFields }),
  'raceDef.edited': z.strictObject({
    raceDefId: recordId,
    name: raceDefFields.name.optional(),
    description: raceDefFields.description.optional(),
  }),
  /** GM adds a profession to the profession library (M4.2; GM-only). */
  'professionDef.defined': z.strictObject({ id: recordId, ...professionDefFields }),
  'professionDef.edited': z.strictObject({
    professionDefId: recordId,
    name: professionDefFields.name.optional(),
    description: professionDefFields.description.optional(),
    skills: professionDefFields.skills.optional(),
  }),
  /**
   * GM adds the default library set in one go (M4.2): the entries are stored
   * in full, so changing the built-in defaults never changes a campaign.
   */
  'library.seeded': z.strictObject({
    skills: z.array(z.strictObject({ id: recordId, ...skillDefFields })).max(200),
    classes: z.array(z.strictObject({ id: recordId, ...classDefFields })).max(100),
    races: z.array(z.strictObject({ id: recordId, ...raceDefFields })).max(100),
    professions: z.array(z.strictObject({ id: recordId, ...professionDefFields })).max(100),
  }),
  /** GM offers (or re-offers) the skill menu for a reached selection level (M1.10). */
  'selection.offered': z.strictObject({
    characterId: recordId,
    level: z.number().int().positive().max(10_000),
    options: z
      .array(
        z.strictObject({
          name: nonBlank,
          rarity: recordId,
          kind: z.enum(['class', 'profession']),
          description: z.string().trim().max(2000),
        }),
      )
      .min(1)
      .max(10),
  }),
  /** The player (or GM) picks one offered option; the skill is granted. */
  'selection.chosen': z.strictObject({
    characterId: recordId,
    level: z.number().int().positive().max(10_000),
    skill: nonBlank,
    /** The offer chosen from (its event id); absent only in logs from before it existed. */
    offerId: recordId.optional(),
  }),
  /** GM releases an available evolution with its options (DESIGN §3 "held until released"). */
  'evolution.released': z.strictObject({
    characterId: recordId,
    options: z
      .array(
        z.strictObject({
          id: recordId,
          className: nonBlank,
          description: z.string().trim().max(2000),
          transforms: z
            .array(z.strictObject({ skill: nonBlank, name: nonBlank, rarity: recordId }))
            .max(10),
          classWeights: statValues.nullable(),
        }),
      )
      .min(1)
      .max(10),
    professions: z.array(nonBlank).max(10),
  }),
  /** The player (or GM) chooses a released option (and an offered profession, if any). */
  'evolution.chosen': z.strictObject({
    characterId: recordId,
    optionId: recordId,
    profession: nonBlank.nullable(),
    /** The release chosen from (its event id); absent only in logs from before it existed. */
    releaseId: recordId.optional(),
  }),
  /** GM starts a progress clock with N segments (M1.11, DESIGN §7). */
  'clock.created': z.strictObject({
    clockId: recordId,
    name: nonBlank,
    segments: z.number().int().min(1).max(24),
  }),
  /** Progress on a clock: a success fills `amount` segments; a failure is counted. */
  'clock.ticked': z.strictObject({
    clockId: recordId,
    result: z.enum(['success', 'failure']),
    amount: z.number().int().min(1).max(24),
  }),
  'clock.removed': z.strictObject({ clockId: recordId }),
  /** GM offers a montage on a clock that qualifies (M3.11, DESIGN §7). */
  'montage.offered': z.strictObject({
    montageId: recordId,
    clockId: recordId,
    label: nonBlank,
    characterIds: z.array(recordId).min(1).max(200),
  }),
  /** A player's one-line montage focus; also a practice entry (source "montage"). */
  'montage.focused': z.strictObject({
    montageId: recordId,
    characterId: recordId,
    action: nonBlank,
    skills: z.array(nonBlank).max(10),
    stat: recordId.nullable(),
  }),
  /** GM closes a montage (narrated, cost added); no more focuses. */
  'montage.closed': z.strictObject({ montageId: recordId }),
  /** GM creates a quest (M1.12, DESIGN §7), optionally with a day timer and World Stability. */
  'quest.created': z.strictObject({
    questId: recordId,
    title: nonBlank,
    text: questText,
    visible: z.boolean(),
    days: questDays,
    stability: z
      .strictObject({
        /** null = the configured starting value. */
        initial: z.number().finite().nullable(),
        visible: z.boolean(),
        rules: stabilityRules,
      })
      .nullable(),
  }),
  /** GM edits a quest; omitted fields stay. */
  'quest.edited': z.strictObject({
    questId: recordId,
    title: nonBlank.optional(),
    text: questText.optional(),
    visible: z.boolean().optional(),
    days: questDays.optional(),
    stabilityVisible: z.boolean().optional(),
    stabilityRules: stabilityRules.optional(),
  }),
  'quest.statusSet': z.strictObject({
    questId: recordId,
    status: z.enum(['active', 'completed', 'failed']),
  }),
  /** A tagged action moves World Stability by its rule's delta × count (clamped). */
  'stability.actionApplied': z.strictObject({
    questId: recordId,
    tag: z.string().min(1).max(60),
    count: z.number().int().min(1).max(100),
    /** Free text for the session log. */
    reason: z.string().trim().max(200),
  }),
  /** GM's manual nudge (clamped). */
  'stability.nudged': z.strictObject({
    questId: recordId,
    delta: z.number().finite().min(-1_000).max(1_000),
    reason: z.string().trim().max(200),
  }),
  /**
   * GM defines an entity players may Identify (M3.9): `name` is the GM's own
   * name, `label` what players see in their list; `knownBy` lists characters.
   */
  'entity.defined': z.strictObject({
    entityId: recordId,
    name: nonBlank,
    label: nonBlank,
    tiers: identifyTiers,
    knownBy: z.array(recordId).max(200),
  }),
  /** GM edits an entity; omitted fields stay. */
  'entity.edited': z.strictObject({
    entityId: recordId,
    name: nonBlank.optional(),
    label: nonBlank.optional(),
    tiers: identifyTiers.optional(),
  }),
  /** These characters now know the entity and can Identify it. */
  'entity.revealed': z.strictObject({
    entityId: recordId,
    characterIds: z.array(recordId).min(1).max(200),
  }),
  /** The in-game day counter moves forward (quest timers count down). */
  'campaign.dayAdvanced': z.strictObject({ days: z.number().int().min(1).max(1000) }),
  /** GM starts a play session (M4.3); events until its end carry its id. */
  'session.started': z.strictObject({ sessionId: recordId }),
  /** GM ends the running play session (the server backs up and writes the report). */
  'session.ended': z.strictObject({ sessionId: recordId }),
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
  'title.awarded': 1,
  'character.poolsSet': 1,
  'character.statsSet': 1,
  'xp.awarded': 1,
  'freePoints.assigned': 1,
  'freePoints.overridden': 1,
  'system.broadcast': 1,
  'item.defined': 1,
  'item.edited': 1,
  'holdings.adjusted': 1,
  'gift.given': 1,
  'item.equipped': 1,
  'item.unequipped': 1,
  'trade.proposed': 1,
  'trade.accepted': 1,
  'trade.declined': 1,
  'trade.cancelled': 1,
  'practice.logged': 1,
  'note.created': 1,
  'note.edited': 1,
  'note.deleted': 1,
  'skill.nicknamed': 1,
  'skill.described': 1,
  'skill.uniqueSet': 1,
  'skill.markAwarded': 1,
  'skill.upgraded': 1,
  'skill.merged': 1,
  'skillDef.defined': 1,
  'skillDef.edited': 1,
  'classDef.defined': 1,
  'classDef.edited': 1,
  'raceDef.defined': 1,
  'raceDef.edited': 1,
  'professionDef.defined': 1,
  'professionDef.edited': 1,
  'library.seeded': 1,
  'selection.offered': 1,
  'selection.chosen': 1,
  'evolution.released': 1,
  'evolution.chosen': 1,
  'clock.created': 1,
  'clock.ticked': 1,
  'clock.removed': 1,
  'montage.offered': 1,
  'montage.focused': 1,
  'montage.closed': 1,
  'quest.created': 1,
  'quest.edited': 1,
  'quest.statusSet': 1,
  'stability.actionApplied': 1,
  'stability.nudged': 1,
  'entity.defined': 1,
  'entity.edited': 1,
  'entity.revealed': 1,
  'campaign.dayAdvanced': 1,
  'session.started': 1,
  'session.ended': 1,
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
 * Event types a player actor may record, always about their own character.
 * Mirrors PLAYER_COMMANDS; enforced on every path into the log (append and
 * replay), not only in `execute`.
 */
export const PLAYER_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'freePoints.assigned',
  'gift.given',
  'item.equipped',
  'item.unequipped',
  'trade.proposed',
  'trade.accepted',
  'trade.declined',
  'trade.cancelled',
  'practice.logged',
  'montage.focused',
  'note.created',
  'note.edited',
  'note.deleted',
  'skill.nicknamed',
  'selection.chosen',
  'evolution.chosen',
]);

/** Throws when a player-recorded event is not one a player may cause. */
export function checkEventAuthority(event: DomainEvent): void {
  if (event.actor.role !== 'player') return;
  if (!PLAYER_EVENT_TYPES.has(event.type)) {
    throw new EventRejectedError(
      `Event ${event.id} (${event.type}): players cannot cause this event`,
    );
  }
  const target = (event.payload as { characterId?: unknown }).characterId;
  if (target !== event.actor.characterId) {
    throw new EventRejectedError(
      `Event ${event.id} (${event.type}): players may only act on their own character`,
    );
  }
}

/** True when any object in the JSON tree has an own "__proto__" key (zod records drop it). */
function hasProtoKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (Object.prototype.hasOwnProperty.call(value, '__proto__')) return true;
  return Object.values(value).some(hasProtoKey);
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
  if (hasProtoKey(plain))
    throw new EventRejectedError('Bad event: "__proto__" is not allowed as a key');
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
