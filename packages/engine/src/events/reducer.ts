import {
  CharacterRuleError,
  clampPools,
  createCharacter,
  grantProfession,
  takeOfferedProfession,
  poolMax,
  type Character,
} from '../character';
import {
  EMPTY_HOLDINGS,
  EconomyRuleError,
  applyBundle,
  equip,
  isEmptyBundle,
  itemEffectiveStats,
  unequip,
  validateItemDef,
  type Bundle,
  type Holdings,
  type ItemDef,
  type Trade,
} from '../economy';
import { canReadNote, skillPairCounts, type Note, type PracticeEntry } from '../practice';
import {
  awardMark,
  describeSkill,
  fillGrantedSkills,
  syncCharacterSkills,
  mergeSkills,
  setNickname,
  setUnique,
  upgradeSkill,
  validateSkillDef,
  type SkillDef,
} from '../skills';
import { awardXp, shareXp } from '../progression';
import {
  chooseEvolution,
  chooseSelection,
  withdrawPassedOver,
  offerSelection,
  releaseEvolution,
  retiredSkillNames,
} from '../evolution';
import { montageAvailable, newClock, tickClock, type Clock, type Montage } from '../resolution';
import { applyAction, checkStabilityRules, nudge, type Quest } from '../quests';
import { parseRulesConfig, type RulesConfig } from '../rules';
import { rankProblem, tierProblem, type Entity } from '../entities';
import {
  validateClassDef,
  validateProfessionDef,
  validateRaceDef,
  type ClassDef,
  type ProfessionDef,
  type RaceDef,
} from '../library';
import { EventRejectedError, type DomainEvent } from './envelope';

/** Bumped when the serialized campaign state shape changes, including any nested character change (snapshots, M2.1). v2: character v2. v3: broadcasts. v4: items, holdings, trades (M1.7). v5: practice log, notes (M1.8). v6: character v3 (skill marks, merges; M1.9). v7: character v4 (selections, evolution; M1.10). v8: progress clocks (M1.11). v9: quests, World Stability, day counter (M1.12). v10: character v5 (skill text; M3.5). v11: Identify entities (M3.9). v12: montages (M3.11). v13: skill library (M4.1). v14: class, race and profession libraries (M4.2). v15: play sessions (M4.3). v18: character v7 (profession offers; MQ.6). v19: quest `noticeTo` (hidden-quest notice; MQ.7). v20: entity `grade`/`level` (Identify range; MQ.8). v21: `rules.limits` (QF.3; a v20 snapshot has no limits, so it must be replayed). */
export const CAMPAIGN_STATE_SCHEMA_VERSION = 21;

/** A System broadcast as kept in state, so players who missed it live still get it. */
export interface BroadcastRecord {
  /** Id of the `system.broadcast` event. */
  readonly id: string;
  /** Event timestamp (ISO-8601 UTC). */
  readonly at: string;
  readonly text: string;
  /** Recipients; null = every character. */
  readonly characterIds: readonly string[] | null;
}

/** Plain, serializable campaign state: a pure fold over the effective events. */
export interface CampaignState {
  readonly schemaVersion: number;
  readonly name: string;
  readonly rules: RulesConfig;
  readonly characters: Readonly<Record<string, Character>>;
  /** Character ids in creation order (stable display order). */
  readonly characterOrder: readonly string[];
  /** GM broadcasts in order (DESIGN §7); players see only those addressed to them. */
  readonly broadcasts: readonly BroadcastRecord[];
  /** Item library by id (M1.7). */
  readonly items: Readonly<Record<string, ItemDef>>;
  /** Item ids in definition order. */
  readonly itemOrder: readonly string[];
  /** Skill library by id (M4.1). GM-only: fills granted skills' text by name. */
  readonly skillLibrary: Readonly<Record<string, SkillDef>>;
  /** Skill library ids in definition order. */
  readonly skillLibraryOrder: readonly string[];
  /** Starting class library by id (M4.2). GM-only. */
  readonly classLibrary: Readonly<Record<string, ClassDef>>;
  readonly classLibraryOrder: readonly string[];
  /** Race library by id (M4.2). GM-only. */
  readonly raceLibrary: Readonly<Record<string, RaceDef>>;
  readonly raceLibraryOrder: readonly string[];
  /** Profession library by id (M4.2). GM-only. */
  readonly professionLibrary: Readonly<Record<string, ProfessionDef>>;
  readonly professionLibraryOrder: readonly string[];
  /** Currency, inventory and equipment per character id; absent = nothing held. */
  readonly holdings: Readonly<Record<string, Holdings>>;
  /** Every trade ever proposed, by id (closed ones keep their outcome). */
  readonly trades: Readonly<Record<string, Trade>>;
  /** Trade ids in proposal order. */
  readonly tradeOrder: readonly string[];
  /** Practice log in order (M1.8). */
  readonly practice: readonly PracticeEntry[];
  /** Notes by id; journal notes are private to their author (see `projectForGm`). */
  readonly notes: Readonly<Record<string, Note>>;
  /** Note ids in creation order. */
  readonly noteOrder: readonly string[];
  /** Progress clocks by id (M1.11). */
  readonly clocks: Readonly<Record<string, Clock>>;
  /** Clock ids in creation order. */
  readonly clockOrder: readonly string[];
  /** Quests by id (M1.12). Hidden ones and stability rules never reach players. */
  readonly quests: Readonly<Record<string, Quest>>;
  /** Quest ids in creation order. */
  readonly questOrder: readonly string[];
  /** Identify entities by id (M3.9). Players see only known ones, at their tier. */
  readonly entities: Readonly<Record<string, Entity>>;
  /** Entity ids in definition order. */
  readonly entityOrder: readonly string[];
  /** Montages offered on clocks (M3.11). Players see only their own open offers. */
  readonly montages: Readonly<Record<string, Montage>>;
  /** Montage ids in offer order. */
  readonly montageOrder: readonly string[];
  /** In-game day counter, from 1 (quest timers count against it). */
  readonly day: number;
  /** Play sessions in start order (M4.3). GM-only. */
  readonly sessions: readonly SessionRecord[];
  /** Id of the running session; null between sessions. */
  readonly currentSession: string | null;
}

/** One play session (M4.3): numbered from 1 in start order. */
export interface SessionRecord {
  readonly id: string;
  readonly number: number;
  /** ISO-8601 UTC. */
  readonly startedAt: string;
  readonly startDay: number;
  /** Null while it runs. */
  readonly endedAt: string | null;
  readonly endDay: number | null;
}

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** A character's holdings (empty when they hold nothing yet). */
export function holdingsOf(state: CampaignState, characterId: string): Holdings {
  return hasOwn(state.holdings, characterId)
    ? (state.holdings[characterId] ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;
}

const fail = (event: DomainEvent, reason: string): never => {
  throw new EventRejectedError(`Event ${event.id} (${event.type}): ${reason}`);
};

function characterOf(state: CampaignState, event: DomainEvent, id: string): Character {
  const found = Object.prototype.hasOwnProperty.call(state.characters, id)
    ? state.characters[id]
    : undefined;
  return found ?? fail(event, `unknown character "${id}"`);
}

function withCharacter(state: CampaignState, character: Character): CampaignState {
  return { ...state, characters: { ...state.characters, [character.id]: character } };
}

function checkKeys(event: DomainEvent, keys: string[], known: readonly string[], what: string) {
  for (const key of keys) if (!known.includes(key)) fail(event, `unknown ${what} "${key}"`);
}

/** Runs a character or economy rule, turning rule errors into event rejections. */
function rule<T>(event: DomainEvent, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof CharacterRuleError || error instanceof EconomyRuleError) {
      return fail(event, error.message);
    }
    throw error;
  }
}

