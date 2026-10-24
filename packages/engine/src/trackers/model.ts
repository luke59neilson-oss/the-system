import type { Character } from '../character';
import type { RulesConfig } from '../rules';

/**
 * Trackers (M7.4, DESIGN §7–§8): the tutorial's hunger tracker, the regions
 * the party moves through, and the survivor factions they meet. All three are
 * light bookkeeping for the GM; only hunger (to its owner) and the current
 * region's name reach players.
 */

/** Default hunger steps, lowest first (D184): campaign data the GM may rename. */
export const DEFAULT_HUNGER_STEPS: readonly string[] = [
  'Fed',
  'Peckish',
  'Hungry',
  'Famished',
  'Starving',
];

/** The campaign's hunger tracker (DESIGN §7: optional per campaign, fades at E-grade). */
export interface HungerTracker {
  /** Whether the campaign uses it; starts at `rules.hunger.enabledByDefault`. */
  readonly enabled: boolean;
  /** Step names, lowest (0) first; a character's level indexes this list. */
  readonly steps: readonly string[];
  /** Character id → step index; absent = 0 (the first step). */
  readonly levels: Readonly<Record<string, number>>;
}

/** A region of the world (DESIGN §8: The Crown → … → The Drum). */
export interface Region {
  readonly id: string;
  readonly name: string;
  /** GM-only notes. */
  readonly notes: string;
  /** True once the party has been there (set when it becomes the current region). */
  readonly visited: boolean;
  readonly createdAt: string;
}

/** A survivor faction (DESIGN §8: NPC survivors form factions). GM-only. */
export interface Faction {
  readonly id: string;
  readonly name: string;
  /** Where it is based, or null. */
  readonly regionId: string | null;
  /** How many survivors it counts, or null when unknown. */
  readonly members: number | null;
  /** How it stands toward the party, in the GM's words ("Wary", "Allied"). */
  readonly standing: string;
  readonly notes: string;
  readonly createdAt: string;
}

export function newHungerTracker(rules: RulesConfig): HungerTracker {
  return { enabled: rules.hunger.enabledByDefault, steps: [...DEFAULT_HUNGER_STEPS], levels: {} };
}

/**
 * Whether a character has outgrown hunger (DESIGN §7: fades at E-grade): their
 * grade is `rules.hunger.fadesAtGrade` or higher.
 */
export function hungerFaded(rules: RulesConfig, character: Pick<Character, 'grade'>): boolean {
  const order = rules.grades.map((g) => g.id);
  const fade = order.indexOf(rules.hunger.fadesAtGrade);
  const mine = order.indexOf(character.grade);
  return fade !== -1 && mine >= fade;
}

/** A character's hunger step index (0 when never set), clamped to the step list. */
export function hungerLevel(tracker: HungerTracker, characterId: string): number {
  const raw = Object.prototype.hasOwnProperty.call(tracker.levels, characterId)
    ? (tracker.levels[characterId] ?? 0)
    : 0;
  return Math.min(Math.max(raw, 0), tracker.steps.length - 1);
}

/** Why a step list is invalid, or null when it is fine. */
export function hungerStepsProblem(steps: readonly string[]): string | null {
  if (steps.length < 2) return 'give at least two hunger steps';
  const seen = new Set<string>();
  for (const s of steps) {
    const key = s.trim().toLowerCase();
    if (key === '') return 'hunger steps cannot be blank';
    if (seen.has(key)) return `hunger step "${s.trim()}" is listed twice`;
    seen.add(key);
  }
  return null;
}
