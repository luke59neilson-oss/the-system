import type { CampaignState } from '../events/reducer';
import { repeatedEntryIds, skillPairCounts, type PracticeSource } from '../practice/model';
import { atCeiling, canUpgrade, marksToUpgrade } from './model';

/**
 * End-of-session marks review (ROADMAP M5.3, DESIGN §6–7). Pure: what the GM
 * needs to confirm mastery marks for one play session and to act on the
 * upgrades they unlock. Built only from the engine's own rules (`awardMark`,
 * `canUpgrade`), so the review never offers what the engine would refuse.
 */

/** One practice entry behind a candidate, as the review lists it. */
export interface ReviewEntry {
  readonly id: string;
  readonly action: string;
  readonly source: PracticeSource;
  /** Repeats an earlier entry this session (DESIGN §7 "repeats flagged"). */
  readonly repeated: boolean;
}

/**
 * - `eligible`: the GM may confirm a mark now.
 * - `marked`: the skill already has this session's mark(s).
 * - `noUpgrade`: the skill's rarity has no mark upgrade, so it cannot earn marks.
 */
export type MarkStatus = 'eligible' | 'marked' | 'noUpgrade';

/** A skill the character owns, with how it was used this session. */
export interface MarkCandidate {
  readonly skill: string;
  readonly rarity: string;
  /** Entries this session that used the skill (0 for a skill not logged). */
  readonly uses: number;
  readonly entries: readonly ReviewEntry[];
  readonly marks: number;
  /** Marks for the next rarity; null when there is none. */
  readonly needed: number | null;
  readonly status: MarkStatus;
  /** At the grade's rarity ceiling: a mark banks until the next evolution. */
  readonly banks: boolean;
  /** A montage focus used it this session: the focus counts as its mark (DESIGN §6). */
  readonly montage: boolean;
}

/** Two skills logged working together this session (DESIGN §7 "skill pairs counted"). */
export interface ReviewPair {
  readonly skills: readonly [string, string];
  /** Joint uses this session (repeats not counted). */
  readonly session: number;
  /** Joint uses in the whole log, which the merge alert counts. */
  readonly total: number;
  /** Joint uses a merge needs (rules). */
  readonly needed: number;
}

/** A skill with the marks for its next rarity that the grade allows now. */
export interface UpgradePrompt {
  readonly skill: string;
  readonly rarity: string;
  readonly next: string;
  readonly marks: number;
  readonly needed: number;
}

/** One character's part of the review. */
export interface CharacterMarksReview {
  readonly characterId: string;
  readonly name: string;
  /** Skills used this session, most used first (ties in skill order). */
  readonly used: readonly MarkCandidate[];
  /** Owned skills not logged this session (a mark can still be confirmed). */
  readonly unused: readonly MarkCandidate[];
  readonly upgrades: readonly UpgradePrompt[];
  /** Skills holding enough marks but at the grade ceiling (they bank). */
  readonly banked: readonly MarkCandidate[];
  readonly pairs: readonly ReviewPair[];
  /** Skill names logged this session that the character no longer has (merged, transformed). */
  readonly lost: readonly string[];
}

/**
 * The marks review for one play session, a section per character in party
 * order. Practice entries count when they were logged in that session.
 * Logged skill names the character no longer owns (merged, transformed) are
 * left out: a mark needs a skill to land on.
 */
export function marksReview(state: CampaignState, sessionId: string): CharacterMarksReview[] {
  const rules = state.rules;
  const session = state.practice.filter((e) => e.sessionId === sessionId);
  const repeated = repeatedEntryIds(session);
  const max = rules.skills.maxMarksPerSkillPerSession;
  return state.characterOrder.flatMap((id) => {
    const character = state.characters[id];
    if (!character) return [];
    const mine = session.filter((e) => e.characterId === id);
    const candidates = character.skills.map((skill, order) => {
      const entries = mine
        .filter((e) => e.skills.includes(skill.name))
        .map((e) => ({
          id: e.id,
          action: e.action,
          source: e.source,
          repeated: repeated.has(e.id),
        }));
      const needed = marksToUpgrade(rules, skill);
      const done = skill.markSessions.filter((s) => s === sessionId).length >= max;
      const status: MarkStatus = needed === null ? 'noUpgrade' : done ? 'marked' : 'eligible';
      const candidate: MarkCandidate = {
        skill: skill.name,
        rarity: skill.rarity,
        uses: entries.length,
        entries,
        marks: skill.marks,
        needed,
        status,
        banks: needed !== null && atCeiling(rules, character, skill),
        montage: entries.some((e) => e.source === 'montage'),
      };
      return { candidate, order };
    });
    const used = candidates
      .filter((c) => c.candidate.uses > 0)
      .sort((a, b) => b.candidate.uses - a.candidate.uses || a.order - b.order)
      .map((c) => c.candidate);
    const unused = candidates.filter((c) => c.candidate.uses === 0).map((c) => c.candidate);
    const upgrades: UpgradePrompt[] = character.skills.flatMap((skill) => {
      if (!canUpgrade(rules, character, skill)) return [];
      const at = rules.skills.rarities.findIndex((r) => r.id === skill.rarity);
      const next = rules.skills.rarities[at + 1];
      const needed = marksToUpgrade(rules, skill);
      if (!next || needed === null) return [];
      return [
        { skill: skill.name, rarity: skill.rarity, next: next.id, marks: skill.marks, needed },
      ];
    });
    const banked = candidates
      .map((c) => c.candidate)
      .filter((c) => c.banks && c.needed !== null && c.marks >= c.needed);
    const owned = new Set(character.skills.map((k) => k.name));
    const lost = [...new Set(mine.flatMap((e) => e.skills))].filter((n) => !owned.has(n));
    const totals = skillPairCounts(state.practice, id);
    const pairs = skillPairCounts(session, id)
      .filter((p) => owned.has(p.skills[0]) && owned.has(p.skills[1]))
      .map((p) => ({
        skills: p.skills,
        session: p.count,
        total:
          totals.find((t) => t.skills[0] === p.skills[0] && t.skills[1] === p.skills[1])?.count ??
          p.count,
        needed: rules.skills.merge.requiredJointUses,
      }));
    return [{ characterId: id, name: character.name, used, unused, upgrades, banked, pairs, lost }];
  });
}

/**
 * The session the review opens on: the running one, else the latest ended
 * one, else null (no session has been played).
 */
export function reviewSessionId(state: CampaignState): string | null {
  return state.currentSession ?? state.sessions.at(-1)?.id ?? null;
}
