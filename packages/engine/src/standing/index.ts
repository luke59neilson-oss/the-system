import { itemEffectiveStats } from '../economy/model';
import { castingForSkill } from '../skills/library';
import { raceLevel, unassignedPointsOf, type CharacterSkill } from '../character/model';
import { titleSources } from '../titles';
import type { CampaignState } from '../events/reducer';

// MW.1 (DESIGN §6 "Building an offer"): what a character already has and has
// practised, for the GM's skill-offer builder and the co-DM's drafts (MW.2).
// GM-only: player projections never use it.

/** The character's newest practice entries first (what the menu is built from). */
export function recentPractice(state: CampaignState, characterId: string, limit = 12) {
  return state.practice
    .filter((e) => e.characterId === characterId)
    .slice(-limit)
    .reverse();
}

/** How often each skill appears in the character's practice log, most used first. */
export function practiceSkillCounts(
  state: CampaignState,
  characterId: string,
): { skill: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of state.practice) {
    if (e.characterId !== characterId) continue;
    for (const s of new Set(e.skills)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
}

/** How often each stat was exercised in the character's practice log, most first. */
export function practiceStatCounts(
  state: CampaignState,
  characterId: string,
): { stat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of state.practice) {
    if (e.characterId === characterId && e.stat !== null)
      counts.set(e.stat, (counts.get(e.stat) ?? 0) + 1);
  }
  return [...counts]
    .map(([stat, count]) => ({ stat, count }))
    .sort((a, b) => b.count - a.count || a.stat.localeCompare(b.stat));
}

/** One line of a character's standing: a stat's base, what bonuses add, and the total. */
export interface StandingStat {
  readonly id: string;
  readonly name: string;
  readonly base: number;
  readonly bonus: number;
  readonly total: number;
}

export interface StandingSkill {
  readonly name: string;
  readonly rarity: string;
  readonly marks: number;
  readonly kind: CharacterSkill['kind'];
  /** "5 Mana Points" for a spell with a cost, else null. */
  readonly cost: string | null;
}

/** MW.1 (DESIGN §6 "Building an offer"): what the GM builds an offer on. */
export interface CharacterStanding {
  readonly grade: string;
  readonly classLevel: number;
  readonly professionLevel: number | null;
  readonly raceLevel: number;
  readonly className: string;
  readonly race: string;
  readonly profession: string | null;
  readonly stats: readonly StandingStat[];
  readonly freePoints: number;
  readonly skills: readonly StandingSkill[];
  readonly titles: readonly string[];
  readonly equipped: readonly { readonly slot: string; readonly item: string }[];
  /** How often two skills were used together, most used first, at most `TOP_PAIRS`. */
  readonly pairs: readonly { readonly skills: readonly [string, string]; readonly count: number }[];
}

const TOP_PAIRS = 5;

/** Skill pairs used together in the character's practice log, most used first. */
export function practiceSkillPairs(
  state: CampaignState,
  characterId: string,
): CharacterStanding['pairs'] {
  const counts = new Map<string, { skills: readonly [string, string]; count: number }>();
  for (const e of state.practice) {
    if (e.characterId !== characterId) continue;
    const names = [...new Set(e.skills)].sort((a, b) => a.localeCompare(b));
    names.forEach((a, i) => {
      for (const b of names.slice(i + 1)) {
        const key = JSON.stringify([a, b]);
        const seen = counts.get(key);
        counts.set(key, { skills: [a, b], count: (seen?.count ?? 0) + 1 });
      }
    });
  }
  return [...counts.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.skills[0].localeCompare(b.skills[0]) ||
        a.skills[1].localeCompare(b.skills[1]),
    )
    .slice(0, TOP_PAIRS);
}

/** The chosen character's whole standing, or null for no such character. */
export function characterStanding(
  state: CampaignState,
  characterId: string,
): CharacterStanding | null {
  const c = state.characters[characterId];
  if (!c) return null;
  const { rules } = state;
  const holdings = state.holdings[characterId] ?? { currency: 0, inventory: {}, equipped: {} };
  const totals = itemEffectiveStats(
    rules,
    c.stats,
    holdings,
    state.items,
    titleSources(state.titleLibrary, state.titleLibraryOrder, c.titles),
  );
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const poolName = (id: string) => rules.pools.find((p) => p.id === id)?.name ?? id;
  return {
    grade: c.grade,
    classLevel: c.classLevel,
    professionLevel: c.profession === null ? null : c.professionLevel,
    raceLevel: raceLevel(rules, c),
    className: c.className,
    race: c.race,
    profession: c.profession,
    stats: rules.stats.list.map((s) => {
      const base = c.stats[s.id] ?? 0;
      const total = totals[s.id] ?? base;
      return { id: s.id, name: s.name, base, bonus: total - base, total };
    }),
    freePoints: unassignedPointsOf(c.freePointBatches),
    skills: c.skills.map((s) => {
      const cost = castingForSkill(rules, state.skillLibrary, s)?.cost ?? null;
      return {
        name: s.name,
        rarity: rarityName(s.rarity),
        marks: s.marks,
        kind: s.kind,
        cost: cost === null ? null : `${cost.amount} ${poolName(cost.pool)}`,
      };
    }),
    titles: c.titles,
    equipped: rules.economy.equipmentSlots.flatMap((slot) =>
      Array.from({ length: slot.count }, (_, i) => {
        const id = holdings.equipped[`${slot.id}:${i}`];
        return id === undefined ? [] : [{ slot: slot.name, item: state.items[id]?.name ?? id }];
      }).flat(),
    ),
    pairs: practiceSkillPairs(state, characterId),
  };
}
