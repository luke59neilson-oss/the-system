import { poolMax, raceLevel, type Character, type FreePointBatch } from '../character';
import type { CampaignState } from '../events';
import type { RulesConfig } from '../rules';

/**
 * Player projection (ROADMAP M1.13): what one player's browser may receive.
 *
 * Everything here is built by **allowlist**: each output field is copied by
 * name, so a field added to the state later stays GM-only until it is copied
 * here on purpose. The visibility tables below are typed against the state
 * interfaces, so adding a state field without classifying it fails to compile;
 * tests (projection.test.ts) tie each table to the keys the projection emits.
 *
 * Party pool bars are percentages: they reveal how hurt someone is, and over
 * many observations roughly how big their pools are (accepted by D5/D39).
 */

/** Who may see a field: everyone in the party, only the owning player, or only the GM. */
export type Visibility = 'party' | 'owner' | 'gm';

/** Every character field, classified. `party` fields reach every player; `owner` only its player. */
export const CHARACTER_FIELD_VISIBILITY: Readonly<Record<keyof Character, Visibility>> = {
  schemaVersion: 'owner',
  id: 'party',
  name: 'party',
  race: 'party',
  className: 'party',
  profession: 'party',
  classLevel: 'party',
  professionLevel: 'party',
  grade: 'party',
  // Party members see pool bars (a percentage), never the raw pool values (D39).
  pools: 'owner',
  xp: 'owner',
  classWeights: 'owner',
  classSpreadTotals: 'owner',
  stats: 'owner',
  freePointBatches: 'owner',
  titles: 'owner',
  skills: 'owner',
};

/** Every campaign field, classified (`owner` is not used at this level). */
export const CAMPAIGN_FIELD_VISIBILITY: Readonly<Record<keyof CampaignState, Visibility>> = {
  schemaVersion: 'gm',
  name: 'party',
  // Only the display subset in PlayerRules reaches players.
  rules: 'gm',
  characters: 'party',
  characterOrder: 'party',
};

/** The rules subset a player screen needs to draw the sheet (no GM tuning, no stability). */
export interface PlayerRules {
  readonly stats: {
    readonly list: readonly { readonly id: string; readonly name: string }[];
    readonly displayDivisor: number;
    readonly displayDecimals: number;
  };
  readonly pools: readonly { readonly id: string; readonly name: string }[];
  readonly grades: readonly {
    readonly id: string;
    readonly topLevel: number;
    readonly rarityCeiling: string;
    readonly xpPerLevel: number;
    readonly theme: string;
  }[];
  readonly rarities: readonly { readonly id: string; readonly name: string }[];
  readonly currencyName: string;
  readonly equipmentSlots: readonly {
    readonly id: string;
    readonly name: string;
    readonly count: number;
    readonly kind: string;
  }[];
}

/** A pool as the owner sees it. */
export interface OwnPool {
  readonly id: string;
  readonly current: number;
  readonly max: number;
}

/** A pool bar as party members see it: whole percent, 1..99 unless empty or full. */
export interface PoolBar {
  readonly id: string;
  readonly percent: number;
}

/** The viewer's own sheet, in full (DESIGN §9). */
export interface OwnSheet {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly race: string;
  readonly className: string;
  readonly profession: string | null;
  readonly classLevel: number;
  readonly professionLevel: number;
  readonly raceLevel: number;
  readonly grade: string;
  readonly xp: Readonly<{ class: number; profession: number }>;
  readonly classWeights: Readonly<Record<string, number>>;
  readonly classSpreadTotals: Readonly<Record<string, number>>;
  readonly stats: Readonly<Record<string, number>>;
  readonly pools: readonly OwnPool[];
  readonly freePointBatches: readonly FreePointBatch[];
  readonly titles: readonly string[];
  readonly skills: readonly {
    readonly name: string;
    readonly rarity: string;
    readonly kind: 'class' | 'profession' | 'race';
    readonly nickname: string | null;
  }[];
}

/** Another party member as the viewer sees them (D5). */
export interface PartyMember {
  readonly id: string;
  readonly name: string;
  readonly race: string;
  readonly className: string;
  readonly profession: string | null;
  readonly classLevel: number;
  readonly professionLevel: number;
  readonly raceLevel: number;
  readonly grade: string;
  readonly pools: readonly PoolBar[];
}

