import {
  characterFlags,
  defaultRerate,
  dueSelections,
  evolutionTarget,
  releaseEvolution,
  retiredSkillNames,
  type CampaignState,
  type EvolutionOption,
  type SkillRerate,
} from '@the-system/engine';

// M5.2 evolution builder (work in progress): what the GM needs to build and
// release an evolution, derived from the engine's own rules.

export interface RerateRow {
  readonly skill: string;
  readonly from: string;
  /** The default after the evolution: one rarity down, floor at the lowest. */
  readonly byDefault: string;
  /** Rarities the GM may pick: anything up to the new grade's ceiling. */
  readonly choices: readonly string[];
}

export interface EvolutionPlan {
  readonly toGrade: string;
  /** Selections still owed (DESIGN §2: release waits on them); capstone flagged. */
  readonly pendingSelections: readonly { level: number; capstone: boolean }[];
  readonly rerate: readonly RerateRow[];
  /** Merge-eligible pairs to prompt as transforms (DESIGN §6, D102). */
  readonly mergePrompts: readonly (readonly [string, string])[];
  /** Tailored profession offers allowed (no profession, unlock grade reached). */
  readonly professionOffers: boolean;
  /** Class names of a release the player has not chosen from yet; re-releasing replaces it. */
  readonly released: readonly string[] | null;
}

const retiredOf = (state: CampaignState, characterId: string) =>
  retiredSkillNames(
    state.characters[characterId]!,
    state.practice.filter((e) => e.characterId === characterId).flatMap((e) => e.skills),
  );

/** The evolution the character could be given now, or null when none is available. */
export function evolutionPlan(state: CampaignState, characterId: string): EvolutionPlan | null {
  const c = state.characters[characterId];
  if (!c) return null;
  const { rules } = state;
  const target = evolutionTarget(rules, c);
  if (!target) return null;
  const ids = rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);
  const ceiling = ids.indexOf(target.rarityCeiling);
  const choices = ceiling < 0 ? ids : ids.slice(0, ceiling + 1);
  const defaults = new Map(defaultRerate(rules, c).map((r) => [r.skill, r.rarity]));
  const gi = (g: string) => rules.grades.findIndex((x) => x.id === g);
  return {
    toGrade: target.id,
    pendingSelections: dueSelections(rules, c).map((s) => ({
      level: s.level,
      capstone: s.capstone,
    })),
    rerate: c.skills.map((s) => ({
      skill: s.name,
      from: s.rarity,
      byDefault: defaults.get(s.name) ?? s.rarity,
      choices,
    })),
    mergePrompts: characterFlags(state, characterId).flatMap((f) =>
      f.kind === 'merge' ? [[f.skills[0], f.skills[1]] as const] : [],
    ),
    professionOffers:
      c.profession === null && gi(target.id) >= gi(rules.tracks.professionUnlockGrade),
    released: c.evolution ? c.evolution.options.map((o) => o.className) : null,
  };
}

/** Why the engine would refuse this release, or null when it would accept it. */
export function releaseProblem(
  state: CampaignState,
  characterId: string,
  options: readonly EvolutionOption[],
  professions: readonly string[],
  rerate: readonly SkillRerate[],
): string | null {
  const c = state.characters[characterId];
  if (!c) return 'No such character.';
  try {
    releaseEvolution(
      state.rules,
      c,
      options,
      professions,
      retiredOf(state, characterId),
      'draft',
      false,
      rerate,
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