function itemOf(state: CampaignState, event: DomainEvent, id: string): ItemDef {
  const found = hasOwn(state.items, id) ? state.items[id] : undefined;
  return found ?? fail(event, `unknown item "${id}"`);
}

function withHoldings(
  state: CampaignState,
  characterId: string,
  holdings: Holdings,
): CampaignState {
  return { ...state, holdings: { ...state.holdings, [characterId]: holdings } };
}

/** Moves a bundle between parties (null = the GM: unlimited source, sink). Whole or nothing. */
function transfer(
  state: CampaignState,
  event: DomainEvent,
  from: string | null,
  to: string | null,
  bundle: Bundle,
): CampaignState {
  for (const itemId of Object.keys(bundle.items)) itemOf(state, event, itemId);
  const currencyName = state.rules.economy.currencyName;
  let next = state;
  if (from !== null) {
    characterOf(state, event, from);
    const held = rule(event, () =>
      applyBundle(holdingsOf(next, from), bundle, -1, state.items, currencyName),
    );
    next = withHoldings(next, from, held);
  }
  if (to !== null) {
    characterOf(state, event, to);
    const held = rule(event, () =>
      applyBundle(holdingsOf(next, to), bundle, 1, state.items, currencyName),
    );
    next = withHoldings(next, to, held);
  }
  return next;
}

function openTrade(state: CampaignState, event: DomainEvent, tradeId: string): Trade {
  const trade = hasOwn(state.trades, tradeId) ? state.trades[tradeId] : undefined;
  if (!trade) return fail(event, `unknown trade "${tradeId}"`);
  if (trade.status !== 'open') fail(event, `trade "${tradeId}" is already ${trade.status}`);
  return trade;
}

function closeTrade(
  state: CampaignState,
  event: DomainEvent,
  trade: Trade,
  status: Trade['status'],
): CampaignState {
  return {
    ...state,
    trades: { ...state.trades, [trade.id]: { ...trade, status, closedAt: event.timestamp } },
  };
}

/**
 * The author a note event acts as: a player acts as their own character, the
 * GM as null (the GM cannot write as a character), the system not at all.
 */
function noteAuthor(
  state: CampaignState,
  event: DomainEvent,
  claimed: string | null,
): string | null {
  const actor = event.actor;
  if (actor.role === 'system') return fail(event, 'the system does not write notes');
  const author = actor.role === 'player' ? actor.characterId : null;
  if (claimed !== author) fail(event, 'notes are written as yourself');
  if (author !== null) characterOf(state, event, author);
  return author;
}

const partyName = (id: string | null) => (id === null ? 'the GM' : `"${id}"`);

/**
 * Applies one domain event (not `event.undone`; the log handles undo).
 * Validates the event against the state and throws EventRejectedError when it
 * does not apply. Pure: never mutates `state`.
 *
 * Invariant (M3.7, D81): no current pool is ever above its maximum from the
 * character's effective stats (base + equipped items). After every event, a
 * character whose stats, holdings or item definitions changed has its pools
 * clamped down. Pools follow maxima (MQ.2, D100): when a maximum rises, a
 * pool that was full stays full; any other pool keeps its value, so a rising
 * maximum alone never heals.
 */
export function applyEvent(state: CampaignState | null, event: DomainEvent): CampaignState {
  const next = applyEventRaw(state, event);
  return state === null
    ? next
    : clampToEffective(state, fillFromLibrary(state, next, event), event);
}

/**
 * Granted skills take their empty text from the skill library (M4.1, D90).
 * Under `rules.skills.libraryByRarity` (MQ.12, L4) every copy the GM has not
 * edited follows its name-and-rarity entry: on a grant, a rarity change, and
 * whenever that entry is defined or edited.
 */
function fillFromLibrary(
  before: CampaignState,
  after: CampaignState,
  event: DomainEvent,
): CampaignState {
  if (after.skillLibraryOrder.length === 0) return after;
  if (after.rules.skills.libraryByRarity) return syncFromLibrary(before, after, event);
  if (before.characters === after.characters) return after;
  let characters: Record<string, Character> | null = null;
  for (const id of after.characterOrder) {
    const c = hasOwn(after.characters, id) ? after.characters[id] : undefined;
    const old = hasOwn(before.characters, id) ? before.characters[id] : undefined;
    if (!c || c === old) continue;
    const filled = fillGrantedSkills(old, c, after.skillLibrary);
    if (filled !== c) (characters ??= { ...after.characters })[id] = filled;
  }
  return characters === null ? after : { ...after, characters };
}

function syncFromLibrary(
  before: CampaignState,
  after: CampaignState,
  event: DomainEvent,
): CampaignState {
  // Entries this event defined or edited: their copies take the new text.
  const touchedIds =
    event.type === 'skillDef.defined'
      ? [event.payload.id]
      : event.type === 'skillDef.edited'
        ? [event.payload.skillDefId]
        : event.type === 'library.seeded'
          ? event.payload.skills.map((d) => d.id)
          : [];
  const touched = touchedIds.flatMap((id) =>
    hasOwn(after.skillLibrary, id) ? [after.skillLibrary[id] as SkillDef] : [],
  );
  if (touched.length === 0 && before.characters === after.characters) return after;
  let characters: Record<string, Character> | null = null;
  for (const id of after.characterOrder) {
    const c = hasOwn(after.characters, id) ? after.characters[id] : undefined;
    const old = hasOwn(before.characters, id) ? before.characters[id] : undefined;
    if (!c || (c === old && touched.length === 0)) continue;
    const synced = syncCharacterSkills(after.rules, old, c, after.skillLibrary, touched);
    if (synced !== c) (characters ??= { ...after.characters })[id] = synced;
  }
  return characters === null ? after : { ...after, characters };
}

function defineSkill(state: CampaignState, event: DomainEvent, def: SkillDef): CampaignState {
  if (hasOwn(state.skillLibrary, def.id)) fail(event, `library skill "${def.id}" already exists`);
  rule(event, () => validateSkillDef(state.rules, def, state.skillLibrary));
  return {
    ...state,
    skillLibrary: { ...state.skillLibrary, [def.id]: def },
    skillLibraryOrder: [...state.skillLibraryOrder, def.id],
  };
}

function defineClass(state: CampaignState, event: DomainEvent, def: ClassDef): CampaignState {
  if (hasOwn(state.classLibrary, def.id)) fail(event, `library class "${def.id}" already exists`);
  rule(event, () => validateClassDef(state.rules, def, state.classLibrary));
  return {
    ...state,
    classLibrary: { ...state.classLibrary, [def.id]: def },
    classLibraryOrder: [...state.classLibraryOrder, def.id],
  };
}

