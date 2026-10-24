import { CharacterRuleError, type Character } from '../character';
import { dueSelections, evolutionTarget } from '../evolution';
import type { CampaignState } from '../events/reducer';
import { skillPairCounts } from '../practice';
import { canUpgrade, mergeSkills } from '../skills';

/**
 * Something on a character that waits on the GM or the player (M4.5 party
 * dashboard, DESIGN §2-§6). GM-only: the dashboard reads the full state.
 */
export type CharacterFlag =
  | {
      readonly kind: 'selection';
      readonly level: number;
      readonly capstone: boolean;
      /** A menu is out and waits on the player; false = the GM has to build one. */
      readonly offered: boolean;
    }
  | {
      readonly kind: 'evolution';
      readonly toGrade: string;
      /**
       * ready: the GM can release it. blocked: a skill selection must be chosen
       * first (DESIGN §2), before release or before the player's choice.
       * released: waits on the player's choice.
       */
      readonly status: 'ready' | 'blocked' | 'released';
    }
  | { readonly kind: 'upgrade'; readonly skill: string; readonly marks: number }
  | {
      readonly kind: 'merge';
      readonly skills: readonly [string, string];
      readonly count: number;
    }
  | { readonly kind: 'freePoints'; readonly points: number };

/** Free points from level-ups not assigned yet (the player's to spend). */
export function unassignedFreePoints(character: Character): number {
  return character.freePointBatches
    .filter((b) => b.allocation === null)
    .reduce((a, b) => a + b.points, 0);
}

/**
 * Every flag for one character, in a fixed order: selections (lowest level
 * first), evolution, mark upgrades (skill order), merges (most logged pair
 * first), free points. A merge is flagged only when it would pass every merge
 * rule now, so the flag never offers what the engine would refuse.
 */
export function characterFlags(state: CampaignState, characterId: string): CharacterFlag[] {
  const character = Object.prototype.hasOwnProperty.call(state.characters, characterId)
    ? state.characters[characterId]
    : undefined;
  if (!character) return [];
  const { rules } = state;
  const flags: CharacterFlag[] = [];
  const due = dueSelections(rules, character);
  for (const slot of due) {
    const offered = character.selections.some((s) => s.level === slot.level && s.chosen === null);
    flags.push({ kind: 'selection', level: slot.level, capstone: slot.capstone, offered });
  }
  if (character.evolution !== null) {
    // A selection reached after the release must be chosen first (DESIGN §2).
    flags.push({
      kind: 'evolution',
      toGrade: character.evolution.toGrade,
      status: due.length > 0 ? 'blocked' : 'released',
    });
  } else {
    const target = evolutionTarget(rules, character);
    if (target) {
      flags.push({
        kind: 'evolution',
        toGrade: target.id,
        status: due.length > 0 ? 'blocked' : 'ready',
      });
    }
  }
  for (const skill of character.skills) {
    if (canUpgrade(rules, character, skill)) {
      flags.push({ kind: 'upgrade', skill: skill.name, marks: skill.marks });
    }
  }
  const probe = '\u0000merge-probe';
  for (const pair of skillPairCounts(state.practice, character.id)) {
    if (pair.count < rules.skills.merge.requiredJointUses) continue;
    const [a, b] = pair.skills;
    try {
      mergeSkills(rules, character, a, b, probe, pair.count);
    } catch (e) {
      if (e instanceof CharacterRuleError) continue;
      throw e;
    }
    flags.push({ kind: 'merge', skills: pair.skills, count: pair.count });
  }
  const points = unassignedFreePoints(character);
  if (points > 0) flags.push({ kind: 'freePoints', points });
  return flags;
}
