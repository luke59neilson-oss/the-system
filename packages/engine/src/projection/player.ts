import { titleDefByName, titleSources } from '../titles';
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
  itemCappedStats,
  itemEffectiveStats,
  itemsSeenBy,
  type Bundle,
  type Holdings,
  type ItemDef,
  type Trade,
  type TradeStatus,
} from '../economy';
import {
  dueSelections,
  passedOverOptions,
  retiredSkillNames,
  type PendingEvolution,
  type SelectionRecord,
  type SkillOption,
} from '../evolution';
import { canReadNote, skillPairCounts } from '../practice';
import { identifyInRange } from '../entities';
import { daysLeft, hiddenQuestNoticed, type QuestStatus } from '../quests';
import type { RulesConfig } from '../rules';
import { identifyRarity, resolveIdentify } from './identify';
import {
  atCeiling,
  entryForSkill,
  markRules,
  marksToUpgrade,
  mergeSkills,
  type MarkRules,
} from '../skills';

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
  // MQ.6: the professions offered to this character are theirs alone.
  professionOffers: 'owner',
  // MT.2: a merge the GM sent waits on its owner's answer; nobody else sees it.
  mergeOffer: 'owner',
  // MT.2: the GM's record of the answer; the player already knows it.
  lastMergeAnswer: 'gm',
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
  // M4.4: the portrait file name; the join list already shows it to anyone.
  portrait: 'party',
  // MQ.15: rules bookkeeping; the sheet shows the pool values themselves.
  clampedPools: 'gm',
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
  // M4.7: a scheduled broadcast is the GM's until its day comes (then it is in `broadcasts`).
  scheduledBroadcasts: 'gm',
  // M1.7 economy, projected as `inventory` (M3.7): the library may hold items
  // the GM has not handed out, so players get only the definitions of items
  // they hold, wear or see in an own trade; holdings and trades only their own.
  items: 'gm',
  // M4.1: the library may hold skills nobody has; granted skills carry their own text.
  skillLibrary: 'gm',
  skillLibraryOrder: 'gm',
  // M4.2: class, race and profession libraries are the GM's catalogue.
  classLibrary: 'gm',
  classLibraryOrder: 'gm',
  raceLibrary: 'gm',
  raceLibraryOrder: 'gm',
  professionLibrary: 'gm',
  professionLibraryOrder: 'gm',
  itemOrder: 'gm',
  // M6.2: loot tables and rolls are the GM's; what a roll gives a character
  // reaches them as holdings and a gift notification.
  lootTables: 'gm',
  lootTableOrder: 'gm',
  lootLog: 'gm',
  // M6.3: the ledger names reasons and every character's balance; a player
  // learns of their own grants and fines through a notification.
  ledger: 'gm',
  // M6.4: the title library is the GM's; each holder gets their own titles'
  // entries (text and bonuses) in `me.titleDetails`.
  titleLibrary: 'gm',
  titleLibraryOrder: 'gm',
  holdings: 'owner',
  trades: 'owner',
  tradeOrder: 'gm',
  // M1.8/M3.11: each player gets their own practice entries (without tags,
  // which may name hidden quests' action tags). Notes (M3.10): each player
  // gets their own journal and the party notes (canReadNote), never GM notes
  // or another player's journal, shared or not. Journal entries a player has
  // not shared are hidden from the GM too (projectForGm, View-as panes).
  practice: 'owner',
  notes: 'owner',
  noteOrder: 'gm',
  // M1.11. GM-only until the encounter panel (M7.3) decides which clocks the
  // table sees.
  clocks: 'gm',
  clockOrder: 'gm',
  // M1.12: players get visible quests only, as PlayerQuest (days left, and the
  // stability value only when its gauge is visible; never the tag rules).
  quests: 'owner',
  questOrder: 'gm',
  // M3.9: each player gets only the entities they know, as label + the one
  // tier text their Identify unlocks; never the GM name, other tiers or who
  // else knows it.
  entities: 'owner',
  entityOrder: 'gm',
  // M3.11: each player gets the open montages offered to them, by label, with
  // their own focus; never the clock, the other participants or their focuses.
  montages: 'owner',
  montageOrder: 'gm',
  // M7.3: each player gets the shared contests they took part in, from their
  // side: their side's label and stat value, the other side's label only (an
  // NPC's stats stay GM-only), their chance rounded to a whole percent (so the
  // other side's value cannot be solved from it exactly) and whether they won.
  contests: 'owner',
  contestOrder: 'gm',
  // M7.4: players get the current region's name only; the region list, GM
  // notes and which regions are visited stay with the GM.
  regions: 'gm',
  regionOrder: 'gm',
  currentRegion: 'party',
  // M7.4: survivor factions are the GM's bookkeeping.
  factions: 'gm',
  factionOrder: 'gm',
  day: 'party',
  // M4.3: session bookkeeping is the GM's.
  sessions: 'gm',
  currentSession: 'gm',
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
  /** Mark costs and carry-over, so the evolution screen can say what marks keep (MQ.4). */
  readonly marks: MarkRules;
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
  /** Professions the GM offered (MQ.6); locked once `profession` is set. */
  readonly professionOffers: readonly string[];
  /**
   * A merge the GM sent, waiting on this player's answer (MT.2, Q62), with
   * the rarity it would have now (null when it can no longer apply).
   */
  readonly mergeOffer: {
    readonly offerId: string;
    readonly skills: readonly [string, string];
    readonly name: string;
    readonly rarity: string | null;
    readonly description: string | null;
    readonly flavor: string | null;
  } | null;
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
  /** Stats whose item bonus hit the item cap (MQ.14, DESIGN §4), shown as capped. */
  readonly itemCappedStats: readonly string[];
  /**
   * Stats with equipped item bonuses only, before titles (M6.A): the sheet
   * shows what items and what titles add separately.
   */
  readonly itemStats: Readonly<Record<string, number>>;
  readonly pools: readonly OwnPool[];
  readonly freePointBatches: readonly FreePointBatch[];
  readonly titles: readonly string[];
  /** The System text and bonuses of each held title with a library entry (M6.4). */
  readonly titleDetails: readonly {
    readonly name: string;
    readonly text: string;
    readonly bonuses: readonly { stat: string; flat?: number; percent?: number }[];
  }[];
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
    /**
     * The library entry's effects text, shown to the skill's owner only
     * (MQ.12, L4; never on party views); null for none or on older rules.
     */
    readonly effects: string | null;
    /** Marks the next upgrade needs, or null when the ladder has no next step. */
    readonly marksNeeded: number | null;
    /** The rarity id a mark upgrade leads to, or null. */
    readonly nextRarity: string | null;
    /** At the grade's rarity ceiling: marks bank until the next evolution. */
    readonly atCeiling: boolean;
  }[];
  /** Merges done per grade id. */
  readonly merges: Readonly<Record<string, number>>;
  /**
   * Selection menus offered to this character, with the pick once chosen
   * (M1.10). An unchosen menu also lists the passed-over options of earlier
   * menus that are still eligible, newest first (MQ.3, DESIGN §6); empty once
   * chosen.
   */
  readonly selections: readonly (SelectionRecord & {
    readonly passedOver: readonly SkillOption[];
  })[];
  /**
   * Earned selections not chosen yet, offered or not (MQ.1, D103): while any
   * wait, the evolution cannot be chosen.
   */
  readonly selectionsDue: number;
  /** A released evolution waiting for this character's choice (M1.10). */
  readonly evolution: PendingEvolution | null;
  /** Portrait URL path (`/portraits/<file>`), or null for the monogram (M4.4). */
  readonly portrait: string | null;
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
  /** Portrait URL path, or null (M4.4). */
  readonly portrait: string | null;
}

