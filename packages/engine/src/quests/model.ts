import { CharacterRuleError } from '../character';
import type { RulesConfig } from '../rules';

/**
 * Quests and World Stability (ROADMAP M1.12, DESIGN §7): quest text, an
 * optional day timer against the campaign's in-game day counter, and an
 * optional World Stability gauge with GM-defined rules (action tag → delta),
 * clamped to the configured range (0–100), with a manual nudge and a
 * players-can-see toggle. Pure; rule breaks throw CharacterRuleError.
 */

export type QuestStatus = 'active' | 'completed' | 'failed';

export interface Stability {
  readonly value: number;
  /** Players see the gauge only when true (DESIGN §7 visible/hidden toggle). */
  readonly visible: boolean;
  /** Action tag → delta ("cleanse" → -5); GM tuning, never sent to players. */
  readonly rules: Readonly<Record<string, number>>;
}

export interface Quest {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly status: QuestStatus;
  /** Players see the quest only when true. */
  readonly visible: boolean;
  /** Timer length in in-game days, or null for none. */
  readonly days: number | null;
  /** Campaign day the quest started (the timer counts from here). */
  readonly startDay: number;
  readonly stability: Stability | null;
  readonly createdAt: string;
}

/** Clamps a stability value to the configured range. */
export function clampStability(rules: RulesConfig, value: number): number {
  return Math.min(rules.stability.max, Math.max(rules.stability.min, value));
}

/** Throws unless every tag is non-blank and every delta a finite number in range. */
export function checkStabilityRules(
  rules: RulesConfig,
  tagRules: Readonly<Record<string, number>>,
): void {
  const span = rules.stability.max - rules.stability.min;
  for (const [tag, delta] of Object.entries(tagRules)) {
    if (tag.trim() === '' || tag !== tag.trim().toLowerCase()) {
      throw new CharacterRuleError(
        `Action tag "${tag}" must be lower-case with no spaces around it`,
      );
    }
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > span) {
      throw new CharacterRuleError(`The delta for "${tag}" must be non-zero and at most ${span}`);
    }
  }
}

/** Days left on the timer at `day` (may be 0 or negative once it runs out), or null. */
export function daysLeft(quest: Quest, day: number): number | null {
  return quest.days === null ? null : quest.startDay + quest.days - day;
}

/** Applies a tagged action `count` times to a quest's stability (clamped). */
export function applyAction(rules: RulesConfig, quest: Quest, tag: string, count: number): Quest {
  const stability = quest.stability;
  if (!stability) throw new CharacterRuleError(`[${quest.title}] has no World Stability`);
  if (quest.status !== 'active')
    throw new CharacterRuleError(`[${quest.title}] is ${quest.status}`);
  const delta = Object.prototype.hasOwnProperty.call(stability.rules, tag)
    ? stability.rules[tag]
    : undefined;
  if (delta === undefined) {
    throw new CharacterRuleError(`[${quest.title}] has no stability rule for "${tag}"`);
  }
  if (!Number.isInteger(count) || count < 1)
    throw new CharacterRuleError('Count must be 1 or more');
  return nudge(rules, quest, delta * count);
}

/** Moves a quest's stability by `delta` (clamped). The GM may nudge a closed quest too. */
export function nudge(rules: RulesConfig, quest: Quest, delta: number): Quest {
  const stability = quest.stability;
  if (!stability) throw new CharacterRuleError(`[${quest.title}] has no World Stability`);
  if (!Number.isFinite(delta) || delta === 0)
    throw new CharacterRuleError('Nudge by a non-zero amount');
  const value = clampStability(rules, Number((stability.value + delta).toFixed(6)));
  return { ...quest, stability: { ...stability, value } };
}
