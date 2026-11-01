// ME.3 (DESIGN §9a, §2): the Evolutions tab's builder model. A draft holds
// the three steps' option cards; the meters and the release blockers come
// from the engine's own budget check, so the tab and the engine agree.
import {
  execute,
  raceLevel,
  skillPairCounts,
  stepBudgetProblems,
  trackCap,
  unassignedPointsOf,
  type CampaignState,
  type Character,
  type Command,
  type RulesConfig,
} from '@the-system/engine';

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

/**
 * DESIGN §9a: the characters the Evolutions tab lists, at or within `within`
 * race levels of their grade's top (the threshold), in party order, with how
 * far each one is. A character at the last grade is never listed.
 */
export function nearThreshold(
  rules: RulesConfig,
  characters: readonly Character[],
  within = 3,
): { readonly id: string; readonly levelsToGo: number }[] {
  const last = rules.grades[rules.grades.length - 1]?.id;
  return characters.flatMap((c) => {
    if (c.grade === last) return [];
    const levelsToGo = Math.max(0, trackCap(rules, c.grade) - raceLevel(rules, c));
    return levelsToGo <= within ? [{ id: c.id, levelsToGo }] : [];
  });
}

/** The `evolution.release` command a draft sends (ME.3), steps in place of options. */
export function stepsCommand(
  characterId: string,
  draft: EvolutionDraft,
  extra: {
    readonly transforms?: Readonly<
      Record<string, readonly { skill: string; name: string; rarity: string; merge?: string }[]>
    >;
    readonly rerate: Readonly<Record<string, string>>;
    readonly override: boolean;
  },
): Extract<Command, { type: 'evolution.release' }> {
  const card = (o: DraftOption) => {
    const transforms = extra.transforms?.[o.id] ?? [];
    const statBonus = Object.fromEntries(Object.entries(o.bonus).filter(([, n]) => n > 0));
    return {
      id: o.id,
      name: o.name.trim(),
      rarity: o.rarity,
      description: o.description.trim(),
      distribution: {
        stats: Object.fromEntries(Object.entries(o.stats).filter(([, n]) => n > 0)),
        free: o.free,
      },
      statBonus,
      ...(transforms.length > 0 ? { transforms } : {}),
    };
  };
  return {
    type: 'evolution.release',
    characterId,
    options: [],
    steps: {
      class: draft.class.map(card),
      profession: draft.profession.map(card),
      race: draft.race.map(card),
    },
    rerate: extra.rerate,
    rerateApproved: true,
    ...(extra.override ? { override: true } : {}),
  };
}

const DRY_RUN = {
  actor: { role: 'gm' as const },
  sessionId: null,
  now: () => '2000-01-01T00:00:00.000Z',
  newId: () => 'evolution-draft',
};

/**
 * Why the engine would refuse this release, or null when it would take it: a
 * dry run of the command on the GM's state, so the tab never offers a release
 * the engine refuses (every class × profession × race combination, D303).
 */
export function stepsReleaseProblem(
  state: CampaignState,
  command: Extract<Command, { type: 'evolution.release' }>,
): string | null {
  const r = execute({ events: [], state, undone: {} }, command, DRY_RUN);
  return r.ok ? null : r.error;
}

export interface Standing {
  readonly grade: string;
  readonly levels: string;
  readonly stats: readonly { readonly name: string; readonly value: number }[];
  readonly freePoints: number;
  readonly skills: readonly string[];
  /** Practice entries per skill, most practised first (top 5). */
  readonly practised: readonly { readonly skill: string; readonly count: number }[];
  /** The most-logged skill pairs (top 3). */
  readonly pairs: readonly { readonly skills: readonly [string, string]; readonly count: number }[];
}

/** ME.3: the compact standing panel beside the builder (stats, skills, practice summary). */
export function standingOf(state: CampaignState, characterId: string): Standing | null {
  const c = state.characters[characterId];
  if (!c) return null;
  const { rules } = state;
  const rarity = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const counts = new Map<string, number>();
  for (const e of state.practice) {
    if (e.characterId !== characterId) continue;
    for (const s of e.skills) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return {
    grade: c.grade,
    levels:
      `Class ${c.classLevel}` +
      (c.profession === null ? '' : ` · Profession ${c.professionLevel}`) +
      ` · Race ${raceLevel(rules, c)}`,
    stats: rules.stats.list.map((s) => ({ name: s.name, value: c.stats[s.id] ?? 0 })),
    freePoints: unassignedPointsOf(c.freePointBatches),
    skills: c.skills.map((s) => `${s.name} (${rarity(s.rarity)})`),
    practised: [...counts]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
      .slice(0, 5),
    pairs: skillPairCounts(state.practice, characterId)
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  };
}