/** Everything one player's browser receives. */
/** A shared contest roll as one of its participants sees it (M7.3). */
export interface PlayerContest {
  readonly id: string;
  readonly at: string;
  /** The viewer's side: its label, stat and value. */
  readonly yours: { readonly label: string; readonly stat: string | null; readonly value: number };
  /** The other side's label only. */
  readonly theirs: string;
  /** The viewer's side's chance to win, 0..1, rounded to a whole percent (1..99 unless certain). */
  readonly chance: number;
  /** True when a grade wall settled it with no roll. */
  readonly walled: boolean;
  readonly won: boolean;
}

/** How many recent shared contests a player view carries (M7.3). */
export const PLAYER_CONTEST_LIMIT = 10;

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
  /**
   * Active hidden quests whose notice reaches the viewer (MQ.7, DESIGN §7):
   * only how many exist, never which quest, its text or who else knows.
   */
  readonly hiddenQuests: number;
  /** The viewer's own currency, items, equipment and trades (M3.7). */
  readonly inventory: PlayerInventory;
  /** Entities the viewer knows, in definition order (M3.9). */
  readonly identify: readonly PlayerIdentify[];
  /** The viewer's own journal and the party notes, in creation order (M3.10). */
  readonly notes: readonly PlayerNote[];
  /** The viewer's own practice entries, oldest first (M3.11). */
  readonly practice: readonly PlayerPractice[];
  /** Open montages offered to the viewer, in offer order (M3.11). */
  readonly montages: readonly PlayerMontage[];
  /** The latest shared contests the viewer took part in, oldest first (M7.3). */
  readonly contests: readonly PlayerContest[];
  /** The name of the region the party is in (M7.4), or null. */
  readonly region: string | null;
}

