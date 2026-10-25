import { describe, it } from 'vitest';

/**
 * MT.2 (DESIGN §6 Merges, Q62): a merge the GM sends arrives on the player's
 * screen as an offer; accepting applies it, declining keeps both originals;
 * the GM sees the answer. Work in progress (run 60adeaa2): these are the
 * acceptance tests to write first. Planned shape:
 * - GM `skill.merge` now emits `skill.mergeOffered {characterId, skills, name}`
 *   (checked by `mergeSkills` on a copy, so a bad offer is refused at send).
 * - Player `skill.answerMerge {characterId, offerId, accept}` emits
 *   `skill.merged` (with `offerId`) on accept, `skill.mergeDeclined` on decline.
 * - Stale: the offer is refused if either skill is gone or changed rarity, or
 *   a newer offer replaced it. Stored `skill.merged` events without `offerId`
 *   replay as before (GM-applied merges).
 * - Projection: the owner sees the pending offer; nobody else does; the GM
 *   sees accepted/declined in the change log and on the merge builder.
 */
describe('players accept or decline merges (MT.2)', () => {
  it.todo('the GM sends a merge: it is pending on the owner, not applied');
  it.todo('accepting applies the merge (originals consumed, marks 0)');
  it.todo('declining keeps both originals; the GM sees the answer');
  it.todo('a stale offer (skill changed or replaced) is refused');
  it.todo('stored skill.merged events replay unchanged');
});
