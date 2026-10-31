# Mutation testing sweep — can the tests catch bugs?

Worktree `/home/claude/review/mutation` (detached at origin/main f656f8c2). No Stryker;
a small runner (`mutation-runner.mjs`) scans a module for mutation sites (comparison
flips, `&&`/`||` swaps, negated or removed `if` guards, boolean/`??`-default flips,
off-by-one on literals in conditions, `.filter/.some/.every` predicates forced true,
`Math.floor/ceil/max/min` swaps, dropped allow-list items, dropped `break`/`continue`),
samples one mutant per line round-robin across operator families (guards and filters
first), writes the mutant, runs the module's relevant vitest files, records
killed/survived/timeout, and restores the file with `git checkout --`. Survivors of
the hard-rule modules were re-run against the whole engine suite or a wider set
(`mutation-verify.sh`) before being called gaps.

Artifacts (all untracked, worktree otherwise clean):
- runner: `/home/claude/review/mutation/mutation-runner.mjs`
- raw results: `/home/claude/review/mutation/mutation-log.jsonl`
- run logs: `/home/claude/review/mutation/mutation-run-{A,B,A2,B2,C}.log`
- summary script: `/home/claude/review/mutation/mutation-summary.py`
- survivor re-verification: `/home/claude/review/mutation/mutation-verify.sh`, `mutation-verify.log`

Caveats on method (honest accounting):
- The box had 2 CPUs shared with Playwright and fuzzing runs from other reviewers
  (load ≈ 6–8), so test runs took 10–80 s each and the campaign had to be cut from the
  planned ~200 mutants to **112 distinct mutants** across 14 modules.
- Two campaigns were briefly run in parallel in the same worktree; a `log.ts` mutant
  from one broke the other's baselines (gmChanges/xp/override/evolution/skills were
  skipped and rerun later, sequentially). Every "killed" result in the overlap window
  was re-run alone (player L851–L954: all genuinely killed). One library result
  (`library.ts:251 || -> &&`) was a false survivor from that interference; a hand re-run
  fails 16 tests, so it is counted as killed below.
- Mutants were run against the test files that exercise the module, not the whole
  suite; a survivor is only reported as a gap after a wider run confirmed it.

## Results

Counts after re-verification (`mutation-verify.log`): a survivor that a wider run
kills is counted as killed and listed under "covered only outside the module's spec".

| module | file | mutants | killed | survived (non-equivalent) | equivalent | kill rate (excl. equivalent) |
|---|---|---|---|---|---|---|
| player projection | `packages/engine/src/projection/player.ts` | 22 | 18 | 2 (L775, L974) | 2 | 90% |
| GM-change notices | `packages/engine/src/history/gmChanges.ts` | 8 | 5 | 2 (L295, L400) | 1 | 71% |
| cast / authorize / region refs | `packages/engine/src/events/commands.ts` L834–935 | 8 | 7 | 1 (L859, not re-run) | 0 | 88% |
| XP | `packages/engine/src/progression/xp.ts` | 6 | 6 | 0 | 0 | 100% |
| evolution | `packages/engine/src/evolution/model.ts` | 6 | 3 | 3 (L600, L734, L968) | 0 | 50% |
| skills / merges | `packages/engine/src/skills/model.ts` | 6 | 4 | 2 (L22, L129) | 0 | 67% |
| skill library / casting | `packages/engine/src/skills/library.ts` | 8 | 7 | 0 | 1 | 100% |
| bonuses | `packages/engine/src/bonuses/effective.ts` | 8 | 8 | 0 | 0 | 100% |
| event log replay/undo | `packages/engine/src/events/log.ts` | 6 | 6 | 0 | 0 | 100% |
| reducer (writesPool, skill.cast) | `packages/engine/src/events/reducer.ts` | 6 | 1 | 1 (L1711, defence in depth) + 2 not re-run (L700, L702) | 2 | — |
| server store | `apps/server/src/store.ts` | 6 | 5 | 1 (L377) | 0 | 83% |
| hub (filtering, rate limit) | `apps/server/src/hub.ts` | 8 | 5 | 0 | 3 | 100% |
| GM authority / security | `apps/server/src/security.ts` | 8 | 6 | 1 (L65) | 1 | 86% |
| co-DM quick responses / lore | `apps/server/src/ai/quickResponses.ts` | 6 | 5 | 1 (L82) | 0 | 83% |
| **total** | | **112** | **86** | **14** (+3 not re-run) | **10** | **≈ 86%** |