/** One of the viewer's practice entries (tags left out: they may name GM-only action tags). */
export interface PlayerPractice {
  readonly id: string;
  readonly at: string;
  readonly action: string;
  readonly skills: readonly string[];
  readonly stat: string | null;
  readonly source: 'gm' | 'player' | 'montage';
}

/** An open montage offered to the viewer (M3.11). */
export interface PlayerMontage {
  readonly id: string;
  readonly label: string;
  /** The viewer's focus once given, else null. */
  readonly focus: string | null;
}

/** A note one player may read (M3.10, DESIGN §7 Notes): own journal or party. */
export interface PlayerNote {
  readonly id: string;
  readonly kind: 'journal' | 'party';
  /** Author character id; null = the GM (party notes only). */
  readonly author: string | null;
  readonly title: string;
  /** Markdown. */
  readonly body: string;
  readonly tags: readonly string[];
  /** Journal: the GM may read it. Party notes: always true. */
  readonly shareable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Options for {@link projectForPlayer}. */
export interface PlayerProjectionOptions {
  /**
   * The GM's View-as panes (MS.3) show a player's screen on the GM's laptop:
   * journal entries the player has not shared are left out, as for the GM.
   */
  readonly viewAs?: boolean;
}

/** A known entity as one player sees it (M3.9, DESIGN §7 Identify). */
export interface PlayerIdentify {
  readonly id: string;
  readonly label: string;
  /**
   * False when the target is out of the viewer's Identify range (MQ.8,
   * DESIGN §7): a higher grade, or the same grade above 1.5 × their level.
   * The player then sees `[??? – lvl ???]` and gets no text, grade or level.
   */
  readonly inRange: boolean;
  /** Grade and level shown when in range and the GM gave them, else null. */
  readonly grade: string | null;
  readonly level: number | null;
  /** The best tier the viewer's Identify rarity unlocks, or null for none (or out of range). */
  readonly text: string | null;
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
  /** Definitions of the items the viewer has seen: held, equipped, offered by or to them (QF.9). */
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
    marks: markRules(rules),
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

/** The pending merge offer as its owner sees it (MT.2). */
function ownMergeOffer(state: CampaignState, c: Character): OwnSheet['mergeOffer'] {
  const offer = c.mergeOffer ?? null;
  if (offer === null) return null;
  const [first, second] = offer.skills;
  const [a, b] = first < second ? [first, second] : [second, first];
  const joint =
    skillPairCounts(state.practice, c.id).find((p) => p.skills[0] === a && p.skills[1] === b)
      ?.count ?? 0;
  let rarity: string | null;
  const rarityOf = (n: string) => c.skills.find((s) => s.name === n)?.rarity;
  // The accept is refused when a skill changed since the offer (MT.2 stale check).
  const changed = rarityOf(first) !== offer.rarities[0] || rarityOf(second) !== offer.rarities[1];
  try {
    if (changed) throw new Error('stale');
    const merged = mergeSkills(state.rules, c, first, second, offer.name, joint);
    rarity = merged.skills.find((s) => s.name === offer.name)?.rarity ?? null;
  } catch {
    rarity = null;
  }
  return {
    offerId: offer.offerId,
    skills: [first, second],
    name: offer.name,
    rarity,
    description: offer.description ?? null,
    flavor: offer.flavor ?? null,
  };
}

/** Effective stats (base + equipped items) of a character, for pool maxima. */
function effectiveFor(state: CampaignState, c: Character): Record<string, number> {
  const h = hasOwnKey(state.holdings, c.id)
    ? (state.holdings[c.id] ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;
  return itemEffectiveStats(
    state.rules,
    c.stats,
    h,
    state.items,
    titleSources(state.titleLibrary, state.titleLibraryOrder, c.titles),
  );
}

function ownSheet(state: CampaignState, c: Character): OwnSheet {
  const rules = state.rules;
  const statIds = rules.stats.list.map((s) => s.id);
  const effective = effectiveFor(state, c);
  const h = hasOwnKey(state.holdings, c.id)
    ? (state.holdings[c.id] ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;
  return {
    schemaVersion: c.schemaVersion,
    id: c.id,
    name: c.name,
    race: c.race,
    className: c.className,
    profession: c.profession,
    professionOffers: [...c.professionOffers],
    mergeOffer: ownMergeOffer(state, c),
    classLevel: c.classLevel,
    professionLevel: c.professionLevel,
    raceLevel: raceLevel(rules, c),
    grade: c.grade,
    xp: { class: c.xp.class, profession: c.xp.profession },
    classWeights: copyRecord(c.classWeights, statIds),
    classSpreadTotals: copyRecord(c.classSpreadTotals, statIds),
    stats: copyRecord(c.stats, statIds),
    effectiveStats: copyRecord(effective, statIds),
    itemCappedStats: itemCappedStats(rules, c.stats, h, state.items),
    itemStats: copyRecord(itemEffectiveStats(rules, c.stats, h, state.items), statIds),
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
    titleDetails: c.titles.flatMap((name) => {
      const def = titleDefByName(state.titleLibrary, state.titleLibraryOrder, name);
      return def
        ? [{ name: def.name, text: def.text, bonuses: def.bonuses.map((b) => ({ ...b })) }]
        : [];
    }),
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
      effects: ownEffects(state, s),
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
      passedOver:
        r.chosen === null
          ? passedOverOptions(rules, c, r.level, retiredSkillNames(c, practiced(state, c))).map(
              copyOption,
            )
          : [],
    })),
    selectionsDue: dueSelections(rules, c).length,
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
                ...(t.merge === undefined ? {} : { merge: t.merge }),
              })),
              classWeights: o.classWeights === null ? null : copyRecord(o.classWeights, statIds),
              statBonus: copyRecord(o.statBonus, statIds),
            })),
            professions: [...c.evolution.professions],
            ...(c.evolution.rerate === undefined
              ? {}
              : { rerate: c.evolution.rerate.map((r) => ({ skill: r.skill, rarity: r.rarity })) }),
            ...(c.evolution.rerateApproved === true ? { rerateApproved: true as const } : {}),
          },
    portrait: portraitUrl(c.portrait),
  };
}