function defineRace(state: CampaignState, event: DomainEvent, def: RaceDef): CampaignState {
  if (hasOwn(state.raceLibrary, def.id)) fail(event, `library race "${def.id}" already exists`);
  rule(event, () => validateRaceDef(def, state.raceLibrary));
  return {
    ...state,
    raceLibrary: { ...state.raceLibrary, [def.id]: def },
    raceLibraryOrder: [...state.raceLibraryOrder, def.id],
  };
}

function defineProfession(
  state: CampaignState,
  event: DomainEvent,
  def: ProfessionDef,
): CampaignState {
  if (hasOwn(state.professionLibrary, def.id)) {
    fail(event, `library profession "${def.id}" already exists`);
  }
  rule(event, () => validateProfessionDef(state.rules, def, state.professionLibrary));
  return {
    ...state,
    professionLibrary: { ...state.professionLibrary, [def.id]: def },
    professionLibraryOrder: [...state.professionLibraryOrder, def.id],
  };
}

function entryOf<T>(
  event: DomainEvent,
  library: Readonly<Record<string, T>>,
  id: string,
  kind: string,
): T {
  const def = hasOwn(library, id) ? library[id] : undefined;
  if (def === undefined) return fail(event, `unknown library ${kind} "${id}"`);
  return def;
}

/** Refuses an edit that changes nothing (compared field by field as JSON). */
function unchanged<T extends object>(event: DomainEvent, def: T, old: T): void {
  // Keys sorted, so a record sent in another key order still counts as the same.
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v: unknown) =>
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : v,
    );
  const same = (Object.keys(def) as (keyof T)[]).every(
    (k) => canonical(def[k]) === canonical(old[k]),
  );
  if (same) fail(event, 'nothing to change');
}

function clampToEffective(
  before: CampaignState,
  after: CampaignState,
  event: DomainEvent,
): CampaignState {
  const itemsChanged = before.items !== after.items || before.rules !== after.rules;
  let out = after;
  for (const id of after.characterOrder) {
    const c = hasOwn(after.characters, id) ? after.characters[id] : undefined;
    if (!c) continue;
    if (
      !itemsChanged &&
      hasOwn(before.characters, id) &&
      before.characters[id] === c &&
      holdingsOf(before, id) === holdingsOf(after, id)
    ) {
      continue;
    }
    const stats = rule(event, () => effectiveOf(after, c));
    // Only changes pools that exist; never fills a missing one (D81).
    const capped = rule(event, () => clampPools(after.rules, stats, {}));
    const old = hasOwn(before.characters, id) ? before.characters[id] : undefined;
    const { fullPoolsStayFull, clampedPoolsNotFull } = after.rules.character;
    const oldMax =
      old && (fullPoolsStayFull || clampedPoolsNotFull)
        ? rule(event, () => maximaOf(before, old))
        : null;
    // MQ.15 (L7): pools a falling maximum clamped while they were not full.
    // Such a pool sits at its maximum but does not count as full, so putting
    // the gear back on never heals it.
    const notFull = new Set(clampedPoolsNotFull ? (c.clampedPools ?? []) : []);
    let pools: Record<string, number> | null = null;
    for (const p of after.rules.pools) {
      const current = hasOwn(c.pools, p.id) ? c.pools[p.id] : undefined;
      const max = capped[p.id] ?? 0;
      if (current === undefined) continue;
      const was = old && hasOwn(old.pools, p.id) ? old.pools[p.id] : undefined;
      const wasMax = oldMax && hasOwn(oldMax, p.id) ? oldMax[p.id] : undefined;
      // An event that writes the pool (a GM set, the evolution refill) ends
      // its clamped mark; a set to the same value counts too.
      if (current !== was || writesPool(event, id, p.id)) notFull.delete(p.id);
      const wasFull =
        was !== undefined &&
        wasMax !== undefined &&
        current === was &&
        wasMax > 0 &&
        was >= wasMax &&
        !notFull.has(p.id);
      if (current > max) {
        pools ??= { ...c.pools };
        pools[p.id] = max;
        // Stays full only if it was full before the drop (DESIGN §2, Q41).
        if (clampedPoolsNotFull && !wasFull) notFull.add(p.id);
        continue;
      }
      // A full pool stays full when its maximum rises (D100), unless this
      // event set the pool itself (detected by value: no event both raises a
      // maximum and writes a pool, except evolution, which fills it anyway).
      if (fullPoolsStayFull && wasFull && wasMax !== undefined && max > wasMax) {
        pools ??= { ...c.pools };
        pools[p.id] = max;
      }
      // A falling maximum that leaves a pool that was not full at its new
      // maximum marks it too (100/120 unequips to 100/100: not full, MQ.15
      // review).
      if (
        clampedPoolsNotFull &&
        wasMax !== undefined &&
        max < wasMax &&
        current === max &&
        !wasFull
      ) {
        notFull.add(p.id);
      }
      // Below its maximum, a pool is plainly not full: no mark needed.
      if ((pools?.[p.id] ?? current) < max) notFull.delete(p.id);
    }
    const marks = after.rules.pools.map((p) => p.id).filter((p) => notFull.has(p));
    const marksBefore = c.clampedPools ?? [];
    // With the rule off, marks are dropped, so turning it back on starts clean.
    const marksChanged =
      marks.length !== marksBefore.length || marks.some((m, i) => marksBefore[i] !== m);
    if (pools === null && !marksChanged) continue;
    let next: Character = { ...c, pools: pools ?? c.pools };
    if (marksChanged) {
      // The key is left out when empty, so states without marks keep their shape.
      const rest = Object.fromEntries(
        Object.entries(next).filter(([key]) => key !== 'clampedPools'),
      ) as unknown as Character;
      next = marks.length > 0 ? { ...rest, clampedPools: marks } : rest;
    }
    out = withCharacter(out, next);
  }
  return out;
}

/** Whether this event sets the pool's current value outright (MQ.15). */
function writesPool(event: DomainEvent, characterId: string, poolId: string): boolean {
  if (event.type === 'character.poolsSet') {
    return event.payload.characterId === characterId && hasOwn(event.payload.pools, poolId);
  }
  if (event.type === 'evolution.chosen') {
    return event.payload.characterId === characterId && event.payload.legacy !== true;
  }
  return false;
}

/** Every pool maximum of a character in this state, from effective stats. */
function maximaOf(state: CampaignState, c: Character): Readonly<Record<string, number>> {
  return clampPools(state.rules, effectiveOf(state, c), {});
}

/** Effective stats of a character in this state (base + equipped items). */
function effectiveOf(state: CampaignState, c: Character): Readonly<Record<string, number>> {
  const held = holdingsOf(state, c.id);
  // Fast path: nothing worn means no item bonuses (the common case per event).
  if (Object.keys(held.equipped).length === 0) return c.stats;
  return itemEffectiveStats(state.rules, c.stats, held, state.items);
}

