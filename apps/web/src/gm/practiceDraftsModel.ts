import type { CampaignState, Command } from '@the-system/engine';

/** A co-DM practice draft as the server lists it (MC.7; GM-only). */
export interface PracticeDraft {
  readonly id: string;
  readonly characterId: string;
  readonly skill: string;
  readonly action: string;
  readonly quote: string;
  readonly at: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly attributedBy: 'gm-named' | 'voice' | 'model';
}

/** Tag on practice the GM confirmed from a co-DM draft. */
export const CO_DM_TAG = 'co-dm';
/** Tag on practice logged by a contest roll in the app (MC.7). */
export const CONTEST_TAG = 'contest';

/** Confirming a draft is an ordinary GM practice entry for that skill. */
export const draftCommand = (d: PracticeDraft): Command => ({
  type: 'practice.log',
  characterId: d.characterId,
  action: d.action,
  skills: [d.skill],
  tags: [CO_DM_TAG],
  source: 'gm',
});

/** The character's current name, or the id when they are gone. */
export const draftWho = (state: CampaignState, d: PracticeDraft): string =>
  Object.hasOwn(state.characters, d.characterId)
    ? (state.characters[d.characterId]?.name ?? d.characterId)
    : d.characterId;

/** One contest side as the encounter roller holds it. */
export interface ContestSideRef {
  /** `c:<characterId>` for a character; anything else is not one. */
  readonly source: string;
  readonly stat: string;
  readonly label: string;
}

/**
 * MC.7: a contest rolled in the app logs practice directly for each
 * character in it (the stat it rolled), so the co-DM never drafts it again.
 */
export function contestPracticeCommands(
  state: CampaignState,
  a: ContestSideRef,
  b: ContestSideRef,
): Command[] {
  const statName = (id: string) => state.rules.stats.list.find((s) => s.id === id)?.name ?? id;
  const out: Command[] = [];
  for (const [me, them] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!me.source.startsWith('c:')) continue;
    const characterId = me.source.slice(2);
    // A practice entry names a skill or a stat; a side with no stat logs none.
    if (!Object.hasOwn(state.characters, characterId) || me.stat === '') continue;
    const stat = me.stat;
    out.push({
      type: 'practice.log',
      characterId,
      action: `Contest roll against ${them.label.trim() || 'an opponent'} (${statName(stat)})`,
      stat,
      tags: [CONTEST_TAG],
      source: 'gm',
    });
  }
  return out;
}
