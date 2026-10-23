import {
  characterFlags,
  defaultRerate,
  dueSelections,
  evolutionTarget,
  releaseEvolution,
  retiredSkillNames,
  skillPairCounts,
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

export interface MergePrompt {
  readonly skills: readonly [string, string];
  readonly rarity: string;
}

export interface EvolutionPlan {
  readonly toGrade: string;
  /** Selections still owed (DESIGN §2: release waits on them); capstone flagged. */
  readonly pendingSelections: readonly { level: number; capstone: boolean }[];
  readonly rerate: readonly RerateRow[];
  /**
   * Merge-eligible pairs to prompt as merge transforms (DESIGN §6, D102), with
   * the usual merge rarity (one above the higher, capped at the new ceiling).
   */
  readonly mergePrompts: readonly MergePrompt[];
  /** Rarities a transform may take: up to the new grade's ceiling. */
  readonly rarities: readonly string[];
  /** How many transforms one option may carry (`skills.evolutionTransforms`). */
  readonly transforms: { readonly min: number; readonly max: number };
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
    mergePrompts: characterFlags(state, characterId).flatMap((f) => {
      if (f.kind !== 'merge') return [];
      const rank = (n: string) => ids.indexOf(c.skills.find((s) => s.name === n)?.rarity ?? '');
      const top = Math.max(rank(f.skills[0]), rank(f.skills[1]));
      const at = Math.min(top + rules.skills.merge.rarityStepsAboveHigher, choices.length - 1);
      const rarity = choices[Math.max(at, 0)] ?? target.rarityCeiling;
      return [{ skills: [f.skills[0], f.skills[1]] as const, rarity }];
    }),
    rarities: choices,
    transforms: rules.skills.evolutionTransforms,
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
      jointUses(state, characterId),
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Times two of the character's skills were logged together (as the engine counts). */
function jointUses(state: CampaignState, characterId: string) {
  const counts = skillPairCounts(state.practice, characterId);
  return (x: string, y: string): number => {
    const [a, b] = x < y ? [x, y] : [y, x];
    return counts.find((p) => p.skills[0] === a && p.skills[1] === b)?.count ?? 0;
  };
}

/**
 * Untaken profession offers the GM may withdraw (M5.2, MQ.6 review): the
 * Professions tab's list plus a pending release's, for each character
 * without a profession. Empty once a profession locks the list.
 */
export function withdrawableOffers(
  state: CampaignState,
): readonly { characterId: string; name: string; offers: readonly string[] }[] {
  return state.characterOrder.flatMap((id) => {
    const c = state.characters[id];
    if (!c || c.profession !== null) return [];
    const offers = [...c.professionOffers];
    for (const p of c.evolution?.professions ?? []) if (!offers.includes(p)) offers.push(p);
    return offers.length > 0 ? [{ characterId: id, name: c.name, offers }] : [];
  });
}