Covered only outside the module's own spec (killed on a wider run, so not gaps in the
suite, but worth a local assertion): `gmChanges.ts:365` holders filter (killed by
`m6a.test.ts`), `gmChanges.ts:500` hidden-quest guard (one test elsewhere in the engine
suite), `reducer.ts:693` writesPool (killed by `pools.test.ts`/`noHunger.test.ts`),
`commands.ts:852` regionRef (killed by `trackers.test.ts`), `hub.ts:121/124` refill and
burst (killed by `limits.test.ts`), `library.ts:251` (interference; 16 failures alone).

What the tests catch well: every player-projection allow-list filter mutated
(journal/GM notes, hidden quests, montages, entities, trades, ledger, other players'
practice, party list, scene prompt), the GM key check and GM/player authority
(`authorize`, `gmKeyMatches`, hub join, View-as read-only), every undo-integrity
guard in `log.ts` (undo-of-undo, migration, duplicate ids, latest-first lookup), and
all XP and bonus arithmetic sampled. No surviving mutant puts GM-only data into a
player projection or weakens GM authority.

## Findings (most severe first)

### mutation-1 — Medium — a one-field progression override tells the player nothing (survives the whole engine suite)
- `packages/engine/src/history/gmChanges.ts:295` — `if (diffs.length > 0) push(...)` → `diffs.length > 1`
- Behaviour: a GM `character.setProgression` that changes exactly one value (the common
  "set class level 7" or "set class XP") produces no `gmChange: progression` notice;
  multi-field sets still do. Full engine suite: 927/927 pass with the mutant.
- Should have been caught by: `packages/engine/test/playerLog.test.ts` — its
  `character.progressionSet` row uses `atTopOfG[0]`, a grade+level+XP change — and
  `progressionOverride.test.ts`, which checks state but not notices.
- Test to add: `character.setProgression` changing only `classLevel`; assert exactly one
  notice `{kind:'gmChange', change:'progression', diffs:[{label:'Class level', from, to}]}`
  for that character and none for others.

### mutation-2 — Medium — another character's practice hides this player's passed-over option (survives the whole engine suite)
- `packages/engine/src/projection/player.ts:775` — `state.practice.filter((e) => e.characterId === c.id)` → predicate forced true
- Behaviour: `practiced()` feeds `retiredSkillNames` for the owner's
  `selections[].passedOver`. With the filter gone, every practice entry in the campaign
  counts, so a passed-over option sharing a name with a skill *someone else* practised
  vanishes from this player's list (D64: only their own retired names count). The GM's
  own projection is unaffected, so GM and player would disagree about the menu.
- Should have been caught by: `projection.test.ts` / `evolution.test.ts` — every
  passed-over test uses a single character.
- Test to add: two characters; B logs practice naming "X"; A has unpicked option "X" on
  an earlier chosen menu; `projectForPlayer(state, A).me.selections[n].passedOver`
  still lists "X"; after A loses and practises "X" it is gone.

### mutation-3 — Medium — `marksToUpgrade` ignores "no next rarity / reserved next"
- `packages/engine/src/skills/model.ts:129` — `needed === undefined || !next || next.reserved` → `&&`
- Behaviour: a skill at the top rarity (or below a reserved one) reports
  `marksNeeded = needed` (or `undefined`, which JSON drops from the player sheet) instead
  of `null`; `nextRarity`/`atCeiling` and the upgrade affordance disagree, and with
  `markUpgrades` naming the last rarity `canUpgrade`/`upgradeSkill` step past the ladder.
  Survived `skills`, `mergeOffer`, `mergeBuilder`, `marksReset`, `marksReview`,
  `skillSetRarity` specs (not re-run against the full suite).
- Test to add (skills.test.ts): rules whose `markUpgrades` names the last rarity; a skill
  there → `marksToUpgrade` is `null`, `awardMark` at the threshold does not upgrade, the
  player sheet shows `marksNeeded: null, nextRarity: null`.

### mutation-4 — Medium — equipping an item also sends a bogus "skill granted" notice
- `packages/engine/src/history/gmChanges.ts:400` — the `break;` after the
  `item.equipped`/`item.unequipped` case removed (fall-through into `skill.granted`)
- Behaviour: every GM equip/unequip pushes a second notice
  `{change:'skillGranted', subject: undefined, detail: rarityName(undefined)}` to the
  player. Survived `playerLog`, `history` and `economy` specs: the audit table checks
  that a notice reaches the character, not the exact list.
- Test to add: make the `playerLog.test.ts` audit rows assert the *exact* notice array
  (one `equipped` notice, nothing else) rather than "contains one for jake".

### mutation-5 — Medium/Low — evolution transform naming vs. selection menus is untested
- `packages/engine/src/evolution/model.ts:600` — `menu.chosen === null && menu.options.some(...)` → `||`
- Behaviour: the "name is on a pending menu" refusal fires for chosen menus too and for
  any pending menu, so a re-rated release whose transform name ever appeared on a menu
  (or while any menu is pending) is refused. Survived `evolution`, `rerate`,
  `rerateApproval`, `simulation`.
