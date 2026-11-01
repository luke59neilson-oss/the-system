import type { EvolutionOption, OwnSheet, PendingEvolution, PlayerRules } from '@the-system/engine';
import { evolutionWarnings } from './evolution';

/**
 * ME.5 (DESIGN §9 "Evolution on the player's screen", §2): the player's
 * three-step evolution. Pure helpers for the Evolution window and its steps.
 */

export type EvolutionStepId = 'class' | 'profession' | 'race';
export const EVOLUTION_STEPS: readonly EvolutionStepId[] = ['class', 'profession', 'race'];
export const EVOLUTION_STEP_LABEL: Readonly<Record<EvolutionStepId, string>> = {
  class: 'Class',
  profession: 'Profession',
  race: 'Race',
};

export type StepCard = NonNullable<PendingEvolution['steps']>['class'][number];

/** "Perception 5 · Agility 3 · Free points 2": stats in stat order, ending in free points. */
export function perLevelText(rules: Pick<PlayerRules, 'stats'>, card: StepCard): string {
  const parts = rules.stats.list.flatMap((s) => {
    const v = card.distribution.stats[s.id] ?? 0;
    return v > 0 ? [`${s.name} ${v}`] : [];
  });
  parts.push(`Free points ${card.distribution.free}`);
  return parts.join(' · ');
}

/** The window's state: locked (nothing released), lit (released, not yet opened) or open. */
export function evolutionPanelState(
  evolution: Pick<PendingEvolution, 'releaseId'> | null,
  openedReleaseId: string | null,
): 'locked' | 'lit' | 'open' {
  if (evolution === null) return 'locked';
  return evolution.releaseId === openedReleaseId ? 'open' : 'lit';
}

/** The localStorage key remembering which release this browser opened. */
export const openedKey = (characterId: string) => `the-system:evolution-opened:${characterId}`;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** The release this browser opened for the character, or null. Never throws. */
export function readOpened(storage: KeyValueStore | null, characterId: string): string | null {
  if (!storage) return null;
  try {
    const v = storage.getItem(openedKey(characterId));
    return v && v.length <= 200 ? v : null;
  } catch {
    return null;
  }
}

/** Remembers the opened release (best effort: blocked storage just forgets). */
export function writeOpened(
  storage: KeyValueStore | null,
  characterId: string,
  releaseId: string,
): void {
  try {
    storage?.setItem(openedKey(characterId), releaseId);
  } catch {
    // Storage blocked: the window lights again on the next load, which is harmless.
  }
}

/**
 * Whether the profession step is a choice the player makes: a character with
 * a profession evolves it (one of the options); one without picks an offer or
 * "none for now" (DESIGN §2), shown even when the GM offered none.
 */
export function professionNoneAllowed(me: Pick<OwnSheet, 'profession'>): boolean {
  return me.profession === null;
}

export interface StepPicks {
  readonly class: string | null;
  /** null = not picked yet; '' = "none for now". */
  readonly profession: string | null;
  readonly race: string | null;
}

/** True when every step has a pick (the profession step skipped when there is nothing to pick). */
export function picksComplete(
  steps: NonNullable<PendingEvolution['steps']>,
  me: Pick<OwnSheet, 'profession'>,
  picks: StepPicks,
): boolean {
  const professionDone =
    picks.profession !== null || (!professionNoneAllowed(me) && steps.profession.length === 0);
  return picks.class !== null && picks.race !== null && professionDone;
}

/** The `evolution.choose` choices for the picks ("none for now" = null). */
export function stepChoices(picks: StepPicks): {
  class: string;
  profession: string | null;
  race: string;
} {
  return {
    class: picks.class ?? '',
    profession: picks.profession === null || picks.profession === '' ? null : picks.profession,
    race: picks.race ?? '',
  };
}

/**
 * What to know before confirming: the transforms and merges of all three
 * picks (marks reset), and that the choice is final.
 */
export function stepWarnings(
  rules: Pick<PlayerRules, 'marks'>,
  me: Pick<OwnSheet, 'skills'>,
  cards: readonly StepCard[],
): string[] {
  const out = cards.flatMap((c) =>
    evolutionWarnings(rules, me, {
      id: c.id,
      className: c.name,
      description: c.description,
      transforms: c.transforms,
      classWeights: null,
      statBonus: c.statBonus,
    } as EvolutionOption).filter((w) => !w.startsWith('The choice is final')),
  );
  out.push('The choice is final; the other options will be gone.');
  return [...new Set(out)];
}
