import { z } from 'zod';
import { PORTRAIT_REF } from '../character/model';
import { MAX_CASTING_NOTES, MAX_CASTING_SHORT, MAX_SKILL_COST } from '../skills/library';

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
/** A portrait file name the server stored (M4.4); the bytes never enter the log. */
const portraitRef = z.string().regex(PORTRAIT_REF, 'must be a stored portrait file name');
/** MT.6: how a broadcast shows as a banner (seconds: 5 s to 24 h). */
const broadcastDisplay = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('pinned') }),
  z.strictObject({ mode: z.literal('timed'), seconds: z.number().int().min(5).max(86_400) }),
]);
const statValues = z.record(z.string().min(1), z.number().int().nonnegative());
/** One side of a shared contest (M7.3). */
const contestSide = z.strictObject({
  label: z.string().trim().min(1).max(80),
  value: z.number().nonnegative().max(1_000_000_000),
  grade: z.string().min(1).max(40),
  characterIds: z.array(z.string().min(1).max(100)).max(20),
  stat: z.string().min(1).max(100).nullable(),
});
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
/** Title library fields (M6.4): System text and percentage (optionally flat) bonuses. */
const titleDefFields = {
  name: nonBlank.max(80),
  text: z.string().trim().max(2000),
  bonuses: z.array(statBonus).max(30),
};
/** Loot table fields (M6.2). Weights are relative; counts per pick run min..max. */
const lootWeight = z.number().int().min(1).max(1_000_000);
const lootEntry = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('item'),
    itemId: recordId,
    weight: lootWeight,
    min: z.number().int().min(1).max(1_000_000),
    max: z.number().int().min(1).max(1_000_000),
  }),
  z.strictObject({
    kind: z.literal('currency'),
    weight: lootWeight,
    min: z.number().int().nonnegative().max(1_000_000_000),
    max: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.strictObject({ kind: z.literal('nothing'), weight: lootWeight }),
]);
const lootTableFields = {
  name: nonBlank,
  rolls: z.number().int().min(1).max(20),
  entries: z.array(lootEntry).min(1).max(50),
};
/** MU.4: one use of a skill costs a whole amount from one pool. */
const skillCost = z.strictObject({
  pool: recordId,
  amount: z.number().int().min(1).max(MAX_SKILL_COST),
});
/** Skill library entry fields (M4.1). Text is trimmed; blank means none. */
const skillDefFields = {
  name: nonBlank,
  rarity: recordId,
  tags: z.array(z.string().trim().max(40)).max(20),
  description: skillDescription.trim(),
  flavor: skillFlavor.trim(),
  effects: z.string().trim().max(4000),
  /** MU.4 spells: optional; absent on entries made before MU.4. */
  cost: skillCost.optional(),
  cooldown: z.string().trim().max(MAX_CASTING_SHORT).optional(),
  range: z.string().trim().max(MAX_CASTING_SHORT).optional(),
  castingNotes: z.string().trim().max(MAX_CASTING_NOTES).optional(),
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
const entityLevel = z.number().int().min(0).max(10_000);
/** M7.2: a bestiary entry's stats (stat id → whole value). */
const entityStats = z.record(z.string().min(1).max(40), z.number().int().min(0).max(1_000_000));
const entityNotes = z.string().max(4000);
/** M7.4: a faction's head count and its standing toward the party, in the GM's words. */
const factionMembers = z.number().int().min(0).max(1_000_000_000);
const factionStanding = z.string().trim().max(60);
const questNoticeTo = z.array(recordId).max(200).nullable();
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
    /** Optional since M4.4, so older payloads stay valid. */
    portrait: portraitRef.optional(),
  }),
  'character.renamed': z.strictObject({ characterId: recordId, name: nonBlank }),
  /** GM sets or clears (null) a character's portrait (M4.4). */
  'character.portraitSet': z.strictObject({
    characterId: recordId,
    portrait: portraitRef.nullable(),
  }),
  'character.professionGranted': z.strictObject({
    characterId: recordId,
    profession: nonBlank,
    /** MT.7 GM override: granted before the unlock grade (absent = false). */
    override: z.literal(true).optional(),
  }),
  /** The player takes one of their offered professions later (MQ.6; the Professions tab). */
  'profession.chosen': z.strictObject({ characterId: recordId, profession: nonBlank }),
  /** GM withdraws an untaken profession offer (M5.2, MQ.6 review). */
  'profession.offerWithdrawn': z.strictObject({ characterId: recordId, profession: nonBlank }),
  /** GM awards a title by name (M1.15; the title library, bonuses and System text are M6.4). */
  'title.awarded': z.strictObject({ characterId: recordId, title: nonBlank.max(80) }),
  /** GM adds a title to the title library (M6.4). */
  'titleDef.defined': z.strictObject({ id: recordId, ...titleDefFields }),
  /** GM edits a library title; omitted fields stay. Every holder follows the entry. */
  'titleDef.edited': z.strictObject({
    titleDefId: recordId,
    name: titleDefFields.name.optional(),
    text: titleDefFields.text.optional(),
    bonuses: titleDefFields.bonuses.optional(),
  }),
  /** GM sets current pool values; each must be within 0..max (D31). */
  'character.poolsSet': z.strictObject({
    characterId: recordId,
    pools: z.record(z.string().min(1), z.number().int()),
  }),
  /** GM override of base stats (audited sheet edit, M4.5); pools re-clamp. */
  'character.statsSet': z.strictObject({ characterId: recordId, stats: statValues }),
  /**
   * MT.5 (Q59, DESIGN §7 GM authority): the GM sets a character's levels, XP
   * and grade directly. Whatever the change skips (class spread, free points,
   * evolutions) is not granted; reached selections become due as usual.
   */
  'character.progressionSet': z.strictObject({
    characterId: recordId,
    grade: recordId,
    classLevel: z.number().int().min(0).max(10_000),
    professionLevel: z.number().int().min(0).max(10_000),
    xp: z.strictObject({
      class: z.number().int().min(0).max(100_000_000),
      profession: z.number().int().min(0).max(100_000_000),
    }),
  }),
  /**
   * GM XP award (DESIGN §5). `shares` are the parts of `amount` per
   * participant and must sum to it; each one's above-level bonus is derived
   * from `enemyLevel` on apply, and level-ups follow from the rules.
   */
  'xp.awarded': z.strictObject({
    track: z.enum(['class', 'profession']),
    amount: z.number().int().nonnegative().max(100_000_000),
    shares: z
      .array(
        z.strictObject({
          characterId: recordId,
          share: z.number().int().nonnegative(),
          /**
           * The character's race level when the award was made (M7.3, D71 gap a):
           * the above-level bonus is priced at it, so undoing an earlier award
           * cannot re-price this one. Absent in older events (priced at fold time).
           */
          raceLevel: z.number().int().nonnegative().max(10_000).optional(),
        }),
      )
      .min(1),
    enemyLevel: z.number().int().nonnegative().max(10_000).nullable(),
    /** Target's grade for the grade-gap XP factor (MQ.10); absent in older events. */
    enemyGrade: z.string().min(1).max(40).optional(),
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
    /**
     * MT.6 (Q60): also show it as a banner on players' screens, for a set
     * time or pinned until the GM removes it. Absent = the message list only.
     */
    display: broadcastDisplay.optional(),
  }),
  /** MT.6: the GM takes a broadcast's banner down (the message stays in the list). */
  'broadcast.removed': z.strictObject({ id: recordId }),
  /**
   * GM schedules a System broadcast for a later in-game day (M4.7, D159): it
   * is sent when the day counter reaches `day`. GM-only until then.
   */
  'broadcast.scheduled': z.strictObject({
    id: recordId,
    text: z
      .string()
      .trim()
      .min(1, 'must not be blank')
      .refine((t) => t.length <= 2000, 'must be at most 2000 characters'),
    characterIds: z.array(recordId).min(1).nullable(),
    day: z.number().int().min(2).max(100000),
  }),
  /** GM cancels a scheduled broadcast before it is sent (M4.7). */
  'broadcast.unscheduled': z.strictObject({ id: recordId }),
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
  /** GM adds a loot table (M6.2). */
  'lootTable.defined': z.strictObject({ id: recordId, ...lootTableFields }),
  /** GM edits a loot table; omitted fields stay. Past rolls keep what they gave. */
  'lootTable.edited': z.strictObject({
    tableId: recordId,
    name: lootTableFields.name.optional(),
    rolls: lootTableFields.rolls.optional(),
    entries: lootTableFields.entries.optional(),
  }),
  /**
   * GM rolls a loot table (M6.2): the picks the random source made and what
   * they give, so replay never rolls again. The reducer refuses a roll whose
   * picks no longer give `bundle` (an undone table edit cannot rewrite a past
   * roll). With a character, `bundle` goes to them as a GM gift.
   */
  'loot.rolled': z.strictObject({
    tableId: recordId,
    characterId: party,
    bundle,
    picks: z
      .array(
        z.strictObject({
          entry: z.number().int().nonnegative().max(49),
          count: z.number().int().nonnegative().max(1_000_000_000),
        }),
      )
      .min(1)
      .max(20),
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
    /** MC.7 review M4: the session it happened in, when not the event's own (GM only). */
    session: recordId.nullable().optional(),
  }),
  /** The GM corrects a practice entry (M5.5); omitted fields stay. Marks it reviewed. */
  'practice.edited': z.strictObject({
    entryId: recordId,
    action: nonBlank.optional(),
    skills: z.array(nonBlank).max(10).optional(),
    stat: recordId.nullable().optional(),
  }),
  /** The GM removes a practice entry (M5.5); montage focuses cannot be removed. */
  'practice.removed': z.strictObject({ entryId: recordId }),
  /** The GM marks practice entries reviewed (M5.5). */
  'practice.reviewed': z.strictObject({ entryIds: z.array(recordId).min(1).max(500) }),
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
  /**
   * MU.5: a skill with a cost is cast; the pool pays `amount` (priced when
   * cast) and the use is logged as practice for the GM's review (D271).
   */
  'skill.cast': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    pool: recordId,
    amount: z.number().int().min(1).max(MAX_SKILL_COST),
  }),
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
  /** GM hands a hand-written skill copy back to the library entry for its name and rarity (MR.4). */
  'skill.libraryTextUsed': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
  }),
  /** GM override (MT.7): a skill given outside the selection schedule. */
  'skill.granted': z.strictObject({
    characterId: recordId,
    name: nonBlank,
    rarity: recordId,
    kind: z.enum(['class', 'profession', 'race']),
    description: z.string().max(4000).nullable(),
    flavor: z.string().max(4000).nullable(),
  }),
  /** GM override (MT.7): a skill's rarity set directly, past every rule. */
  'skill.raritySet': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
    rarity: recordId,
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
    /** MT.7 GM override: past the one-mark-per-session rule (absent = false). */
    override: z.literal(true).optional(),
  }),
  /** GM applies a mark upgrade: one rarity up, marks reset. */
  'skill.upgraded': z.strictObject({ characterId: recordId, skill: nonBlank }),
  /** GM merges two skills logged together into a new one (originals consumed). */
  'skill.merged': z.strictObject({
    characterId: recordId,
    skills: z.tuple([nonBlank, nonBlank]),
    name: nonBlank,
    /** Stored before QF.39 (v1): replays without the race-skill and retired-name checks (D283). */
    legacy: z.literal(true).optional(),
  }),
  /**
   * GM sends a merge as an offer (MT.2, Q62); it waits on the player's answer.
   * A newer offer replaces an older one.
   */
  'skill.mergeOffered': z.strictObject({
    characterId: recordId,
    offerId: recordId,
    skills: z.tuple([nonBlank, nonBlank]),
    name: nonBlank,
    /** The merged skill's System text, applied on accept; optional, additive. */
    description: skillDescription.nullable().optional(),
    flavor: skillFlavor.nullable().optional(),
    /** MT.7 GM override: the merge rules are skipped, on offer and accept (absent = false). */
    override: z.literal(true).optional(),
    /** Stored before QF.39 (v1): replays without the race-skill and retired-name checks (D283). */
    legacy: z.literal(true).optional(),
  }),
  /** The player accepts (the merge applies) or declines (both originals stay) (MT.2). */
  'skill.mergeAnswered': z.strictObject({
    characterId: recordId,
    offerId: recordId,
    accept: z.boolean(),
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
    /** MU.4: null removes the cost; "" clears a text field. */
    cost: skillCost.nullable().optional(),
    cooldown: skillDefFields.cooldown,
    range: skillDefFields.range,
    castingNotes: skillDefFields.castingNotes,
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
  /**
   * GM withdraws a passed-over option (MQ.3, DESIGN §6): it stops appearing in
   * later menus. The name matches case-insensitively.
   */
  'selection.optionWithdrawn': z.strictObject({
    characterId: recordId,
    skill: nonBlank,
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
            .array(
              z.strictObject({
                skill: nonBlank,
                name: nonBlank,
                rarity: recordId,
                /** A second skill merged in and consumed (M5.2); optional, additive. */
                merge: nonBlank.optional(),
              }),
            )
            .max(10),
          classWeights: statValues.nullable(),
          /** One-time stat bonus on choosing this option (MQ.1, D98; v2). */
          statBonus: statValues,
        }),
      )
      .min(1)
      .max(10),
    professions: z.array(nonBlank).max(10),
    /**
     * Each kept skill's rarity after the evolution (MR.1, DESIGN §6); absent in
     * releases stored before MR.1, which re-rate nothing.
     */
    rerate: z
      .array(z.strictObject({ skill: nonBlank, rarity: recordId }))
      .max(200)
      .optional(),
    /**
     * The GM approved the re-rating (MT.1): skills the list does not name keep
     * their rarity, and a race skill is never lowered. Absent before MT.1.
     */
    rerateApproved: z.literal(true).optional(),
    /** MT.7 GM override: released (and chosen) with a skill selection pending (absent = false). */
    override: z.literal(true).optional(),
    /** Upcast from v1: released under the old rules (no pending-selection gate). */
    legacy: z.literal(true).optional(),
  }),
  /** The player (or GM) chooses a released option (and an offered profession, if any). */
  'evolution.chosen': z.strictObject({
    characterId: recordId,
    optionId: recordId,
    profession: nonBlank.nullable(),
    /** The release chosen from (its event id); absent only in logs from before it existed. */
    releaseId: recordId.optional(),
    /** Upcast from v1: chosen under the old rules (no gate, no refill, D99). */
    legacy: z.literal(true).optional(),
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
  // v2 (M7.A): removing a clock closes its open montages; a v1 event keeps
  // the old meaning on replay (`legacy`), so logs where a focus or close
  // followed the removal still load.
  'clock.removed': z.strictObject({ clockId: recordId, legacy: z.literal(true).optional() }),
  /** GM offers a montage on a clock that qualifies (M3.11, DESIGN §7). */
  'montage.offered': z.strictObject({
    montageId: recordId,
    clockId: recordId,
    label: nonBlank,
    characterIds: z.array(recordId).min(1).max(200),
    /** MT.7 GM override: offered before the clock qualifies (absent = false). */
    override: z.literal(true).optional(),
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
  /**
   * GM shares a contest roll with the table (M7.3, DESIGN §7). The roll was
   * made on the GM's screen; the result is derived from it on apply. The
   * characters on either side get a result pop-up.
   */
  'contest.shared': z.strictObject({
    contestId: recordId,
    a: contestSide,
    b: contestSide,
    mode: z.enum(['none', 'multiplier', 'lowerGradeFraction', 'gradeWalls']),
    roll: z.number().min(0).lt(1).nullable(),
    /**
     * The outcome as the table saw it, settled under the rules when shared, so
     * a later rules change or undo cannot flip a result players already saw.
     */
    yours: z.number().nonnegative(),
    theirs: z.number().nonnegative(),
    chance: z.number().min(0).max(1),
    walled: z.boolean(),
    success: z.boolean(),
  }),
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
    /**
     * MQ.7: who gets the hidden-quest notice (character ids); null or absent
     * (logs before MQ.7) = every character.
     */
    noticeTo: questNoticeTo.optional(),
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
    noticeTo: questNoticeTo.optional(),
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
    /** MQ.8: grade id and level for the Identify range; absent (older logs) = none. */
    grade: recordId.nullable().optional(),
    level: entityLevel.nullable().optional(),
    /** M7.2 bestiary (GM-only): stat values, or null; absent (older logs) = none. */
    stats: entityStats.nullable().optional(),
    /** M7.2 bestiary (GM-only) notes; absent (older logs) = "". */
    notes: entityNotes.optional(),
  }),
  /** GM edits an entity; omitted fields stay. */
  'entity.edited': z.strictObject({
    entityId: recordId,
    name: nonBlank.optional(),
    label: nonBlank.optional(),
    tiers: identifyTiers.optional(),
    grade: recordId.nullable().optional(),
    level: entityLevel.nullable().optional(),
    stats: entityStats.nullable().optional(),
    notes: entityNotes.optional(),
  }),
  /** These characters now know the entity and can Identify it. */
  'entity.revealed': z.strictObject({
    entityId: recordId,
    characterIds: z.array(recordId).min(1).max(200),
  }),
  /**
   * M7.4 hunger tracker, retired by MT.3 (DESIGN §7: no hunger tracker). Kept
   * so stored logs still parse; no command records it and it replays as a no-op.
   */
  'hunger.configured': z.strictObject({
    enabled: z.boolean(),
    steps: z.array(z.string().trim().min(1).max(40)).max(12),
  }),
  /** M7.4, retired by MT.3: kept so stored logs parse; replays as a no-op. */
  'hunger.levelsSet': z.strictObject({
    levels: z.record(recordId, z.number().int().min(0).max(11)),
  }),
  /** M7.4: GM adds a region (DESIGN §8). */
  'region.defined': z.strictObject({
    regionId: recordId,
    name: nonBlank,
    notes: entityNotes,
  }),
  /** M7.4: GM edits a region; omitted fields stay. */
  'region.edited': z.strictObject({
    regionId: recordId,
    name: nonBlank.optional(),
    notes: entityNotes.optional(),
  }),
  /** M7.4: the party is now in this region (it becomes visited), or nowhere set. */
  'region.currentSet': z.strictObject({ regionId: recordId.nullable() }),
  /** M7.4: GM adds a survivor faction (DESIGN §8). GM-only. */
  'faction.defined': z.strictObject({
    factionId: recordId,
    name: nonBlank,
    regionId: recordId.nullable(),
    members: factionMembers.nullable(),
    standing: factionStanding,
    notes: entityNotes,
  }),
  /** MC.3 review: GM removes a shop. GM-only. */
  'shop.removed': z.strictObject({ shopId: recordId }),
  /** MC.3: GM adds a shop (DESIGN §11). GM-only. */
  'shop.defined': z.strictObject({
    shopId: recordId,
    name: nonBlank,
    regionId: recordId.nullable(),
    keeper: entityNotes,
    wares: z
      .array(
        z.strictObject({ itemId: recordId, price: z.number().int().min(0).max(1_000_000_000) }),
      )
      .max(100),
    hook: entityNotes,
  }),
  /** M7.4: GM edits a faction; omitted fields stay. */
  'faction.edited': z.strictObject({
    factionId: recordId,
    name: nonBlank.optional(),
    regionId: recordId.nullable().optional(),
    members: factionMembers.nullable().optional(),
    standing: factionStanding.optional(),
    notes: entityNotes.optional(),
  }),
  /** MT.8 (Q69): the GM shows a faction's name and standing to players, or hides it again. */
  'faction.revealSet': z.strictObject({ factionId: recordId, revealed: z.boolean() }),
  /** The in-game day counter moves forward (quest timers count down). */
  'campaign.dayAdvanced': z.strictObject({ days: z.number().int().min(1).max(1000) }),
  /**
   * MR.3 (L16): a rules migration applied when a stored campaign loads. The
   * `xpOverflow` migration turns on `rules.xp.overflow` and applies the XP each
   * capped track had banked again under overflow (D153); `banked` lists it.
   */
  /**
   * M4.9: the GM's edited rules, whole (D161): replaces the campaign's rules
   * after validation. Stat, pool, grade, rarity and slot ids may not change.
   */
  'rules.edited': z.strictObject({ rules: z.unknown() }),
  'rules.migrated': z.strictObject({
    migration: z.literal('xpOverflow'),
    banked: z.array(
      z.strictObject({
        characterId: z.string(),
        track: z.enum(['class', 'profession']),
        xp: z.number().int().min(1),
      }),
    ),
  }),
  /** GM starts a play session (M4.3); events until its end carry its id. */
  'session.started': z.strictObject({ sessionId: recordId }),
  /** GM ends the running play session (the server backs up and writes the report). */
  'session.ended': z.strictObject({ sessionId: recordId }),
  /** MT.9 (Q63): the GM ends a scene; these players' screens ask what they practised. */
  'scene.ended': z.strictObject({ sceneId: recordId, characterIds: z.array(recordId).max(200) }),
  /** MT.9: a player answered the end-of-scene prompt (logged practice or nothing). */
  'scene.answered': z.strictObject({ sceneId: recordId, characterId: recordId }),
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
  'character.portraitSet': 1,
  'character.professionGranted': 1,
  'profession.chosen': 1,
  'profession.offerWithdrawn': 1,
  'title.awarded': 1,
  'titleDef.defined': 1,
  'titleDef.edited': 1,
  'character.poolsSet': 1,
  'character.statsSet': 1,
  'character.progressionSet': 1,
  'xp.awarded': 1,
  'freePoints.assigned': 1,
  'freePoints.overridden': 1,
  'system.broadcast': 1,
  'broadcast.scheduled': 1,
  'broadcast.unscheduled': 1,
  'broadcast.removed': 1,
  'item.defined': 1,
  'item.edited': 1,
  'holdings.adjusted': 1,
  'lootTable.defined': 1,
  'lootTable.edited': 1,
  'loot.rolled': 1,
  'gift.given': 1,
  'item.equipped': 1,
  'item.unequipped': 1,
  'trade.proposed': 1,
  'trade.accepted': 1,
  'trade.declined': 1,
  'trade.cancelled': 1,
  'practice.logged': 1,
  'practice.edited': 1,
  'practice.removed': 1,
  'practice.reviewed': 1,
  'note.created': 1,
  'note.edited': 1,
  'note.deleted': 1,
  'skill.cast': 1,
  'skill.nicknamed': 1,
  'skill.described': 1,
  'skill.uniqueSet': 1,
  'skill.raritySet': 1,
  'skill.granted': 1,
  'skill.libraryTextUsed': 1,
  'skill.markAwarded': 1,
  'skill.upgraded': 1,
  'skill.merged': 2,
  'skill.mergeOffered': 2,
  'skill.mergeAnswered': 1,
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
  'selection.optionWithdrawn': 1,
  'evolution.released': 2,
  'evolution.chosen': 2,
  'clock.created': 1,
  'clock.ticked': 1,
  'clock.removed': 2,
  'montage.offered': 1,
  'montage.focused': 1,
  'montage.closed': 1,
  'contest.shared': 1,
  'quest.created': 1,
  'quest.edited': 1,
  'quest.statusSet': 1,
  'stability.actionApplied': 1,
  'stability.nudged': 1,
  'entity.defined': 1,
  'entity.edited': 1,
  'entity.revealed': 1,
  'hunger.configured': 1,
  'hunger.levelsSet': 1,
  'region.defined': 1,
  'region.edited': 1,
  'region.currentSet': 1,
  'faction.defined': 1,
  'shop.defined': 1,
  'shop.removed': 1,
  'faction.edited': 1,
  'faction.revealSet': 1,
  'campaign.dayAdvanced': 1,
  'rules.migrated': 1,
  'rules.edited': 1,
  'session.started': 1,
  'session.ended': 1,
  'scene.ended': 1,
  'scene.answered': 1,
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
export const EVENT_UPCASTERS: EventUpcasters = {
  // MQ.1 (D98, D99, D103): options gain a stat bonus; events stored before it
  // keep the old rules on replay (no pending-selection gate, no pool refill).
  'evolution.released': {
    1: (payload) => {
      const p = payload as { options?: unknown };
      return {
        ...(payload as object),
        options: Array.isArray(p.options)
          ? p.options.map((o: unknown) => ({ ...(o as object), statBonus: {} }))
          : p.options,
        legacy: true,
      };
    },
  },
  'evolution.chosen': {
    1: (payload) => ({ ...(payload as object), legacy: true }),
  },
  // M7.A: v1 removals left the clock's open montages open.
  'clock.removed': {
    1: (payload) => ({ ...(payload as object), legacy: true }),
  },
  // Sweep C 2026-10-31 (D283): merges stored before QF.39 could take a race
  // skill or a retired name; they replay under those rules.
  'skill.merged': {
    1: (payload) => ({ ...(payload as object), legacy: true }),
  },
  'skill.mergeOffered': {
    1: (payload) => ({ ...(payload as object), legacy: true }),
  },
};

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
  'scene.answered',
  'montage.focused',
  'note.created',
  'note.edited',
  'note.deleted',
  'skill.nicknamed',
  'skill.cast',
  'skill.mergeAnswered',
  'selection.chosen',
  'evolution.chosen',
  'profession.chosen',
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