function applyEventRaw(state: CampaignState | null, event: DomainEvent): CampaignState {
  if (event.type === 'campaign.created') {
    if (state !== null) fail(event, 'the campaign already exists');
    const parsed = parseRulesConfig(event.payload.rules);
    if (!parsed.ok) return fail(event, `invalid rules: ${parsed.errors.join('; ')}`);
    return {
      schemaVersion: CAMPAIGN_STATE_SCHEMA_VERSION,
      name: event.payload.name,
      rules: parsed.config,
      characters: {},
      characterOrder: [],
      broadcasts: [],
      items: {},
      itemOrder: [],
      skillLibrary: {},
      skillLibraryOrder: [],
      classLibrary: {},
      classLibraryOrder: [],
      raceLibrary: {},
      raceLibraryOrder: [],
      professionLibrary: {},
      professionLibraryOrder: [],
      holdings: {},
      trades: {},
      tradeOrder: [],
      practice: [],
      notes: {},
      noteOrder: [],
      clocks: {},
      clockOrder: [],
      quests: {},
      questOrder: [],
      entities: {},
      entityOrder: [],
      montages: {},
      montageOrder: [],
      day: 1,
      sessions: [],
      currentSession: null,
    };
  }
  if (state === null) return fail(event, 'the log must start with campaign.created');

  switch (event.type) {
    case 'character.created': {
      const { id } = event.payload;
      if (Object.prototype.hasOwnProperty.call(state.characters, id)) {
        fail(event, `character "${id}" already exists`);
      }
      const character = rule(event, () => createCharacter(state.rules, event.payload));
      return { ...withCharacter(state, character), characterOrder: [...state.characterOrder, id] };
    }
    case 'character.renamed': {
      const character = characterOf(state, event, event.payload.characterId);
      return withCharacter(state, { ...character, name: event.payload.name });
    }
    case 'character.portraitSet': {
      const character = characterOf(state, event, event.payload.characterId);
      if (character.portrait === event.payload.portrait) {
        fail(
          event,
          event.payload.portrait === null
            ? `${character.name} has no portrait`
            : `${character.name} already has that portrait`,
        );
      }
      return withCharacter(state, { ...character, portrait: event.payload.portrait });
    }
    case 'character.professionGranted': {
      const character = characterOf(state, event, event.payload.characterId);
      return withCharacter(
        state,
        rule(event, () => grantProfession(state.rules, character, event.payload.profession)),
      );
    }
    case 'profession.chosen': {
      const character = characterOf(state, event, event.payload.characterId);
      return withCharacter(
        state,
        rule(event, () => takeOfferedProfession(state.rules, character, event.payload.profession)),
      );
    }
    case 'title.awarded': {
      const character = characterOf(state, event, event.payload.characterId);
      const title = event.payload.title.trim();
      if (character.titles.some((t) => t.toLowerCase() === title.toLowerCase())) {
        fail(event, `${character.name} already holds [${title}]`);
      }
      return withCharacter(state, { ...character, titles: [...character.titles, title] });
    }
    case 'character.poolsSet': {
      const character = characterOf(state, event, event.payload.characterId);
      const { pools } = event.payload;
      checkKeys(
        event,
        Object.keys(pools),
        state.rules.pools.map((p) => p.id),
        'pool',
      );
      // Out-of-range values are rejected, not clamped, so an undo that would
      // change what a later pool set meant is refused (D31).
      for (const [poolId, value] of Object.entries(pools)) {
        const max = rule(event, () => poolMax(state.rules, effectiveOf(state, character), poolId));
        if (value < 0 || value > max) fail(event, `${poolId} must be between 0 and ${max}`);
      }
      return withCharacter(state, {
        ...character,
        pools: { ...character.pools, ...pools },
      });
    }
    case 'character.statsSet': {
      const character = characterOf(state, event, event.payload.characterId);
      const { stats } = event.payload;
      checkKeys(
        event,
        Object.keys(stats),
        state.rules.stats.list.map((s) => s.id),
        'stat',
      );
      const merged = { ...character.stats, ...stats };
      // Pools are clamped to the new effective maxima after the event (D81).
      return withCharacter(state, { ...character, stats: merged });
    }
    case 'xp.awarded': {
      const { track, amount, shares, enemyLevel, enemyGrade } = event.payload;
      if (enemyGrade !== undefined && !state.rules.grades.some((g) => g.id === enemyGrade)) {
        fail(event, `unknown grade "${enemyGrade}"`);
      }
      const ids = shares.map((s) => s.characterId);
      if (new Set(ids).size !== ids.length) fail(event, 'a participant is listed twice');
      const sum = shares.reduce((a, s) => a + s.share, 0);
      if (sum !== amount) fail(event, `shares sum to ${sum}, not the award of ${amount}`);
      let next = state;
      for (const { characterId, share } of shares) {
        const character = characterOf(state, event, characterId);
        const gained = shareXp(state.rules, character, share, enemyLevel, enemyGrade);
        const { character: leveled } = rule(event, () =>
          awardXp(state.rules, character, track, gained),
        );
        next = withCharacter(next, leveled);
      }
      return next;
    }
    case 'freePoints.assigned':
    case 'freePoints.overridden': {
      const character = characterOf(state, event, event.payload.characterId);
      const { raceLevel, allocation } = event.payload;
      const index = character.freePointBatches.findIndex((b) => b.raceLevel === raceLevel);
      const batch = character.freePointBatches[index];
      if (!batch) return fail(event, `no free-point batch for race level ${raceLevel}`);
      const assigning = event.type === 'freePoints.assigned';
      if (!assigning && allocation === null && batch.allocation === null) {
        fail(event, `the race level ${raceLevel} points are not assigned`);
      }
      if (assigning && batch.locked) {
        fail(event, `the race level ${raceLevel} points are already assigned and locked`);
      }
      const statIds = state.rules.stats.list.map((s) => s.id);
      const stats: Record<string, number> = { ...character.stats };
      for (const [id, points] of Object.entries(batch.allocation ?? {})) {
        stats[id] = (stats[id] ?? 0) - points;
      }
      if (allocation !== null) {
        checkKeys(event, Object.keys(allocation), statIds, 'stat');
        const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
        if (sum !== batch.points) {
          fail(event, `assign exactly ${batch.points} points (got ${sum})`);
        }
        for (const [id, points] of Object.entries(allocation))
          stats[id] = (stats[id] ?? 0) + points;
      }
      for (const [id, value] of Object.entries(stats)) {
        if (value < 0) fail(event, `${id} would drop below 0`);
      }
      const batches = [...character.freePointBatches];
      batches[index] = {
        ...batch,
        allocation: allocation === null ? null : { ...allocation },
        locked: allocation !== null,
      };
      return withCharacter(state, {
        ...character,
        stats,
        freePointBatches: batches,
      });
    }
    case 'system.broadcast': {
      const ids = event.payload.characterIds;
      if (ids !== null) {
        if (new Set(ids).size !== ids.length) fail(event, 'a recipient is listed twice');
        for (const id of ids) characterOf(state, event, id);
      } else if (state.characterOrder.length === 0) {
        fail(event, 'there is no one to broadcast to yet');
      }
      return {
        ...state,
        broadcasts: [
          ...state.broadcasts,
          {
            id: event.id,
            at: event.timestamp,
            text: event.payload.text,
            characterIds: ids === null ? null : [...ids],
          },
        ],
      };
    }
    case 'item.defined': {
      const { id, ...fields } = event.payload;
      if (hasOwn(state.items, id)) fail(event, `item "${id}" already exists`);
      const def = toItemDef(id, fields);
      rule(event, () => validateItemDef(state.rules, def));
      return {
        ...state,
        items: { ...state.items, [id]: def },
        itemOrder: [...state.itemOrder, id],
      };
    }
    case 'item.edited': {
      const { itemId, ...changes } = event.payload;
      const old = itemOf(state, event, itemId);
      if (Object.keys(changes).length === 0) fail(event, 'nothing to change');
      const def = toItemDef(itemId, {
        name: changes.name ?? old.name,
        rarity: changes.rarity ?? old.rarity,
        description: changes.description ?? old.description,
        slot: changes.slot === undefined ? old.slot : changes.slot,
        bonuses: changes.bonuses ?? old.bonuses,
      });
      rule(event, () => validateItemDef(state.rules, def));
      if (def.slot !== old.slot) {
        for (const characterId of state.characterOrder) {
          const worn = Object.entries(holdingsOf(state, characterId).equipped);
          if (worn.some(([key, id]) => id === itemId && !key.startsWith(`${def.slot}:`))) {
            fail(event, `[${old.name}] is equipped by "${characterId}"; unequip it first`);
          }
        }
      }
      return { ...state, items: { ...state.items, [itemId]: def } };
    }
    case 'skillDef.defined':
      return defineSkill(state, event, event.payload);
    case 'skillDef.edited': {
      const { skillDefId, ...changes } = event.payload;
      const old = hasOwn(state.skillLibrary, skillDefId)
        ? state.skillLibrary[skillDefId]
        : undefined;
      if (!old) return fail(event, `unknown library skill "${skillDefId}"`);
      const def: SkillDef = {
        id: skillDefId,
        name: changes.name ?? old.name,
        rarity: changes.rarity ?? old.rarity,
        tags: changes.tags ?? old.tags,
        description: changes.description ?? old.description,
        flavor: changes.flavor ?? old.flavor,
        effects: changes.effects ?? old.effects,
      };
      const same = (Object.keys(def) as (keyof SkillDef)[]).every(
        (k) => JSON.stringify(def[k]) === JSON.stringify(old[k]),
      );
      if (same) fail(event, 'nothing to change');
      rule(event, () => validateSkillDef(state.rules, def, state.skillLibrary));
      return { ...state, skillLibrary: { ...state.skillLibrary, [skillDefId]: def } };
    }
    case 'classDef.defined':
      return defineClass(state, event, event.payload);
    case 'classDef.edited': {
      const { classDefId, ...changes } = event.payload;
      const old = entryOf(event, state.classLibrary, classDefId, 'class');
      const def: ClassDef = {
        id: classDefId,
        name: changes.name ?? old.name,
        description: changes.description ?? old.description,
        skills: changes.skills ?? old.skills,
        weights: changes.weights ?? old.weights,
      };
      unchanged(event, def, old);
      rule(event, () => validateClassDef(state.rules, def, state.classLibrary));
      return { ...state, classLibrary: { ...state.classLibrary, [classDefId]: def } };
    }
    case 'raceDef.defined':
      return defineRace(state, event, event.payload);
    case 'raceDef.edited': {
      const { raceDefId, ...changes } = event.payload;
      const old = entryOf(event, state.raceLibrary, raceDefId, 'race');
      const def: RaceDef = {
        id: raceDefId,
        name: changes.name ?? old.name,
        description: changes.description ?? old.description,
      };
      unchanged(event, def, old);
      rule(event, () => validateRaceDef(def, state.raceLibrary));
      return { ...state, raceLibrary: { ...state.raceLibrary, [raceDefId]: def } };
    }
    case 'professionDef.defined':
      return defineProfession(state, event, event.payload);
    case 'professionDef.edited': {
      const { professionDefId, ...changes } = event.payload;
      const old = entryOf(event, state.professionLibrary, professionDefId, 'profession');
      const def: ProfessionDef = {
        id: professionDefId,
        name: changes.name ?? old.name,
        description: changes.description ?? old.description,
        skills: changes.skills ?? old.skills,
      };
      unchanged(event, def, old);
      rule(event, () => validateProfessionDef(state.rules, def, state.professionLibrary));
      return {
        ...state,
        professionLibrary: { ...state.professionLibrary, [professionDefId]: def },
      };
    }
    case 'library.seeded': {
      const { skills, classes, races, professions } = event.payload;
      if (skills.length + classes.length + races.length + professions.length === 0) {
        fail(event, 'nothing to add');
      }
      let next = state;
      for (const def of skills) next = defineSkill(next, event, def);
      for (const def of classes) next = defineClass(next, event, def);
      for (const def of races) next = defineRace(next, event, def);
      for (const def of professions) next = defineProfession(next, event, def);
      return next;
    }
    case 'holdings.adjusted': {
      const { characterId, currency, items } = event.payload;
      characterOf(state, event, characterId);
      if (currency === 0 && Object.keys(items).length === 0) fail(event, 'nothing to adjust');
      for (const itemId of Object.keys(items)) itemOf(state, event, itemId);
      const plus: Bundle = {
        currency: Math.max(0, currency),
        items: Object.fromEntries(Object.entries(items).filter(([, n]) => n > 0)),
      };
      const minus: Bundle = {
        currency: Math.max(0, -currency),
        items: Object.fromEntries(
          Object.entries(items)
            .filter(([, n]) => n < 0)
            .map(([k, n]) => [k, -n]),
        ),
      };
      return transfer(
        transfer(state, event, characterId, null, minus),
        event,
        null,
        characterId,
        plus,
      );
    }
    case 'gift.given': {
      const { characterId, to, bundle } = event.payload;
      if (isEmptyBundle(bundle)) fail(event, 'a gift needs currency or items');
      return transfer(state, event, characterId, to, bundle);
    }
    case 'item.equipped': {
      const { characterId, itemId, slot, index } = event.payload;
      characterOf(state, event, characterId);
      const def = itemOf(state, event, itemId);
      const held = rule(event, () =>
        equip(state.rules, holdingsOf(state, characterId), def, slot, index),
      );
      return withHoldings(state, characterId, held);
    }
    case 'item.unequipped': {
      const { characterId, slot, index } = event.payload;
      characterOf(state, event, characterId);
      const held = rule(event, () => unequip(holdingsOf(state, characterId), slot, index));
      return withHoldings(state, characterId, held);
    }
    case 'trade.proposed': {
      const { tradeId, characterId: from, to, give, get } = event.payload;
      if (hasOwn(state.trades, tradeId)) fail(event, `trade "${tradeId}" already exists`);
      if (isEmptyBundle(give) && isEmptyBundle(get)) fail(event, 'a trade needs something on it');
      if (from !== null) characterOf(state, event, from);
      if (to !== null) characterOf(state, event, to);
      for (const itemId of [...Object.keys(give.items), ...Object.keys(get.items)]) {
        itemOf(state, event, itemId);
      }
      // The proposer must hold what they offer now; it is checked again on accept.
      if (from !== null) {
        rule(event, () =>
          applyBundle(
            holdingsOf(state, from),
            give,
            -1,
            state.items,
            state.rules.economy.currencyName,
          ),
        );
      }
      const trade: Trade = {
        id: tradeId,
        from,
        to,
        give,
        get,
        status: 'open',
        proposedAt: event.timestamp,
        closedAt: null,
      };
      return {
        ...state,
        trades: { ...state.trades, [tradeId]: trade },
        tradeOrder: [...state.tradeOrder, tradeId],
      };
    }
    case 'trade.accepted':
    case 'trade.declined':
    case 'trade.cancelled': {
      const trade = openTrade(state, event, event.payload.tradeId);
      const by = event.payload.characterId;
      const cancelling = event.type === 'trade.cancelled';
      const expected = cancelling ? trade.from : trade.to;
      if (by !== expected) {
        fail(
          event,
          cancelling
            ? `only ${partyName(trade.from)} can cancel this trade`
            : `only ${partyName(trade.to)} can answer this trade`,
        );
      }
      if (event.type !== 'trade.accepted') {
        return closeTrade(state, event, trade, cancelling ? 'cancelled' : 'declined');
      }
      // Each side must hold its part before anything moves (not via what it receives).
      const currencyName = state.rules.economy.currencyName;
      for (const [party, bundle] of [
        [trade.from, trade.give],
        [trade.to, trade.get],
      ] as const) {
        if (party === null) continue;
        characterOf(state, event, party);
        rule(event, () =>
          applyBundle(holdingsOf(state, party), bundle, -1, state.items, currencyName),
        );
      }
      const moved = transfer(
        transfer(state, event, trade.from, trade.to, trade.give),
        event,
        trade.to,
        trade.from,
        trade.get,
      );
      return closeTrade(moved, event, trade, 'accepted');
    }
    case 'practice.logged': {
      const { characterId, action, skills, stat, tags, source } = event.payload;
      const character = characterOf(state, event, characterId);
      if (event.actor.role === 'player' && source !== 'player') {
        fail(event, 'players log practice with source "player"');
      }
      if (event.actor.role !== 'player' && source === 'player') {
        fail(event, 'source "player" is for entries a player logs');
      }
      if (skills.length === 0 && stat === null) fail(event, 'name a skill or a stat');
      if (new Set(skills).size !== skills.length) fail(event, 'a skill is listed twice');
      const known = new Set(character.skills.map((s) => s.name));
      for (const name of skills) {
        if (!known.has(name)) fail(event, `${character.name} has no skill "${name}"`);
      }
      if (stat !== null)
        checkKeys(
          event,
          [stat],
          state.rules.stats.list.map((s) => s.id),
          'stat',
        );
      const entry: PracticeEntry = {
        id: event.id,
        at: event.timestamp,
        sessionId: event.sessionId,
        characterId,
        action,
        skills: [...skills],
        stat,
        tags: [...tags],
        source,
      };
      return { ...state, practice: [...state.practice, entry] };
    }
    case 'montage.offered': {
      const { montageId, clockId, label, characterIds } = event.payload;
      if (hasOwn(state.montages, montageId)) fail(event, `montage "${montageId}" already exists`);
      const clock = hasOwn(state.clocks, clockId) ? state.clocks[clockId] : undefined;
      if (!clock) return fail(event, `unknown clock "${clockId}"`);
      if (!montageAvailable(state.rules, clock)) {
        fail(event, `"${clock.name}" does not qualify for a montage yet`);
      }
      if (new Set(characterIds).size !== characterIds.length) {
        fail(event, 'a character is listed twice');
      }
      for (const id of characterIds) characterOf(state, event, id);
      const montage: Montage = {
        id: montageId,
        clockId,
        label,
        characterIds: [...characterIds],
        focuses: {},
        status: 'open',
        offeredAt: event.timestamp,
      };
      return {
        ...state,
        montages: { ...state.montages, [montageId]: montage },
        montageOrder: [...state.montageOrder, montageId],
      };
    }
    case 'montage.focused': {
      const { montageId, characterId, action, skills, stat } = event.payload;
      const montage = hasOwn(state.montages, montageId) ? state.montages[montageId] : undefined;
      // A player cannot tell another character's montage from a missing one.
      if (
        !montage ||
        (event.actor.role === 'player' && !montage.characterIds.includes(characterId))
      ) {
        return fail(event, `unknown montage "${montageId}"`);
      }
      if (!montage.characterIds.includes(characterId)) {
        fail(event, 'this montage was not offered to that character');
      }
      if (montage.status !== 'open') fail(event, 'this montage is closed');
      if (hasOwn(montage.focuses, characterId)) fail(event, 'a focus was already given');
      const character = characterOf(state, event, characterId);
      if (new Set(skills).size !== skills.length) fail(event, 'a skill is listed twice');
      const known = new Set(character.skills.map((sk) => sk.name));
      for (const name of skills) {
        if (!known.has(name)) fail(event, `${character.name} has no skill "${name}"`);
      }
      if (stat !== null)
        checkKeys(
          event,
          [stat],
          state.rules.stats.list.map((st) => st.id),
          'stat',
        );
      const entry: PracticeEntry = {
        id: event.id,
        at: event.timestamp,
        sessionId: event.sessionId,
        characterId,
        action,
        skills: [...skills],
        stat,
        tags: [],
        source: 'montage',
      };
      return {
        ...state,
        practice: [...state.practice, entry],
        montages: {
          ...state.montages,
          [montageId]: { ...montage, focuses: { ...montage.focuses, [characterId]: event.id } },
        },
      };
    }
    case 'montage.closed': {
      const { montageId } = event.payload;
      const montage = hasOwn(state.montages, montageId) ? state.montages[montageId] : undefined;
      if (!montage) return fail(event, `unknown montage "${montageId}"`);
      if (montage.status === 'closed') fail(event, 'this montage is already closed');
      return {
        ...state,
        montages: { ...state.montages, [montageId]: { ...montage, status: 'closed' } },
      };
    }
    case 'note.created': {
      const { noteId, kind, title, body, tags, shareable } = event.payload;
      const author = noteAuthor(state, event, event.payload.characterId);
      if (hasOwn(state.notes, noteId)) fail(event, `note "${noteId}" already exists`);
      if (kind === 'journal' && author === null) fail(event, 'only a player keeps a journal');
      if (kind === 'gm' && author !== null) fail(event, 'only the GM writes GM notes');
      if (kind !== 'journal' && shareable !== (kind === 'party')) {
        fail(event, `${kind} notes are ${kind === 'party' ? 'always' : 'never'} shared`);
      }
      if (title === '' && body.trim() === '') fail(event, 'a note needs a title or text');
      const note: Note = {
        id: noteId,
        kind,
        author,
        title,
        body,
        tags: [...tags],
        shareable,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      return {
        ...state,
        notes: { ...state.notes, [noteId]: note },
        noteOrder: [...state.noteOrder, noteId],
      };
    }
    case 'note.edited':
    case 'note.deleted': {
      const { noteId } = event.payload;
      const note = hasOwn(state.notes, noteId) ? state.notes[noteId] : undefined;
      if (!note) return fail(event, `unknown note "${noteId}"`);
      const by = noteAuthor(state, event, event.payload.characterId);
      // A player cannot tell a note they may not read from a missing one (M3.10).
      if (by !== null && !canReadNote(note, by)) fail(event, `unknown note "${noteId}"`);
      // Journal: its author only. Party: its author or the GM. GM notes: the GM.
      const allowed =
        note.kind === 'journal' ? by === note.author : by === null || by === note.author;
      if (!allowed) fail(event, 'only the author can change this note');
      if (event.type === 'note.deleted') {
        const notes: Record<string, Note> = { ...state.notes };
        delete notes[noteId];
        return { ...state, notes, noteOrder: state.noteOrder.filter((id) => id !== noteId) };
      }
      const { title, body, tags, shareable } = event.payload;
      if ([title, body, tags, shareable].every((v) => v === undefined)) {
        fail(event, 'nothing to change');
      }
      if (shareable !== undefined && note.kind !== 'journal' && shareable !== note.shareable) {
        fail(event, 'only journal entries can change who reads them');
      }
      const next: Note = {
        ...note,
        title: title ?? note.title,
        body: body ?? note.body,
        tags: tags === undefined ? note.tags : [...tags],
        shareable: shareable ?? note.shareable,
        updatedAt: event.timestamp,
      };
      if (next.title === '' && next.body.trim() === '') fail(event, 'a note needs a title or text');
      return { ...state, notes: { ...state.notes, [noteId]: next } };
    }
    case 'skill.nicknamed': {
      const { characterId, skill, nickname } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () => setNickname(character, skill, nickname)),
      );
    }
    case 'skill.described': {
      const { characterId, skill, description, flavor } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () =>
          describeSkill(character, skill, description, flavor, state.rules.skills.libraryByRarity),
        ),
      );
    }
    case 'skill.uniqueSet': {
      const { characterId, skill, unique } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () => setUnique(character, skill, unique)),
      );
    }
    case 'skill.markAwarded': {
      const { characterId, skill, session } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () => awardMark(state.rules, character, skill, session)),
      );
    }
    case 'skill.upgraded': {
      const { characterId, skill } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () => upgradeSkill(state.rules, character, skill)),
      );
    }
    case 'skill.merged': {
      const { characterId, skills, name } = event.payload;
      const [first, second] = skills;
      const character = characterOf(state, event, characterId);
      const [a, b] = first < second ? [first, second] : [second, first];
      const joint =
        skillPairCounts(state.practice, characterId).find(
          (p) => p.skills[0] === a && p.skills[1] === b,
        )?.count ?? 0;
      return withCharacter(
        state,
        rule(event, () => mergeSkills(state.rules, character, first, second, name, joint)),
      );
    }
    case 'selection.optionWithdrawn': {
      const character = characterOf(state, event, event.payload.characterId);
      return withCharacter(
        state,
        rule(event, () => withdrawPassedOver(character, event.payload.skill)),
      );
    }
    case 'selection.offered':
    case 'selection.chosen': {
      const { characterId, level } = event.payload;
      const character = characterOf(state, event, characterId);
      const retired = retiredFor(state, character);
      return withCharacter(
        state,
        rule(event, () =>
          event.type === 'selection.offered'
            ? offerSelection(
                state.rules,
                character,
                level,
                event.payload.options,
                retired,
                event.id,
              )
            : chooseSelection(
                state.rules,
                character,
                level,
                event.payload.skill,
                retired,
                event.payload.offerId ?? null,
              ),
        ),
      );
    }
    case 'evolution.released': {
      const { characterId, options, professions, legacy } = event.payload;
      const character = characterOf(state, event, characterId);
      return withCharacter(
        state,
        rule(event, () =>
          releaseEvolution(
            state.rules,
            character,
            options,
            professions,
            retiredFor(state, character),
            event.id,
            legacy === true,
          ),
        ),
      );
    }
    case 'evolution.chosen': {
      const { characterId, optionId, profession } = event.payload;
      const character = characterOf(state, event, characterId);
      const result = rule(event, () =>
        chooseEvolution(
          state.rules,
          character,
          optionId,
          profession,
          retiredFor(state, character),
          event.payload.releaseId ?? null,
          event.payload.legacy === true,
        ),
      );
      // Practice entries follow transformed skills, so pair counts carry over.
      const renamed = new Map(result.renames);
      const practice =
        renamed.size === 0
          ? state.practice
          : state.practice.map((entry) =>
              entry.characterId === characterId && entry.skills.some((n) => renamed.has(n))
                ? { ...entry, skills: entry.skills.map((n) => renamed.get(n) ?? n) }
                : entry,
            );
      // Evolution refills every pool to its effective maximum, titles and
      // items included (D99); old events keep the old rules (D110).
      let evolved = result.character;
      if (event.payload.legacy !== true) {
        const stats = rule(event, () => effectiveOf(state, evolved));
        const full: Record<string, number> = {};
        for (const p of state.rules.pools) {
          full[p.id] = rule(event, () => poolMax(state.rules, stats, p.id));
        }
        evolved = { ...evolved, pools: full };
      }
      return { ...withCharacter(state, evolved), practice };
    }
    case 'clock.created': {
      const { clockId, name, segments } = event.payload;
      if (hasOwn(state.clocks, clockId)) fail(event, `clock "${clockId}" already exists`);
      const clock = rule(event, () => newClock(clockId, name, segments, event.timestamp));
      return {
        ...state,
        clocks: { ...state.clocks, [clockId]: clock },
        clockOrder: [...state.clockOrder, clockId],
      };
    }
    case 'clock.ticked':
    case 'clock.removed': {
      const { clockId } = event.payload;
      const clock = hasOwn(state.clocks, clockId) ? state.clocks[clockId] : undefined;
      if (!clock) return fail(event, `unknown clock "${clockId}"`);
      if (event.type === 'clock.removed') {
        const clocks: Record<string, Clock> = { ...state.clocks };
        delete clocks[clockId];
        return { ...state, clocks, clockOrder: state.clockOrder.filter((id) => id !== clockId) };
      }
      const ticked = rule(event, () =>
        tickClock(clock, event.payload.result, event.payload.amount),
      );
      return { ...state, clocks: { ...state.clocks, [clockId]: ticked } };
    }
    case 'quest.created': {
      const { questId, title, text, visible, days, stability } = event.payload;
      if (hasOwn(state.quests, questId)) fail(event, `quest "${questId}" already exists`);
      const noticeTo = checkNoticeTo(state, event, event.payload.noticeTo ?? null);
      const range = state.rules.stability;
      if (stability) {
        rule(event, () => checkStabilityRules(state.rules, stability.rules));
        if (
          stability.initial !== null &&
          (stability.initial < range.min || stability.initial > range.max)
        ) {
          fail(event, `stability must start between ${range.min} and ${range.max}`);
        }
      }
      const quest: Quest = {
        id: questId,
        title,
        text,
        status: 'active',
        visible,
        days,
        startDay: state.day,
        stability: stability
          ? {
              value: stability.initial ?? range.initial,
              visible: stability.visible,
              rules: { ...stability.rules },
            }
          : null,
        createdAt: event.timestamp,
        noticeTo,
      };
      return {
        ...state,
        quests: { ...state.quests, [questId]: quest },
        questOrder: [...state.questOrder, questId],
      };
    }
    case 'quest.edited':
    case 'quest.statusSet':
    case 'stability.actionApplied':
    case 'stability.nudged': {
      const quest = hasOwn(state.quests, event.payload.questId)
        ? state.quests[event.payload.questId]
        : undefined;
      if (!quest) return fail(event, `unknown quest "${event.payload.questId}"`);
      const withQuest = (q: Quest): CampaignState => ({
        ...state,
        quests: { ...state.quests, [q.id]: q },
      });
      switch (event.type) {
        case 'quest.edited': {
          const { title, text, visible, days, stabilityVisible, stabilityRules, noticeTo } =
            event.payload;
          if (
            [title, text, visible, days, stabilityVisible, stabilityRules, noticeTo].every(
              (v) => v === undefined,
            )
          ) {
            fail(event, 'nothing to change');
          }
          if (
            (stabilityVisible !== undefined || stabilityRules !== undefined) &&
            !quest.stability
          ) {
            fail(event, 'this quest has no World Stability');
          }
          if (stabilityRules !== undefined) {
            rule(event, () => checkStabilityRules(state.rules, stabilityRules));
          }
          return withQuest({
            ...quest,
            title: title ?? quest.title,
            text: text ?? quest.text,
            visible: visible ?? quest.visible,
            days: days === undefined ? quest.days : days,
            noticeTo:
              noticeTo === undefined ? quest.noticeTo : checkNoticeTo(state, event, noticeTo),
            stability: quest.stability && {
              ...quest.stability,
              visible: stabilityVisible ?? quest.stability.visible,
              rules: stabilityRules === undefined ? quest.stability.rules : { ...stabilityRules },
            },
          });
        }
        case 'quest.statusSet':
          if (event.payload.status === quest.status)
            fail(event, `the quest is already ${quest.status}`);
          return withQuest({ ...quest, status: event.payload.status });
        case 'stability.actionApplied':
          return withQuest(
            rule(event, () =>
              applyAction(state.rules, quest, event.payload.tag, event.payload.count),
            ),
          );
        case 'stability.nudged':
          return withQuest(rule(event, () => nudge(state.rules, quest, event.payload.delta)));
      }
      return state;
    }
    case 'entity.defined': {
      const { entityId, name, label, tiers, knownBy } = event.payload;
      if (hasOwn(state.entities, entityId)) fail(event, `entity "${entityId}" already exists`);
      const problem = tierProblem(state.rules, tiers);
      if (problem) fail(event, problem);
      checkCharacters(state, event, knownBy);
      const grade = event.payload.grade ?? null;
      const level = event.payload.level ?? null;
      const rank = rankProblem(state.rules, grade, level);
      if (rank) fail(event, rank);
      const entity: Entity = {
        id: entityId,
        name,
        label,
        tiers: tiers.map((t) => ({ minRarity: t.minRarity, text: t.text })),
        grade,
        level,
        knownBy: [...knownBy],
        createdAt: event.timestamp,
      };
      return {
        ...state,
        entities: { ...state.entities, [entityId]: entity },
        entityOrder: [...state.entityOrder, entityId],
      };
    }
    case 'entity.edited':
    case 'entity.revealed': {
      const { entityId } = event.payload;
      const entity = hasOwn(state.entities, entityId) ? state.entities[entityId] : undefined;
      if (!entity) return fail(event, `unknown entity "${entityId}"`);
      let next: Entity;
      if (event.type === 'entity.edited') {
        const { name, label, tiers } = event.payload;
        if (
          [name, label, tiers, event.payload.grade, event.payload.level].every(
            (v) => v === undefined,
          )
        ) {
          fail(event, 'nothing to change');
        }
        const grade = event.payload.grade === undefined ? entity.grade : event.payload.grade;
        const level = event.payload.level === undefined ? entity.level : event.payload.level;
        const rank = rankProblem(state.rules, grade, level);
        if (rank) fail(event, rank);
        if (tiers !== undefined) {
          const problem = tierProblem(state.rules, tiers);
          if (problem) fail(event, problem);
        }
        next = {
          ...entity,
          name: name ?? entity.name,
          label: label ?? entity.label,
          grade,
          level,
          tiers:
            tiers === undefined
              ? entity.tiers
              : tiers.map((t) => ({ minRarity: t.minRarity, text: t.text })),
        };
      } else {
        const ids = event.payload.characterIds;
        checkCharacters(state, event, ids);
        for (const id of ids) {
          if (entity.knownBy.includes(id)) fail(event, `"${id}" already knows ${entity.name}`);
        }
        next = { ...entity, knownBy: [...entity.knownBy, ...ids] };
      }
      return { ...state, entities: { ...state.entities, [entityId]: next } };
    }
    case 'campaign.dayAdvanced':
      return { ...state, day: state.day + event.payload.days };
    case 'session.started': {
      const { sessionId } = event.payload;
      if (state.currentSession !== null) fail(event, 'a session is already running');
      if (state.sessions.some((x) => x.id === sessionId)) {
        fail(event, `session "${sessionId}" already exists`);
      }
      const record: SessionRecord = {
        id: sessionId,
        number: state.sessions.length + 1,
        startedAt: event.timestamp,
        startDay: state.day,
        endedAt: null,
        endDay: null,
      };
      return { ...state, sessions: [...state.sessions, record], currentSession: sessionId };
    }
    case 'session.ended': {
      const { sessionId } = event.payload;
      if (state.currentSession === null) fail(event, 'no session is running');
      if (state.currentSession !== sessionId) fail(event, `session "${sessionId}" is not running`);
      return {
        ...state,
        sessions: state.sessions.map((x) =>
          x.id === sessionId ? { ...x, endedAt: event.timestamp, endDay: state.day } : x,
        ),
        currentSession: null,
      };
    }
    case 'event.undone':
      return fail(event, 'undo is applied by the event log, not the reducer');
  }
}