/** Skill names the character practised (retired names count, D64). */
function practiced(state: CampaignState, c: Character): string[] {
  return state.practice.filter((e) => e.characterId === c.id).flatMap((e) => e.skills);
}

/** Where browsers fetch a stored portrait (M4.4); the server serves `/portraits/<file>`. */
export function portraitUrl(portrait: string | null): string | null {
  return portrait === null ? null : `/portraits/${portrait}`;
}

/** MQ.12: the owner sees their skill's library effects (new rules only). */
function ownEffects(state: CampaignState, s: CharacterSkill): string | null {
  if (!state.rules.skills.libraryByRarity) return null;
  const text = entryForSkill(state.rules, state.skillLibrary, s)?.effects.trim() ?? '';
  return text === '' ? null : text;
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
    portrait: portraitUrl(c.portrait),
  };
}

/**
 * What the player of `characterId` may see. Throws ProjectionError for an
 * unknown character so a stale client never falls back to more data.
 */
export function projectForPlayer(
  state: CampaignState,
  characterId: string,
  options: PlayerProjectionOptions = {},
): PlayerView {
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
    identify: playerIdentify(state, viewer),
    notes: playerNotes(state, viewer.id, options.viewAs === true),
    practice: state.practice
      .filter((p) => p.characterId === viewer.id)
      .map((p) => ({
        id: p.id,
        at: p.at,
        action: p.action,
        skills: [...p.skills],
        stat: p.stat,
        source: p.source,
      })),
    montages: state.montageOrder.flatMap((id) => {
      const m = hasOwnKey(state.montages, id) ? state.montages[id] : undefined;
      if (!m || m.status !== 'open' || !m.characterIds.includes(viewer.id)) return [];
      const entryId = hasOwnKey(m.focuses, viewer.id) ? m.focuses[viewer.id] : undefined;
      const entry =
        entryId === undefined ? undefined : state.practice.find((p) => p.id === entryId);
      return [{ id: m.id, label: m.label, focus: entry?.action ?? null }];
    }),
    contests: playerContests(state, viewer.id),
    region: currentRegionName(state),
    hiddenQuests: state.questOrder.filter((id) => {
      const q = hasOwnKey(state.quests, id) ? state.quests[id] : undefined;
      return q !== undefined && hiddenQuestNoticed(q, state.characterOrder).includes(viewer.id);
    }).length,
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

/**
 * Notes the viewer may read (canReadNote), copied field by field. In a View-as
 * pane the GM also must be able to read it (unshared journal entries vanish).
 */
function playerNotes(state: CampaignState, viewerId: string, viewAs: boolean): PlayerNote[] {
  return state.noteOrder.flatMap((id) => {
    const n = hasOwnKey(state.notes, id) ? state.notes[id] : undefined;
    if (!n || n.kind === 'gm' || !canReadNote(n, viewerId)) return [];
    if (viewAs && !canReadNote(n, null)) return [];
    return [
      {
        id: n.id,
        kind: n.kind,
        author: n.author,
        title: n.title,
        body: n.body,
        tags: [...n.tags],
        shareable: n.shareable,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      },
    ];
  });
}

/** Known entities with the viewer's tier text only (D40: resolved here, never the tier list). */
function playerIdentify(state: CampaignState, viewer: Character): PlayerIdentify[] {
  const rarity = identifyRarity(state.rules, viewer);
  return state.entityOrder.flatMap((id): PlayerIdentify[] => {
    const e = hasOwnKey(state.entities, id) ? state.entities[id] : undefined;
    if (!e || !e.knownBy.includes(viewer.id)) return [];
    if (!identifyInRange(state.rules, viewer, e)) {
      return [{ id: e.id, label: e.label, inRange: false, grade: null, level: null, text: null }];
    }
    return [
      {
        id: e.id,
        label: e.label,
        inRange: true,
        grade: e.grade,
        level: e.level,
        text: resolveIdentify(state.rules, e.tiers, rarity),
      },
    ];
  });
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

/**
 * Under flat-only items (L6, D128) a stored percentage counts for nothing, so
 * the player is not shown it (MQ.A review).
 */
function copyItem(def: ItemDef, flatOnly: boolean): PlayerItem {
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    description: def.description,
    slot: def.slot,
    bonuses: def.bonuses.map((b) => ({
      stat: b.stat,
      ...(b.flat === undefined ? {} : { flat: b.flat }),
      ...(b.percent === undefined || flatOnly ? {} : { percent: b.percent }),
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
  const own: Trade[] = [];
  for (const id of state.tradeOrder) {
    const t = hasOwnKey(state.trades, id) ? state.trades[id] : undefined;
    if (!t || (t.from !== viewerId && t.to !== viewerId)) continue;
    own.push(t);
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
  // Definitions only for items the viewer has seen (QF.9): an item a trade
  // asks for, but the viewer neither holds nor was offered, stays an id.
  for (const id of itemsSeenBy(h, own, viewerId)) wanted.add(id);
  const itemDefs: Record<string, PlayerItem> = {};
  for (const id of wanted) {
    const def = hasOwnKey(state.items, id) ? state.items[id] : undefined;
    if (def) itemDefs[id] = copyItem(def, state.rules.bonuses.itemsFlatOnly);
  }
  return { currency: h.currency, items, equipped, trades, itemDefs };
}

/**
 * A chance rounded to a whole percent (kept off 0 and 100 unless certain), so
 * the exact ratio cannot be solved back to an NPC's GM-only stat (M7.3).
 */
function wholePercent(chance: number): number {
  if (chance <= 0 || chance >= 1) return chance <= 0 ? 0 : 1;
  return Math.min(99, Math.max(1, Math.round(chance * 100))) / 100;
}

/** The latest shared contests `viewerId` took part in, from their side (M7.3). */
function playerContests(state: CampaignState, viewerId: string): PlayerContest[] {
  const out: PlayerContest[] = [];
  for (let i = state.contestOrder.length - 1; i >= 0 && out.length < PLAYER_CONTEST_LIMIT; i--) {
    const id = state.contestOrder[i] as string;
    const c = hasOwnKey(state.contests, id) ? state.contests[id] : undefined;
    if (!c) continue;
    const onA = c.a.characterIds.includes(viewerId);
    if (!onA && !c.b.characterIds.includes(viewerId)) continue;
    const mine = onA ? c.a : c.b;
    out.push({
      id: c.id,
      at: c.sharedAt,
      yours: { label: mine.label, stat: mine.stat, value: mine.value },
      theirs: (onA ? c.b : c.a).label,
      chance: wholePercent(onA ? c.chance : 1 - c.chance),
      walled: c.walled,
      won: onA ? c.success : !c.success,
    });
  }
  return out.reverse();
}

/** The current region's name only (M7.4). */
function currentRegionName(state: CampaignState): string | null {
  const id = state.currentRegion;
  if (id === null || !hasOwnKey(state.regions, id)) return null;
  return state.regions[id]?.name ?? null;
}