- Test to add (rerate.test.ts): chosen menu holding unpicked "Ember", no pending menu →
  release with transform "Ember" succeeds; with a pending menu listing "Ember" → refused
  with the "pending level N menu" message.

### mutation-6 — Low — single-stat evolution bonus is dropped
- `packages/engine/src/evolution/model.ts:968` — `entries.length === 0` → `=== 1`
- Behaviour: an evolution option whose `statBonus` has one positive stat applies nothing.
- Test to add (evolution.test.ts): option `statBonus: { strength: 2 }` → strength +2.

### mutation-7 — Low — blank profession names accepted on release
- `packages/engine/src/evolution/model.ts:734` — guard `trimmed.some((p) => p === '')` removed
- Test to add: `evolution.release` with `professions: [' ']` refused ("A profession needs a name").

### mutation-8 — Low — first-run campaign listing throws
- `apps/server/src/store.ts:377` — `if (!existsSync(dir)) return [];` removed
- Behaviour: `CampaignStore.list()` throws ENOENT before `campaigns/` exists (fresh data
  dir), so the join page / launcher fails on first run. Survived `store`, `app`, `recovery`.
- Test to add (store.test.ts): `CampaignStore.list(emptyTmpDir)` → `[]`.

### mutation-9 — Low — Host check rejects a valid IPv4 with a 255 octet
- `apps/server/src/security.ts:65` — `Number(n) <= 255` → `< 255`
- Behaviour: `isAllowedHost('192.168.1.255:30333')` is false (bad Host on every request
  for that LAN address); 256 is still refused. Survived `security` and `app` specs.
- Test to add: `'10.0.255.7'` allowed, `'10.0.256.7'` refused.

### mutation-10 — Low — unknown rarity no longer refused in skill helpers
- `packages/engine/src/skills/model.ts:22` — `index === -1` → `index === -2`
- Behaviour: `rarityIndex` returns -1 instead of throwing; `setSkillRarity`,
  `mergeSkills` (bad `minRarity`), `atCeiling` compute with -1.
- Test to add: `setSkillRarity(rules, c, 'Bolt', 'mythic')` throws `Unknown rarity "mythic"`.

### mutation-11 — Low — blank transcript line counts as a question
- `apps/server/src/ai/quickResponses.ts:82` — `if (text === '') return false;` → `true`
- Test to add: a trailing whitespace-only line is skipped by `findTarget`.

### mutation-12 — Low — replay-time cast check is only covered through the command layer
- `packages/engine/src/events/reducer.ts:1711` — `s.name === skill` → `!==` in `skill.cast`
- Behaviour: the reducer's "has no skill" check is disabled whenever the character has two
  or more skills; `castPayload` refuses first, so only a hand-written or tampered log is
  affected. Survived `cast`, `events`, `snapshot`.
- Test to add (cast.test.ts): `replay()` of a hand-built `skill.cast` event naming a skill
  the character lacks is rejected.

### mutation-13 — Low — degenerate stability range gives `NaN`
- `packages/engine/src/projection/player.ts:974` — `!(max > min)` → `!(max >= min)`
- Behaviour: with `rules.stability.min === max`, `stabilityPercent` is `NaN` instead of 100.
- Test to add (quests.test.ts): one assertion with `min === max`.

Not re-run (time): `commands.ts:859` (`matches.length !== 1` → `!== 2`, ambiguous region
names; `trackers.test.ts` killed its sibling L852 so it is probably covered),
`reducer.ts:700/702` (siblings of L693, which `pools.test.ts` kills).

### Equivalent survivors (no action)
`player.ts:694/829` (`?? 0`; `clampPools` fills every pool), `hub.ts:287/349/359`
(states unreachable after a successful join), `security.ts:94` (one `||` flipped;
precedence keeps the behaviour), `library.ts:172`, `gmChanges.ts:306`,
`reducer.ts:1718` (error label) and `:1720`.

## Recommendations
1. Make the `playerLog.test.ts` audit table assert the exact notice list per event with
   a two-character fixture (fixes mutation-1 and -4, and would also have pinned
   `gmChanges.ts:365/500` locally).
2. Add the multi-character passed-over projection test (mutation-2) and the top-rarity
   `marksToUpgrade` test (mutation-3).
3. Keep `mutation-runner.mjs` as a weekly job on the hard-rule modules
   (`projection/player.ts`, `history/gmChanges.ts`, `events/log.ts`, `hub.ts`,
   `security.ts`): ~60 mutants run in a few minutes on an idle box. Run it alone in
   its worktree; two campaigns in one checkout corrupt each other's baselines.
