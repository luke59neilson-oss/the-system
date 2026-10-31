# Fuzz review: engine (origin/main f656f8c2)

Fuzzer: `/home/claude/review/fuzz/packages/engine/test/zzFuzz.ts` (run with
`npx tsx packages/engine/test/zzFuzz.ts <seedStart> <seedCount> <steps>`; `MSGS=N` prints the top N refusal messages, `DET=1` runs each seed twice and compares the final campaign).
Repros: `/home/claude/review/fuzz/packages/engine/test/zzRepro.ts` (`npx tsx` it).

## Runs

| Seeds | Steps/seed | Commands | Accepted | Refused |
|---|---|---|---|---|
| 100–107 | 600 | 4,800 | 2,773 | 2,027 |
| 400–409 | 600 | 6,000 | 3,504 | 2,496 |
| 900–902 (`DET=1`) | 1,000 | 3,000 | 1,788 | 1,212 |
| 200–201 (`DET=1`) | 500 | 1,000 | 581 | 419 |
| **Total** | | **14,800** | **8,646** | **6,154** |

Earlier tuning runs (about 5,000 more commands) are not counted.

The setup is the same for every seed. It creates a campaign on `DEFAULT_RULES` and runs `library.seedDefaults`. It makes 4 characters from the starter classes and 4 items with flat bonuses. It adds a "ghost" item nobody ever receives (GM sentinel in its name and description), and a cost (spell) on every library skill the characters hold, with owner-only effects sentinels. It also adds a GM-only ghost spell, a title definition and a region with GM notes. The weighted command stream comes from the GM and from players (about 60% as the owning player when the command allows it). It is weighted toward:
- MT.1 evolution release/choose (re-rating maps, transforms, merge transforms, profession offers, override)
- MT.2 merge offer/accept/decline (incl. override and stale offers)
- MT.5 `setProgression`
- MT.6 broadcasts (timed/pinned) and removal, plus scheduled broadcasts with day advance
- MT.8 faction define/edit/reveal
- MT.9 `scene.end` / `scene.answer`
- MD.3 GM lore notes (tagged), journal and party notes
- MU.4/5 `skillDef` costs and `skill.cast`
- XP awards: overflow-size amounts, grade gaps, manual shares, sentinel reasons
- selections, passed-over picks and withdrawals
- marks (incl. override) and upgrades
- items: equip/gift/trade/holdings, currency
- quests (incl. hidden quests with sentinels), entities with GM names and notes
- professions, sessions, clocks and montages, `rules.set` toggles
- undo: 70% the latest event, 30% a random earlier one

After every accepted command the fuzzer checks these invariants:
1. Replay of the JSON log equals the incremental state and undo map. A `resume(snapshotOf(c))` matches every 5 steps, and so does a resume from a snapshot up to 50 steps old.
2. Undoing the latest event is accepted and equals the state before the command. The undo leaves no new sanity violation.
3. Any throw from `execute` or `projectForPlayer` counts as a crash.
4. Sanity:
   - pools are integers in 0..max
   - class and profession levels are ≤ the grade cap, and profession level is 0 without a profession
   - XP is ≥ 0 and below one level's cost under the cap; a capped track holds 0 XP under overflow
   - race level is ≤ the cap; marks are integers ≥ 0; rarities are known; skill names are unique
   - currency is ≥ 0 and inventory counts > 0
   - scene-prompt `pending` lists only real characters
   - a mark upgrade never passes the grade ceiling
   - Identify exists, and is not lower after `evolution.choose` than before it
   - evolution refills every pool
   - pools follow maxima (full stays full, nothing else refills) on XP, stats, gear, titles, free points and the override
