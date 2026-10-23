import {
  dueSelections,
  offerSelection,
  passedOverOptions,
  retiredSkillNames,
  type CampaignState,
  type SkillOption,
} from '@the-system/engine';

// M5.1 offer builder (work in progress): what the GM needs per character to
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
