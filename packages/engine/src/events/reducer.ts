import {
  CharacterRuleError,
  clampPools,
  createCharacter,
  grantProfession,
  poolMax,
  type Character,
} from '../character';
import { parseRulesConfig, type RulesConfig } from '../rules';
import { EventRejectedError, type DomainEvent } from './envelope';

/** Bumped when the serialized campaign state shape changes (snapshots, M2.1). */
export const CAMPAIGN_STATE_SCHEMA_VERSION = 1;

/** Plain, serializable campaign state: a pure fold over the effective events. */
export interface CampaignState {
  readonly schemaVersion: number;
  readonly name: string;
  readonly rules: RulesConfig;
  readonly characters: Readonly<Record<string, Character>>;
  /** Character ids in creation order (stable display order). */
  readonly characterOrder: readonly string[];
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
    case 'event.undone':
      return fail(event, 'undo is applied by the event log, not the reducer');
  }
}
