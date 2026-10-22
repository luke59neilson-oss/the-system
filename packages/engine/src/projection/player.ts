import {
  poolMax,
  raceLevel,
  type Character,
  type CharacterSkill,
  type FreePointBatch,
} from '../character';
import type { CampaignState } from '../events';
import {
  EMPTY_HOLDINGS,
  itemEffectiveStats,
  type Bundle,
  type Holdings,
  type ItemDef,
  type TradeStatus,
} from '../economy';
import type { PendingEvolution, SelectionRecord, SkillOption } from '../evolution';
import { daysLeft, type QuestStatus } from '../quests';
import type { RulesConfig } from '../rules';
import { atCeiling, marksToUpgrade } from '../skills';

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
  merges: 'owner',
  // M1.10: the owner sees their own menus and released evolution options
  // (M3.6 and M3.13 draw them); party members never do.
  selections: 'owner',
  evolution: 'owner',
};

/** Every campaign field, classified (`owner` is not used at this level). */
export const CAMPAIGN_FIELD_VISIBILITY: Readonly<Record<keyof CampaignState, Visibility>> = {
  schemaVersion: 'gm',
  name: 'party',
  // Only the display subset in PlayerRules reaches players.
  rules: 'gm',
  characters: 'party',
  characterOrder: 'party',
  // Each player gets only the broadcasts addressed to them, without the recipient list.
  broadcasts: 'owner',
  // M1.7 economy, projected as `inventory` (M3.7): the library may hold items
  // the GM has not handed out, so players get only the definitions of items
  // they hold, wear or see in an own trade; holdings and trades only their own.
  items: 'gm',
  itemOrder: 'gm',
  holdings: 'owner',
  trades: 'owner',
  tradeOrder: 'gm',
  // M1.8. Not projected yet (M3.10 notes, M3.x practice): players will get
  // their own practice entries, their own journal and the party notes.
  // Journal entries a player has not shared are hidden from the GM too
  // (projectForGm).
  practice: 'owner',
  notes: 'owner',
  noteOrder: 'owner',
  // M1.11. GM-only until the encounter panel (M7.3) decides which clocks the
  // table sees.
  clocks: 'gm',
  clockOrder: 'gm',
  // M1.12: players get visible quests only, as PlayerQuest (days left, and the
  // stability value only when its gauge is visible; never the tag rules).
  quests: 'owner',
  questOrder: 'gm',
  day: 'party',
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
  /** Base stats (class spread + free points); the free-point dialog adds to these. */
  readonly stats: Readonly<Record<string, number>>;
  /** Stats after equipped item bonuses (M3.7, D60/D81): the Stats block and pool maxima. */
  readonly effectiveStats: Readonly<Record<string, number>>;
  readonly pools: readonly OwnPool[];
  readonly freePointBatches: readonly FreePointBatch[];
  readonly titles: readonly string[];
  readonly skills: readonly {
    readonly name: string;
    readonly rarity: string;
    readonly kind: 'class' | 'profession' | 'race';
    readonly nickname: string | null;
    readonly unique: boolean;
    /** Mastery marks toward the next upgrade (M3.5 shows progress). */
    readonly marks: number;
    readonly markSessions: readonly string[];
    /** System description and flavour (M3.5), or null for none yet. */
    readonly description: string | null;
    readonly flavor: string | null;
    /** Marks the next upgrade needs, or null when the ladder has no next step. */
    readonly marksNeeded: number | null;
    /** The rarity id a mark upgrade leads to, or null. */
    readonly nextRarity: string | null;
    /** At the grade's rarity ceiling: marks bank until the next evolution. */
    readonly atCeiling: boolean;
  }[];
  /** Merges done per grade id. */
  readonly merges: Readonly<Record<string, number>>;
  /** Selection menus offered to this character, with the pick once chosen (M1.10). */
  readonly selections: readonly SelectionRecord[];
  /** A released evolution waiting for this character's choice (M1.10). */
  readonly evolution: PendingEvolution | null;
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
  /** System broadcasts addressed to this character (or everyone), oldest first. */
  readonly messages: readonly PlayerMessage[];
  /** In-game day counter. */
  readonly day: number;
  /** Visible quests in creation order. */
  readonly quests: readonly PlayerQuest[];
  /** The viewer's own currency, items, equipment and trades (M3.7). */
  readonly inventory: PlayerInventory;
}