/** Everything one player's browser receives. */
export interface PlayerView {
  readonly viewerId: string;
  readonly campaignName: string;
  readonly rules: PlayerRules;
  readonly me: OwnSheet;
  /** Other characters in creation order. */
  readonly party: readonly PartyMember[];
}

export class ProjectionError extends Error {}

/** The display subset of the rules (copied field by field). */
export function projectRules(rules: RulesConfig): PlayerRules {
  return {
    stats: {
      list: rules.stats.list.map((s) => ({ id: s.id, name: s.name })),
      displayDivisor: rules.stats.displayDivisor,
      displayDecimals: rules.stats.displayDecimals,
    },
    pools: rules.pools.map((p) => ({ id: p.id, name: p.name })),
    grades: rules.grades.map((g) => ({
      id: g.id,
      topLevel: g.topLevel,
      rarityCeiling: g.rarityCeiling,
      xpPerLevel: g.xpPerLevel,
      theme: g.theme,
    })),
    rarities: rules.skills.rarities.map((r) => ({ id: r.id, name: r.name })),
    currencyName: rules.economy.currencyName,
    equipmentSlots: rules.economy.equipmentSlots.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.count,
      kind: s.kind,
    })),
  };
}

/** Own-property lookup: ids like "constructor" never resolve to inherited members. */
const own = (record: Readonly<Record<string, number>>, key: string): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
};

const copyRecord = (record: Readonly<Record<string, number>>, keys: readonly string[]) => {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = own(record, key);
    if (value !== undefined) Object.defineProperty(out, key, { value, enumerable: true });
  }
  return out;
};

/** Whole-percent bar; never shows 0 for a non-empty pool or 100 for a hurt one. */
export function poolPercent(current: number, max: number): number {
  if (!(max > 0) || !(current > 0)) return 0;
  if (current >= max) return 100;
  return Math.min(99, Math.max(1, Math.round((current / max) * 100)));
}

function ownSheet(rules: RulesConfig, c: Character): OwnSheet {
  const statIds = rules.stats.list.map((s) => s.id);
  return {
    schemaVersion: c.schemaVersion,
    id: c.id,
    name: c.name,
    race: c.race,
    className: c.className,
    profession: c.profession,
    classLevel: c.classLevel,
    professionLevel: c.professionLevel,
    raceLevel: raceLevel(rules, c),
    grade: c.grade,
    xp: { class: c.xp.class, profession: c.xp.profession },
    classWeights: copyRecord(c.classWeights, statIds),
    classSpreadTotals: copyRecord(c.classSpreadTotals, statIds),
    stats: copyRecord(c.stats, statIds),
    pools: rules.pools.map((p) => ({
      id: p.id,
      current: own(c.pools, p.id) ?? 0,
      max: poolMax(rules, c.stats, p.id),
    })),
    freePointBatches: c.freePointBatches.map((b) => ({
      raceLevel: b.raceLevel,
      points: b.points,
      allocation: b.allocation === null ? null : copyRecord(b.allocation, statIds),
      locked: b.locked,
    })),
    titles: [...c.titles],
    skills: c.skills.map((s) => ({
      name: s.name,
      rarity: s.rarity,
      kind: s.kind,
      nickname: s.nickname,
    })),
  };
}

function partyMember(rules: RulesConfig, c: Character): PartyMember {
  return {
    id: c.id,
    name: c.name,
    race: c.race,
    className: c.className,
    profession: c.profession,
    classLevel: c.classLevel,
    professionLevel: c.professionLevel,
    raceLevel: raceLevel(rules, c),
    grade: c.grade,
    pools: rules.pools.map((p) => ({
      id: p.id,
      percent: poolPercent(own(c.pools, p.id) ?? 0, poolMax(rules, c.stats, p.id)),
    })),
  };
}

/**
 * What the player of `characterId` may see. Throws ProjectionError for an
 * unknown character so a stale client never falls back to more data.
 */
export function projectForPlayer(state: CampaignState, characterId: string): PlayerView {
  const viewer = Object.prototype.hasOwnProperty.call(state.characters, characterId)
    ? state.characters[characterId]
    : undefined;
  if (!viewer) throw new ProjectionError(`Unknown character "${characterId}"`);
  const party: PartyMember[] = [];
  for (const id of state.characterOrder) {
    const other = state.characters[id];
    if (id !== characterId && other) party.push(partyMember(state.rules, other));
  }
  return {
    viewerId: viewer.id,
    campaignName: state.name,
    rules: projectRules(state.rules),
    me: ownSheet(state.rules, viewer),
    party,
  };
}