5. Sentinel scan of every character's `projectForPlayer` JSON:
   - GM-only sentinels may never appear. They are planted in GM/lore notes, hidden quest title and text (allowed while the quest is visible), unrevealed faction names (allowed once revealed), faction and region notes, entity GM names and notes, ghost item and ghost skill-library effects, XP-award reasons, clock names and stability reasons.
   - Owner-private sentinels may appear only to their owner: journals, practice and montage focus actions, nicknames, ledger reasons, single-recipient broadcasts, evolution and selection option text, merge-offer text, and library effects of skills the viewer does not hold.
   - The text of a scheduled broadcast must not appear before it is sent.
6. Determinism: `DET=1` reruns each seed and compares the final `Campaign` JSON.

**Result:** across all runs there were no crashes, no replay, snapshot or undo mismatches, no undo-latest refusals, no GM-only or other-player data in any player projection, and no nondeterminism. The only invariant that fired was "Identify exists" (fuzz-1). Reading the code around the merge path turned up one related gap (fuzz-2).

## Findings

### fuzz-1 · Medium (borderline High) · an ordinary merge consumes Identify (race skill) for good
*Found independently of `rules.md` rules-1 (same root cause). Recorded here because the fuzzer hit it in every multi-seed run: 6 times over seeds 100–107, 12 over 400–409, 5 over 900–902 and 3 over 200–201. The fuzzer also sends override merges; the repro below uses none.*

```ts
// zzRepro.ts "fuzz-1". Default rules; Jake: Basic Archery, Basic Stealth, Archer's Eye (common)
for (const s of ['S1','S2','S3','S4']) [
  { type: 'session.start', sessionId: s },
  { type: 'skill.awardMark', characterId: 'jake', skill: 'Identify' },
  { type: 'skill.awardMark', characterId: 'jake', skill: 'Archer’s Eye' },
  { type: 'session.end' } ];
{ type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' }      // Common → Uncommon by marks
{ type: 'skill.upgrade', characterId: 'jake', skill: 'Archer’s Eye' }
// 3× practice.log (distinct actions) with skills ['Identify','Archer’s Eye']
{ type: 'skill.merge', characterId: 'jake', skills: ['Archer’s Eye','Identify'], name: 'Hunter’s Gaze', offerId: 'm1' }
{ type: 'skill.answerMerge', characterId: 'jake', offerId: 'm1', accept: true }   // as player jake
```

- **What breaks:** DESIGN §6 says "Identify never drops".
  - Expected: Identify is kept, or the merge is refused.
  - Observed skills: `Basic Archery(inferior,class), Basic Stealth(inferior,class), Hunter’s Gaze(rare,class)`.
  - Observed Identify list: `[{"id":"wolf",…,"text":null}]`. Every Identify tier goes dark for that character, because `identifyRarity` looks the skill up by the race-skill name.
  - `skill.grant` of "Identify" is then refused, because the name is in the practice log (`checkFreeName` history).
- **Cause:** `packages/engine/src/skills/model.ts:271-334`. `mergeSkills` (used by `offerMerge` and `answerMerge`) has no race-skill check. The evolution path does refuse merging a race skill away (`evolution/model.ts:535-547`, `checkRaceSkillsKept`, MT.1 review).
- **Fix direction:** in `mergeSkills`, refuse a `kind: 'race'` skill on either side unless `override`, mirroring `checkRaceSkillsKept`. `mergeCandidates` and the dashboard then stop proposing the pair. Also give `skill.grant` a way to restore the starting race skill.
- **Confidence:** certain (reproduced; first hits at seed 103 step 490, seed 400 step 100 and seed 900 step 302).

### fuzz-2 · Low · a merge may take a retired (merged-away) skill name; selections, grants and evolutions refuse it
```ts
// zzRepro.ts "fuzz-2". Jake's three class skills set to uncommon; 3× practice.log each pair
skill.merge ['Basic Archery','Basic Stealth'] → 'Shadow Shot' (+ player accept)   // Basic Archery retired
skill.grant { name: 'Basic Archery' }  // refused: "Basic Archery" was a skill of Jake's; pick a new name
// next grade (setProgression to F), then:
skill.merge ['Shadow Shot','Archer’s Eye'] → name 'Basic Archery'                  // ACCEPTED
```

