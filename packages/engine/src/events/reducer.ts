import {
  CharacterRuleError,
  clampPools,
  createCharacter,
  grantProfession,
  poolMax,
  type Character,
} from '../character';
import { gainXp, shareBonus } from '../progression';
import { parseRulesConfig, type RulesConfig } from '../rules';
import { EventRejectedError, type DomainEvent } from './envelope';

/** Bumped when the serialized campaign state shape changes, including any nested character change (snapshots, M2.1). v2: character v2. v3: broadcasts. */
export const CAMPAIGN_STATE_SCHEMA_VERSION = 3;

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

/** Runs a character rule, turning rule errors into event rejections. */
function rule<T>(event: DomainEvent, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof CharacterRuleError) return fail(event, error.message);
    throw error;
  }
}

/**
 * Applies one domain event (not `event.undone`; the log handles undo).
 * Validates the event against the state and throws EventRejectedError when it
 * does not apply. Pure: never mutates `state`.
 */
export function applyEvent(state: CampaignState | null, event: DomainEvent): CampaignState {
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
    case 'character.professionGranted': {
      const character = characterOf(state, event, event.payload.characterId);
      return withCharacter(
        state,
        rule(event, () => grantProfession(state.rules, character, event.payload.profession)),
      );
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
        const max = rule(event, () => poolMax(state.rules, character.stats, poolId));
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
      return withCharacter(state, {
        ...character,
        stats: merged,
        pools: rule(event, () => clampPools(state.rules, merged, character.pools)),
      });
    }
    case 'xp.awarded': {
      const { track, amount, shares, enemyLevel } = event.payload;
      const ids = shares.map((s) => s.characterId);
      if (new Set(ids).size !== ids.length) fail(event, 'a participant is listed twice');
      const sum = shares.reduce((a, s) => a + s.share, 0);
      if (sum !== amount) fail(event, `shares sum to ${sum}, not the award of ${amount}`);
      let next = state;
      for (const { characterId, share } of shares) {
        const character = characterOf(state, event, characterId);
        const bonus = shareBonus(state.rules, character, share, enemyLevel);
        const { character: leveled } = rule(event, () =>
          gainXp(state.rules, character, track, share + bonus),
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
        pools: rule(event, () => clampPools(state.rules, stats, character.pools)),
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
    case 'event.undone':
      return fail(event, 'undo is applied by the event log, not the reducer');
  }
}
