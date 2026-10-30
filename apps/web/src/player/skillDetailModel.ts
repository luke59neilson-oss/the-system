import type { OwnSheet, PlayerRules } from '@the-system/engine';
import { rarityName } from './sheet';

type Skill = OwnSheet['skills'][number];

/** Where a skill stands on the mastery-mark ladder (DESIGN §6), for the skill detail (M3.5). */
export interface MarkProgress {
  /** One line of text, e.g. "2 / 4 marks toward Uncommon". */
  readonly text: string;
  /** Bar fill 0–100, or null when there is no next step to fill toward. */
  readonly percent: number | null;
  /** True when the skill already has the marks but the grade ceiling holds it. */
  readonly banked: boolean;
}

/** Mark progress text and bar, from the projection's rule-derived fields. */
export function markProgress(rules: PlayerRules, grade: string, skill: Skill): MarkProgress {
  const marks = `${skill.marks} ${skill.marks === 1 ? 'mark' : 'marks'}`;
  if (skill.marksNeeded === null || skill.nextRarity === null) {
    return {
      text: `${marks}. ${rarityName(rules, skill.rarity)} is the top of the mark ladder.`,
      percent: null,
      banked: false,
    };
  }
  const percent = Math.min(100, Math.round((100 * skill.marks) / skill.marksNeeded));
  const toward = `${skill.marks} / ${skill.marksNeeded} marks toward ${rarityName(rules, skill.nextRarity)}`;
  if (skill.atCeiling) {
    return {
      text: `${toward}. ${rarityName(rules, skill.rarity)} is the ${grade}-grade ceiling: marks bank until your next evolution.`,
      percent,
      banked: skill.marks >= skill.marksNeeded,
    };
  }
  // MR.2: an upgraded skill is new to the character and starts at 0 marks.
  const fresh = rules.marks.resetOnUpgrade ? ' The upgraded skill starts at 0 marks.' : '';
  return {
    text:
      skill.marks >= skill.marksNeeded
        ? `${toward}. Ready: the GM can upgrade it.${fresh}`
        : `${toward}.`,
    percent,
    banked: false,
  };
}

/** Kind label for the detail header. */
export function kindLabel(kind: Skill['kind']): string {
  return kind === 'class'
    ? 'Class skill'
    : kind === 'profession'
      ? 'Profession skill'
      : 'Race skill';
}

/** A pool's short label: the part in brackets ("Mana Points (MP)" → "MP"), else its name. */
export function poolShort(rules: Pick<PlayerRules, 'pools'>, id: string): string {
  const name = rules.pools.find((p) => p.id === id)?.name ?? id;
  return /\(([^()]+)\)\s*$/.exec(name)?.[1] ?? name;
}

/** MU.4: "15 MP" for a skill with a cost, or null. */
export function costText(
  rules: Pick<PlayerRules, 'pools'>,
  skill: Pick<Skill, 'casting'>,
): string | null {
  const cost = skill.casting?.cost;
  return cost ? `${cost.amount.toLocaleString('en-US')} ${poolShort(rules, cost.pool)}` : null;
}
