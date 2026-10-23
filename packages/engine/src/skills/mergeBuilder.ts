import { CharacterRuleError } from '../character';
import type { CampaignState } from '../events/reducer';
import { practiceAlerts } from '../practice/model';
import { mergeSkills } from './model';

/**
 * Merge builder (ROADMAP M5.4, DESIGN §6). Pure: the merge alerts for one
 * character, each with the rarity the merged skill would get and, when the
 * engine would refuse the merge now, why. Built by running the engine's own
 * `mergeSkills`, so the builder never disagrees with it.
 */
export interface MergeCandidate {
  readonly skills: readonly [string, string];
  /** Joint uses in the practice log. */
  readonly count: number;
  /** Rarity id of the merged skill, or null when the merge is refused. */
  readonly rarity: string | null;
  /** Why the engine would refuse it now (rarity, ceiling, one per grade), else null. */
  readonly problem: string | null;
}

/** A name no character skill can have, to test a merge without a real name. */
const PROBE = '\u0000merge-probe';

export function mergeCandidates(state: CampaignState, characterId: string): MergeCandidate[] {
  const character = Object.prototype.hasOwnProperty.call(state.characters, characterId)
    ? state.characters[characterId]
    : undefined;
  if (!character) return [];
  const entries = state.practice.filter((e) => e.characterId === characterId);
  return practiceAlerts(state.rules, character, entries).flatMap((alert): MergeCandidate[] => {
    if (alert.kind !== 'merge') return [];
    const [a, b] = alert.skills;
    try {
      const after = mergeSkills(state.rules, character, a, b, PROBE, alert.count);
      const rarity = after.skills.find((s) => s.name === PROBE)?.rarity ?? null;
      return [{ skills: alert.skills, count: alert.count, rarity, problem: null }];
    } catch (err) {
      if (!(err instanceof CharacterRuleError)) throw err;
      return [{ skills: alert.skills, count: alert.count, rarity: null, problem: err.message }];
    }
  });
}
