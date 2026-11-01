// ME.3 (DESIGN §9a, §2): the Evolutions tab's builder model. A draft holds
// the three steps' option cards; the meters and the release blockers come
// from the engine's own budget check, so the tab and the engine agree.
import { stepBudgetProblems } from '@the-system/engine';

export type StepId = 'class' | 'profession' | 'race';
export const STEPS: readonly StepId[] = ['class', 'profession', 'race'];

export interface DraftOption {
  readonly id: string;
  readonly name: string;
  readonly rarity: string;
  readonly description: string;
  readonly stats: Readonly<Record<string, number>>;
  readonly free: number;
  readonly bonus: Readonly<Record<string, number>>;
}

export type EvolutionDraft = Readonly<Record<StepId, readonly DraftOption[]>>;

export interface OptionMeter {
  readonly perLevel: number;
  readonly budget: number;
  /** perLevel − budget: 0 is on budget; shown in red otherwise. */
  readonly perLevelDiff: number;
  readonly bonus: number;
  /** bonus − the step's first option's bonus (the reference); 0 when equal. */
  readonly bonusDiff: number;
}

const sum = (r: Readonly<Record<string, number>>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Each option's budget meter in one step. */
export function stepMeters(options: readonly DraftOption[], budget: number): OptionMeter[] {
  const reference = options.length === 0 ? 0 : sum(options[0]!.bonus);
  return options.map((o) => {
    const perLevel = sum(o.stats) + o.free;
    const bonus = sum(o.bonus);
    return {
      perLevel,
      budget,
      perLevelDiff: perLevel - budget,
      bonus,
      bonusDiff: bonus - reference,
    };
  });
}

/**
 * Why Release is blocked: empty class or race step, a character with a
 * profession and no profession option, and the engine's budget problems
 * (Override releases past the budget ones only).
 */
export function releaseBlockers(
  draft: EvolutionDraft,
  budgets: Readonly<Record<StepId, number>>,
  hasProfession: boolean,
): { readonly hard: string[]; readonly overridable: string[] } {
  const hard: string[] = [];
  if (draft.class.length === 0) hard.push('Add at least one class option');
  if (draft.race.length === 0) hard.push('Add at least one race option');
  if (hasProfession && draft.profession.length === 0) {
    hard.push('Add at least one profession option: this character evolves their profession');
  }
  const label: Record<StepId, string> = { class: 'Class', profession: 'Profession', race: 'Race' };
  const overridable = STEPS.flatMap((step) =>
    stepBudgetProblems(
      label[step],
      budgets[step],
      draft[step].map((o) => ({
        id: o.id,
        name: o.name,
        distribution: { stats: o.stats, free: o.free },
        statBonus: o.bonus,
      })),
    ),
  );
  return { hard, overridable };
}
