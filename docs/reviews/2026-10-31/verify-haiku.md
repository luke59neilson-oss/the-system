# Verification: rules findings rules-1, rules-2, rules-4 (origin/main f656f8c2)

Independent verifier pass. Test file kept: `packages/engine/test/zzVerify.test.ts` (6 tests, all pass; they assert the reported behaviour and log `VERIFY` lines). Run with `npx vitest run packages/engine/test/zzVerify.test.ts --silent=false --reporter=verbose`, since the vitest config hides console output by default. Probes were read for setup only; nothing committed or pushed.

## rules-1: GM merge consumes Identify, and re-grant is refused

**Verdict: CONFIRMED** for all four sub-claims (a) to (d).

Tests (describe > it):
- `rules-1: GM merge consumes Identify > path A: setRarity (GM re-rate) then merge; candidates, accept, rarity, re-grant`
- `rules-1: GM merge consumes Identify > path B: marks and upgrades (normal play) then merge; same four checks`
- `rules-1 repair path: undo of the accept > undoing the accept restores Identify while nothing later depends on the merge`
- `rules-1 repair path: undo of the accept > undo of the accept is refused once a later event uses the merged skill`

Output lines:
```
VERIFY rules-1 A candidates [{"skills":["Archer’s Eye","Identify"],"count":3,"unreviewed":0,"rarity":"rare","problem":null}]
VERIFY rules-1 A dashboard merge flags 1
VERIFY rules-1 A skills after accept [["Basic Archery","inferior","class"],["Basic Stealth","inferior","class"],["Hunter’s Appraisal","rare","class"]]
VERIFY rules-1 A identify rarity after null
VERIFY rules-1 A regrant "Event v10 (skill.granted): \"Identify\" was a skill of Jake's; pick a new name"
VERIFY rules-1 B identify rarity before merge "uncommon"
VERIFY rules-1 B candidates [{"skills":["Archer’s Eye","Identify"],"count":3,"unreviewed":3,"rarity":"rare","problem":null}]
VERIFY rules-1 B regrant "Event v28 (skill.granted): \"Identify\" was a skill of Jake's; pick a new name"
VERIFY rules-1 repair undo accept "uncommon"
VERIFY rules-1 repair undo after later mark "Event v49 (event.undone): cannot undo v47 (skill.mergeAnswered) because a later event depends on it: Event v48 (skill.markAwarded): Jake has no skill \"Hunter’s Appraisal\""
```

Mapping: (a) the builder and the dashboard offer the Identify pair with `problem: null`, and a merge flag is raised; (b) Identify is absent after accept (I tested Archer's Eye first, so the merged skill is class kind; `mergeSkills` removes both originals in either order, so Identify goes either way); (c) `identifyRarity` is null; (d) `skill.grant` Identify is refused with the retired-name message.

Repair: undoing the accept does restore Identify, but the undo is refused as soon as any later event touches the merged skill (here a mark). In practice that is a short window.

**Severity: High (adjust up from Medium).** Reason: the app itself recommends the pair as a Rare merge with no problem, so this is a normal-play trap, not a GM slip. The loss is silent and the only repair is an undo that the engine refuses once play has moved on. It also contradicts DESIGN §6 "Identify never drops", and the team's own D209 review round 1 closed this same hole for evolutions only (`checkRaceSkillsKept`), leaving the standalone merge path open.

**Acceptance check (testable):**
1. In the path-A setup (Identify uncommon, Archer's Eye uncommon, 3 joint uses), `mergeCandidates(state, 'jake')` has no entry containing Identify with `problem: null`, and `characterFlags` raises no merge flag naming Identify.
2. `execute` of `skill.merge` with `['Archer’s Eye','Identify']` (GM, no override) returns `ok: false` with a message naming Identify, and appends no `skill.mergeOffered`.
3. If a GM override may consume Identify, then `skill.grant {name:'Identify', kind:'race'}` must succeed after that merge is accepted (so `identifyRarity` can be restored). Otherwise the override must be refused. No reachable state may have Identify missing with re-grant refused.
4. Existing merge and MT.1 evolution-refusal tests stay green.

---

## rules-2: undoing an earlier evolution.chosen silently drops later XP

**Verdict: CONFIRMED.**

Test: `rules-2: undoing an earlier evolution.chosen after a later XP award > levels and XP before and after the undo; re-evolve`

Output lines:
```
VERIFY rules-2 after G award {"grade":"G","cl":4,"pl":0,"xp":{"class":0,"profession":0}}
VERIFY rules-2 after evolve {"grade":"F","cl":4,"pl":0,"xp":{"class":0,"profession":0}}
VERIFY rules-2 before undo {"grade":"F","cl":7,"pl":0,"xp":{"class":0,"profession":0}}
VERIFY rules-2 undo result {"grade":"G","cl":4,"pl":0,"xp":{"class":0,"profession":0}}
VERIFY rules-2 after undo {"grade":"G","cl":4,"pl":0,"xp":{"class":0,"profession":0}}
VERIFY rules-2 after re-evolve {"grade":"F","cl":4,"pl":0,"xp":{"class":0,"profession":0}}
```

The undo returns ok with no warning. The 900 XP (three F-grade levels) is gone: class level falls 7 to 4 and nothing is held. Note that `previewXpShares` warns about lost XP at award time (DESIGN §2), but nothing warns at undo time. The precedent is D31: "rejecting turns [a silent change of meaning] into a refused undo".

**Severity: Medium (agree).** Reason: a routine GM correction silently destroys three levels of progression, and the GM must know to repair it with a manual override. The fix is local.

**Acceptance check (testable):**
1. In the sequence above (G award 400, evolve to F, award 900, undo `evolution.chosen`), `execute` of `event.undo` either returns `ok: false` with an error naming the loss (class level 7 to 4, or the 900 XP), leaving the campaign unchanged, or requires an explicit override or confirmation flag that the ChangeLog confirm surfaces with the diff.
2. Undoing a non-latest event that changes no progression (e.g. an earlier `practice.log`, or an `xp.award` that stays fully applied) still succeeds.
3. Existing undo and replay tests (including the 30-seed fuzz replay == incremental check) stay green.

---

## rules-4: override summary prices skipped points by level range, not grade

**Verdict: CONFIRMED** (text only).

Test: `rules-4: override summary prices skipped points by level range, not grade > E-grade character at class 4 raised to 10: summary vs what the engine grants`

Output lines:
```
VERIFY rules-4 summary skips ["30 class spread points (base stats stay as they are)","No skills are granted: the selections at class level 5 and 10 become due, for you to offer as usual","18 free points (no new batches to assign)"]
VERIFY rules-4 engine grants at E for 4->10 {"classLevel":10,"spread":48,"fp":24}
```

The summary uses `gradeOfLevel` (F for levels 5 to 10: 6 × 5 = 30 spread, 6 × 3 = 18 points). The engine uses the character's E grade (6 × 8 = 48 spread, 6 × 4 = 24 points).

**Severity: Low (agree).** Text only, no state impact.

**Acceptance check (testable):**
1. For an E-grade character at class 4 raised to 10, `progressionOverrideSummary` skips include "48 class spread points" and "24 free points", equal to the `xp.award` result (spread 48, fp 24).
2. Regression guard: a same-override grade change (G at class 4 to F at class 10) prices at F (30 and 18), matching the award.

---

## Not verified
- rules-3, rules-5, and the Low skill.cast undo sub-item of rules-2 (out of scope for this pass).
- Whether the merge order (Identify first) changes the merged skill's kind; only Archer's Eye-first was run.