/** An item definition, sent only for items the viewer holds or sees in an own trade. */
export interface PlayerItem {
  readonly id: string;
  readonly name: string;
  readonly rarity: string;
  readonly description: string;
  readonly slot: string | null;
  readonly bonuses: readonly {
    readonly stat: string;
    readonly flat?: number;
    readonly percent?: number;
  }[];
}

/** A trade the viewer proposed or was offered; `null` = the GM. */
export interface PlayerTrade {
  readonly id: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly give: Bundle;
  readonly get: Bundle;
  readonly status: TradeStatus;
  readonly proposedAt: string;
  readonly closedAt: string | null;
}

export interface PlayerInventory {
  readonly currency: number;
  /** Item id → count. */
  readonly items: Readonly<Record<string, number>>;
  /** Slot key "<slotId>:<index>" → item id. */
  readonly equipped: Readonly<Record<string, string>>;
  /** Own trades, oldest first. */
  readonly trades: readonly PlayerTrade[];
  /** Definitions of every item above (held, equipped or in an own trade). */
  readonly itemDefs: Readonly<Record<string, PlayerItem>>;
}

/** A visible quest as players see it (DESIGN §7; M3.8 draws it). */
export interface PlayerQuest {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly status: QuestStatus;
  /** Days left on the timer (≤ 0 once it runs out), or null for none. */
  readonly daysLeft: number | null;
  /** World Stability value, only when the GM made the gauge visible. */
  readonly stability: number | null;
  /** Where that value sits in the configured range, 0–100 (M3.8 gauge); null when hidden. */
  readonly stabilityPercent: number | null;
}

/** A broadcast as one recipient sees it: never who else received it. */
export interface PlayerMessage {
  readonly id: string;
  readonly at: string;
  readonly text: string;
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

/** Effective stats (base + equipped items) of a character, for pool maxima. */
function effectiveFor(state: CampaignState, c: Character): Record<string, number> {
  const h = hasOwnKey(state.holdings, c.id)
    ? (state.holdings[c.id] ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;
  return itemEffectiveStats(state.rules, c.stats, h, state.items);
}

function ownSheet(state: CampaignState, c: Character): OwnSheet {
  const rules = state.rules;
  const statIds = rules.stats.list.map((s) => s.id);
  const effective = effectiveFor(state, c);
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
    effectiveStats: copyRecord(effective, statIds),
    pools: rules.pools.map((p) => ({
      id: p.id,
      current: own(c.pools, p.id) ?? 0,
      max: poolMax(rules, effective, p.id),
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
      unique: s.unique,
      marks: s.marks,
      markSessions: [...s.markSessions],
      description: s.description,
      flavor: s.flavor,
      ...markProgress(rules, c, s),
    })),
    merges: copyRecord(
      c.merges,
      rules.grades.map((g) => g.id),
    ),
    selections: c.selections.map((r) => ({
      level: r.level,
      options: r.options.map(copyOption),
      chosen: r.chosen,
      offerId: r.offerId,
    })),
    evolution:
      c.evolution === null
        ? null
        : {
            toGrade: c.evolution.toGrade,
            releaseId: c.evolution.releaseId,
            options: c.evolution.options.map((o) => ({
              id: o.id,
              className: o.className,
              description: o.description,
              transforms: o.transforms.map((t) => ({
                skill: t.skill,
                name: t.name,
                rarity: t.rarity,
              })),
              classWeights: o.classWeights === null ? null : copyRecord(o.classWeights, statIds),
            })),
            professions: [...c.evolution.professions],
          },
  };
}

/** Where a skill stands on the mark ladder (DESIGN §6), from the rules config. */
function markProgress(rules: RulesConfig, c: Character, s: CharacterSkill) {
  const needed = marksToUpgrade(rules, s);
  const index = rules.skills.rarities.findIndex((r) => r.id === s.rarity);
  return {
    marksNeeded: needed,
    nextRarity: needed === null ? null : (rules.skills.rarities[index + 1]?.id ?? null),
    atCeiling: atCeiling(rules, c, s),
  };
}

const copyOption = (o: SkillOption): SkillOption => ({
  name: o.name,
  rarity: o.rarity,
  kind: o.kind,
  description: o.description,
});

function partyMember(state: CampaignState, c: Character): PartyMember {
  const rules = state.rules;
  const effective = effectiveFor(state, c);
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
      percent: poolPercent(own(c.pools, p.id) ?? 0, poolMax(rules, effective, p.id)),
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
    if (id !== characterId && other) party.push(partyMember(state, other));
  }
  return {
    viewerId: viewer.id,
    campaignName: state.name,
    rules: projectRules(state.rules),
    me: ownSheet(state, viewer),
    party,
    messages: state.broadcasts
      .filter((b) => b.characterIds === null || b.characterIds.includes(viewer.id))
      .map((b) => ({ id: b.id, at: b.at, text: b.text })),
    day: state.day,
    inventory: playerInventory(state, viewer.id),
    quests: state.questOrder.flatMap((id) => {
      const q = Object.prototype.hasOwnProperty.call(state.quests, id)
        ? state.quests[id]
        : undefined;
      if (!q || !q.visible) return [];
      return [
        {
          id: q.id,
          title: q.title,
          text: q.text,
          status: q.status,
          daysLeft: daysLeft(q, state.day),
          stability: q.stability !== null && q.stability.visible ? q.stability.value : null,
          stabilityPercent:
            q.stability !== null && q.stability.visible
              ? gaugePercent(state.rules, q.stability.value)
              : null,
        },
      ];
    }),
  };
}