/** A quest's notice list (MQ.7): null (every character) or existing characters, no repeats. */
function checkNoticeTo(
  state: CampaignState,
  event: DomainEvent,
  ids: readonly string[] | null,
): readonly string[] | null {
  if (ids === null) return null;
  checkCharacters(state, event, ids);
  return [...ids];
}

/** Every id must be a character, listed once. */
function checkCharacters(state: CampaignState, event: DomainEvent, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) fail(event, 'a character is listed twice');
  for (const id of ids) characterOf(state, event, id);
}

/** Skill names the character's practice log still counts but that are no longer skills. */
function retiredFor(state: CampaignState, character: Character): Set<string> {
  return retiredSkillNames(
    character,
    state.practice.filter((e) => e.characterId === character.id).flatMap((e) => e.skills),
  );
}

/** Builds a definition, dropping absent optional bonus fields (exact optional types). */
function toItemDef(
  id: string,
  fields: {
    name: string;
    rarity: string;
    description: string;
    slot: string | null;
    bonuses: readonly { stat: string; flat?: number | undefined; percent?: number | undefined }[];
  },
): ItemDef {
  return {
    id,
    name: fields.name,
    rarity: fields.rarity,
    description: fields.description,
    slot: fields.slot,
    bonuses: fields.bonuses.map((b) => ({
      stat: b.stat,
      ...(b.flat === undefined ? {} : { flat: b.flat }),
      ...(b.percent === undefined ? {} : { percent: b.percent }),
    })),
  };
}

/**
 * A character's effective stats: base stats plus equipped item bonuses in the
 * M1.6 order (titles join in M6.4). Pool maxima and the player screen use these (M3.7, D81).
 */
export function characterEffectiveStats(
  state: CampaignState,
  characterId: string,
): Record<string, number> {
  const character = hasOwn(state.characters, characterId)
    ? state.characters[characterId]
    : undefined;
  if (!character) throw new EconomyRuleError(`Unknown character "${characterId}"`);
  return itemEffectiveStats(
    state.rules,
    character.stats,
    holdingsOf(state, characterId),
    state.items,
  );
}
