# Rules-engine review — origin/main f656f8c2 (worktree /home/claude/review/rules)

Lens: rules-engine correctness, feature interactions (MT, MD/MU engine parts, cross-cutting replay/undo/snapshots).
Probes live in the worktree: `packages/engine/test/probe-rules.test.ts` (scenario probes, output to /tmp/probe.log) and
`packages/engine/test/probe-fuzz.test.ts` (30 seeds × 400 random progression commands incl. undo: replay == incremental,
snapshot resume == incremental, pool/XP/level/batch/selection invariants — all clean).

## Findings (most severe first)

### rules-1 · Medium (borderline High) · a GM merge consumes Identify, and the engine then refuses to give it back
- **Where:** `packages/engine/src/skills/model.ts:271-334` (`mergeSkills` has no race-skill check; the merged skill takes `a.kind`, so Identify as the *second* skill becomes a `class` skill under a new name), `packages/engine/src/skills/mergeBuilder.ts:30-54` and `packages/engine/src/dashboard/index.ts:85-95` (both recommend the pair), `packages/engine/src/evolution/model.ts:535-547` (the evolution path *does* refuse merging a race skill away, MT.1 round 1), `packages/engine/src/evolution/model.ts:187-201` (`checkFreeName` refuses a retired name, so `skill.grant Identify` is refused afterwards).
- **What is wrong:** DESIGN §6 "Identify never drops" and D209 made the evolution builder refuse any option that merges a race skill away or renames it. The standalone merge (Merges window, dashboard "merge" flag, `skill.merge` → player accept) has no such check. Once accepted, `identifyRarity` finds nothing (it looks for the race skill by the rules' starting-skill name), so every Identify tier goes dark for that character, and the usual repair `skill.grant {name:'Identify', kind:'race'}` is refused because the name is in the practice log ("was a skill of Jake's; pick a new name"); GM-OVERRIDES.md lists that refusal as "fix the input". Only an undo of the accept (while nothing later depends on it) repairs it.
- **Scenario (normal play):** Identify reaches Uncommon by marks (4 marks, "I identify it" is logged often) or a re-rate raise; the player logs Identify + Archer's Eye together 3 times ("sized up the beast"); the Merges window and the home dashboard show the pair as mergeable (Rare); the GM sends it, the player accepts. Identify is gone for good.
- **Evidence:** `npx vitest run packages/engine/test/probe-rules.test.ts` → /tmp/probe.log:
  `merge candidates [{"skills":["Archer’s Eye","Identify"],"count":3,…,"rarity":"rare","problem":null}]`,
  `skills after [["Basic Archery","inferior","class"],["Basic Stealth","inferior","class"],["Hunter’s Appraisal","rare","class"]]`,
  `identify rarity after null`, `regrant "… \"Identify\" was a skill of Jake's; pick a new name"`.
- **Fix direction:** in `mergeSkills` refuse a `kind: 'race'` skill on either side unless `override` (mirrors `checkRaceSkillsKept`); the builder and dashboard then filter it automatically. Also let a race-kind `skill.grant` of the rules' starting race skill name bypass the retired-name check (or add a GM override flag to `skill.grant`), so Identify can always be restored.
- **Confidence:** certain (reproduced through the marks path and the override path).

### rules-2 · Medium · a non-latest undo silently discards XP that later awards delivered (evolution undone → later awards hit the old cap and overflow to nothing)
- **Where:** `packages/engine/src/events/log.ts:109-133` (`appendEvent` undo path refolds and only refuses when a later event *rejects*; an `xp.awarded` that now loses everything still applies), `apps/web/src/gm/ChangeLog.tsx:282` (the confirm shows no consequence).
- **What is wrong:** D27 fold semantics plus MQ.11 "no banking" means an undo that lowers a character's cap state (undo `evolution.chosen`, undo a `character.progressionSet` that lifted levels, undo `profession.chosen`) makes every later `xp.awarded` for that character re-apply at a capped track, where the XP is *lost* rather than held. The state is valid, so nothing refuses or warns; the GM then re-releases/re-chooses and the levels are simply gone. D71(a) records the milder re-pricing case; this one drops whole awards.
- **Scenario:** Jake evolves G→F; the GM awards 900 XP (F lvl 7); the GM notices the player picked the wrong option and undoes `evolution.chosen` (nothing refuses it); re-releases and the player chooses again: F lvl 4, 0 XP. Three levels vanished with no message.
- **Evidence:** probe "undo of evolution.chosen after an XP award": `before undo {"grade":"F","cl":7,…}` → `after undo evolution {"grade":"G","cl":4,"xp":{"class":0,…}}` → `after re-evolve {"grade":"F","cl":4,"xp":{"class":0,…}}`.
- **Fix direction:** either refuse the undo when a later `xp.awarded` would lose XP it did not lose in the original fold (the D31 approach: turn a silent change into a refused undo), or compute a progression diff (levels/XP per character) between the current state and the refold and show it in the undo confirm ("also changes: Jake class 7 → 4"). Related, same family, Low: undoing a `skill.cast` after a later maximum rise re-fills the pool to the new maximum (60/110 → 110/110; probe "cast, level up, undo cast").
- **Confidence:** certain on behaviour; likely on severity (designed semantics, but a reachable loss with no warning).

### rules-3 · Low · a player's Cast is not an "app action already logged" for co-DM practice drafts
- **Where:** `apps/server/src/ai/practiceRoutes.ts:78-80` (`logged` = this session's practice entries with `source === 'gm'` only).
- **What is wrong:** `skill.cast` logs practice with `source: 'player'`, `tags: ['cast']` (reducer.ts:1722-1734). The drafter only treats GM-source entries as already logged, so when the player says "I cast Arcane Bolt" and taps Cast, the review gets the cast entry *and* a draft for the same use. DESIGN §11: "Things done in the app log practice directly"; D245 "app action first". Marks stay one per skill per session, so no rules outcome changes; the review just doubles up. (The backlog already notes the same gap for montage entries.)
- **Fix direction:** include entries tagged `cast` (and `source === 'montage'`) in `logged`.
- **Confidence:** certain (by code; no probe needed).

### rules-4 · Low · the override warning prices skipped spread/free points by level range, the engine by the character's grade
- **Where:** `packages/engine/src/progression/override.ts:183` and `:222-224` (`gradeOfLevel(rules, l)`), vs `packages/engine/src/progression/xp.ts:308-352` (`currentGrade(rules, character)` for both spread and free points).
- **What is wrong:** After a grade override that leaves a character outside its grade's level range (e.g. E-grade at class 4, which the override allows), the warning says "30 class spread points … 18 free points" for 4 → 10, while the engine would grant 48 / 24 at E-grade for those levels. Text only; no state impact.
- **Evidence:** probe "override summary vs engine": `summary … "30 class spread points", "18 free points"` vs `engine grants at E for 4->10 {"spread":48,"fp":24}`.
- **Fix direction:** price with the target grade's `classSpreadPerLevel` / `freePointsPerRaceLevel` (what `gainXp` will use), or say "at <grade> rates".
- **Confidence:** certain.

### rules-5 · Low · a transform that renames a spell silently loses its Cast
- **Where:** `packages/engine/src/skills/library.ts:225-238` (`castingForSkill` falls back to lower rarities of the *same name* only), `packages/engine/src/evolution/model.ts:833-853`.
- **What is wrong:** An evolution transform "Arcane Bolt → Greater Bolt (Uncommon)" produces a copy with no library entry under the new name, so the player's Cast is refused with "[Greater Bolt] has no cost to cast" until the GM writes an entry. Consistent with "a renamed skill is a new skill", but the evolution builder gives no hint that the renamed skill had a cost, and the practice log is renamed to the new name while the cost is not.
- **Evidence:** probe "cast of a skill pending in an evolution transform rename": `cast renamed "[Greater Bolt] has no cost to cast"`.
- **Fix direction:** builder warning when a transform renames a skill whose entry has a cost ("create a library entry for the new name or the spell cannot be cast"), or carry the old entry's casting as the fallback when no entry exists under the new name.
- **Confidence:** certain.

## Checked and clean
- XP: ×3 per grade from config; tops 4/14/49/99/149/199/240 via `trackCap`/`selectionSlots` (A capstone at 240); overflow class↔profession, both-capped loss, preview == reducer (`previewXpShares` vs `xp.awarded`), largest-remainder shares, grade-gap ⅓/0 with floor, above-level bonus priced at the stored race level; `levelsWorth`/`xpContext` only run after a successful preview.
- GM progression override (MT.5): refuses level > top, XP ≥ per level, XP at the top under overflow, profession values without a profession, no-op; withdraws open menus above the new level; withdraws a released evolution when grade/gate changes; selections become due (D214) and block release as designed; free-point batches keyed by race level never duplicate after a lower-then-relevel; merge offers survive and are re-checked at the new grade/ceiling on accept.
- Evolution re-rating (MT.1): command refuses without approval; import forces approval; race skill cannot be lowered, renamed or merged away at evolution; raises capped at the new ceiling; kept-above-ceiling allowed; stale entries drop (D155, already in Backlog); refill uses effective maxima (titles + items) and ends the no-heal mark; stat bonus before refill.
- Merge offers (MT.2): stale when a rarity changes, a skill is consumed/renamed by a transform, or the per-grade limit/ceiling no longer fits; decline keeps both; an offer crossing an evolution is applied under the new grade's limit (no double-dipping possible).
- Cast (MU.4/5): priced at cast time from the library (replay unchanged after a library edit); refused when the pool is too low or the skill has no cost; cost schema 1..1e6 whole; re-rated copy keeps its text-rarity's cost; a GM raise falls back to the nearest lower entry; undo restores pool and removes the practice entry.
- Hunger removal (MT.3): `hunger.*` events fold as no-ops, `rules.hunger` dropped by rules migration 1→2, state v33 invalidates old snapshots; goldens, noHunger and snapshot suites pass.
- Replay/undo/snapshots: 30-seed fuzz (xp, selections, evolutions with random re-rates/transforms/professions, merges, marks, upgrades, setRarity, override, casts, titles, free points, undo) — replay == incremental after every undo and every 25 steps, snapshot resume == incremental, no pool above its effective max, no XP ≥ per level or XP at a capped track, no level above the cap, no duplicate batch/skill names, pending evolutions always match their target.
- Bonuses: item flats capped at floor(20% base), percentages summed then applied once, half-away rounding, pools floor(10 × effective); no hard-coded rule numbers or rarity/grade ids found in `apps/web/src`.
- Broadcast banners: timed 5 s–24 h, pinned, remove-once; scheduled broadcasts unaffected. Faction reveal toggles only. Credits ledger: own rows only, last 300 campaign-wide (documented).
- `docs/GM-OVERRIDES.md` completeness test passes (line drift already in Backlog).