- **What breaks:** D63 says practice-log pair counts are keyed by name. That is why `checkFreeName(…, history)` refuses retired names for selections (`offerSelection`), `skill.grant` and evolution transforms. A merged skill that reuses a retired name inherits every old pair count of that name. A later merge with a skill the old one was logged with can then pass the joint-use check with no new practice, which skips the "logged together 3 times" rule.
  - Expected: the same refusal as `skill.grant`.
  - Observed: accepted.
  - The name check in `mergeSkills` does not depend on `override`, so the non-override path is the same.
- **Cause:** `packages/engine/src/skills/model.ts:322-327`. It checks only current skills (`character.skills.some(...)`), not `retiredSkillNames`. The reducer (`events/reducer.ts:1818-1850`) passes no retired set to `offerMerge` or `answerMerge`.
- **Fix direction:** pass `retiredFor(state, character)` into `offerMerge` and `answerMerge`, and call `checkFreeName`, as `grantSkill` and `offerSelection` do.
- **Confidence:** certain that the merge is accepted (reproduced). The inherited-count exploit follows from D63 but was not run end-to-end.

## Checked, not findings
- `0/0` pools (a GM set the stat to 0) are not "full", so a later rise leaves them at 0 (seed 409 step 36: stamina 0/0 → 0/20). This is deliberate: `reducer.ts:636-642` requires `wasMax > 0`.
- Equipped items leave the inventory (`economy/model.ts:161-190`). This is by design, not a holdings mismatch.
- Class name and the chosen profession are visible to the party. Profession offers, evolution and selection text, merge-offer text and library effects stayed owner-only in every run.

## Coverage
- **Accepted at least once in the main runs:**
  - progression and evolution: `xp.award`, `character.setProgression`, `evolution.release`, `evolution.choose` (player and GM), `selection.offer`, `selection.choose`, `selection.withdrawOption`, `freePoints.assign`, `freePoints.override`
  - skills: `skill.merge`, `skill.answerMerge` (accept and decline, player and GM), `skill.awardMark`, `skill.upgrade` (144 in run B), `skill.setRarity`, `skill.grant`, `skill.nickname`, `skill.cast` (player and GM), `skillDef.define`, `skillDef.edit`
  - broadcasts: `system.broadcast` (timed and pinned), `broadcast.remove`, `broadcast.schedule`, `campaign.advanceDay`
  - factions and scenes: `faction.define`, `faction.edit`, `faction.reveal`, `scene.end`, `scene.answer`
  - notes and practice: `note.create` (GM lore, journal, party), `note.edit`, `note.delete`, `practice.log`, `montage.offer`, `montage.focus`
  - economy and titles: `holdings.adjust`, `gift.give`, `item.equip`, `item.unequip`, `item.edit`, `trade.propose`, `trade.accept`, `trade.decline`, `trade.cancel`, `title.award`
  - campaign: quests (`quest.create`, `quest.edit`, `quest.setStatus`, `stability.nudge`), `entity.define`, `entity.reveal`, `character.grantProfession`, sessions, clocks, `rules.set`, `event.undo` (latest and non-latest)
- **Generated but never or rarely accepted:**
  - `profession.withdrawOffer`: never.
  - `profession.choose`: accepted once each in runs A and B (as the player); never in run C. Offers only exist after an E-grade release with professions.
  - `item.define`: only in setup; the random ids collide with those.
- **Not generated at all:** loot tables and rolls, `contest.share`, shops, region edit and `region.setCurrent` after setup, class/race/profession library definitions, `character.setPortrait`, `rules.migrate`, `rules.reset`, `skill.describe`, `skill.useLibraryText`, `skill.setUnique`, `titleDef.edit`, `broadcast.unschedule`, `practice.edit`, `practice.remove`, `practice.review`, `stability.applyAction`, `montage.close`, `clock.remove`, `entity.edit`.