/** A stability value as a share of the configured range, 0–100 (an empty range shows full). */
function gaugePercent(rules: RulesConfig, value: number): number {
  const { min, max } = rules.stability;
  if (!(max > min)) return 100;
  return Math.min(100, Math.max(0, Math.round(((value - min) / (max - min)) * 1000) / 10));
}

const hasOwnKey = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function copyBundle(b: Bundle): Bundle {
  const items: Record<string, number> = {};
  for (const [id, n] of Object.entries(b.items)) items[id] = n;
  return { currency: b.currency, items };
}

function copyItem(def: ItemDef): PlayerItem {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    slot: def.slot,
    bonuses: def.bonuses.map((b) => ({
      stat: b.stat,
      ...(b.flat === undefined ? {} : { flat: b.flat }),
      ...(b.percent === undefined ? {} : { percent: b.percent }),
    })),
  };
}

/**
 * The viewer's own economy (M3.7, D58/D60): holdings, the trades they are a
 * party to, and the definitions of exactly the items those mention. The rest
 * of the item library (items the GM has not handed out) stays GM-only.
 */
function playerInventory(state: CampaignState, viewerId: string): PlayerInventory {
  const h: Holdings = hasOwnKey(state.holdings, viewerId)
    ? (state.holdings[viewerId] ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;
  const wanted = new Set<string>();
  const items: Record<string, number> = {};
  for (const [id, n] of Object.entries(h.inventory)) {
    items[id] = n;
    wanted.add(id);
  }
  const equipped: Record<string, string> = {};
  for (const [key, id] of Object.entries(h.equipped)) {
    equipped[key] = id;
    wanted.add(id);
  }
  const trades: PlayerTrade[] = [];
  for (const id of state.tradeOrder) {
    const t = hasOwnKey(state.trades, id) ? state.trades[id] : undefined;
    if (!t || (t.from !== viewerId && t.to !== viewerId)) continue;
    for (const itemId of [...Object.keys(t.give.items), ...Object.keys(t.get.items)]) {
      wanted.add(itemId);
    }
    trades.push({
      id: t.id,
      from: t.from,
      to: t.to,
      give: copyBundle(t.give),
      get: copyBundle(t.get),
      status: t.status,
      proposedAt: t.proposedAt,
      closedAt: t.closedAt,
    });
  }
  const itemDefs: Record<string, PlayerItem> = {};
  for (const id of wanted) {
    const def = hasOwnKey(state.items, id) ? state.items[id] : undefined;
    if (def) itemDefs[id] = copyItem(def);
  }
  return { currency: h.currency, items, equipped, trades, itemDefs };
}
