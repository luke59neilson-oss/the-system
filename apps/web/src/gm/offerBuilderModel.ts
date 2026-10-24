import {
  dueSelections,
  offerSelection,
  passedOverOptions,
  retiredSkillNames,
  type CampaignState,
  type SkillOption,
} from '@the-system/engine';

// M5.1 offer builder: what the GM needs per character to
// build a selection menu, derived only from the engine's own rules so the
// builder and the engine never disagree.

/** One reached selection the character has not chosen yet. */
export interface BuilderSlot {
  readonly level: number;
  readonly grade: string;
  /** The grade's last selection: needs an option at the rarity ceiling. */
  readonly capstone: boolean;
  readonly ceiling: string;
  /** The menu offered now and not chosen yet, or null when nothing is offered. */
  readonly pending: readonly SkillOption[] | null;
  /** Older unchosen options the player will also see (GM can withdraw them). */
  readonly passedOver: readonly SkillOption[];
}

/** Same retired set the reducer uses for this character (from its practice log). */
const retiredOf = (state: CampaignState, characterId: string) =>
  retiredSkillNames(
    state.characters[characterId]!,
    state.practice.filter((e) => e.characterId === characterId).flatMap((e) => e.skills),
  );

/** Due selections for a character, oldest first, with what the builder shows. */
export function builderSlots(state: CampaignState, characterId: string): BuilderSlot[] {
  const c = state.characters[characterId];
  if (!c) return [];
  const rules = state.rules;
  const retired = retiredOf(state, characterId);
  return dueSelections(rules, c).map((slot) => {
    const record = c.selections.find((s) => s.level === slot.level);
    return {
      level: slot.level,
      grade: slot.grade,
      capstone: slot.capstone,
      ceiling: rules.grades.find((g) => g.id === slot.grade)?.rarityCeiling ?? '',
      pending: record && record.chosen === null ? record.options : null,
      passedOver: passedOverOptions(rules, c, slot.level, retired),
    };
  });
}

/**
 * Why the engine would refuse this menu (size, ceiling, capstone, profession
 * options, names the character already has), or null when it would accept it.
 */
export function offerProblem(
  state: CampaignState,
  characterId: string,
  level: number,
  options: readonly SkillOption[],
): string | null {
  const c = state.characters[characterId];
  if (!c) return 'No such character.';
  try {
    offerSelection(state.rules, c, level, options, retiredOf(state, characterId));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

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
