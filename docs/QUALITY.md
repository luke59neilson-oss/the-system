# Quality sweeps

Per-item reviews (LOOP §6) see one diff at a time. Sweeps (LOOP §10) look
across items, with several models on different lenses, for what those
reviews miss. Decisions: L13 in `docs/DECISIONS.md`. Fixes are queued as QF items in
`docs/ROADMAP.md`.

**Last sweep:** ee438ac1 (2026-10-26, D) · **Next rotation:** A

## Lenses and rotation

Each sweep runs 3 of the 4 lenses, each on a different model, never your
own. The skipped lens runs first next time. Rotate the pairing each sweep
so no model always reviews the same thing:

| Sweep | Rules | Boundaries | Tests | UX |
|---|---|---|---|---|
| A | fable | sonnet | haiku | (skip) |
| B | (skip) | haiku | fable | sonnet |
| C | haiku | (skip) | sonnet | fable |
| D | sonnet | fable | (skip) | haiku |

Then A again. Over four sweeps every model reviews every lens once. If a model is unavailable or is your own, use another of
`fable`, `sonnet`, `haiku`, `opus` that is neither.

### Common rules for every sweep reviewer

Scope: commits `<last sweep SHA>..HEAD` on main, plus the lens's whole area
when the diff is small. Only `[x]` roadmap items are claimed done; a DESIGN
rule whose item is unchecked is a known gap, not a finding. Skip findings
`docs/REVIEW-LOG.md` records as accepted, and anything in the Backlog below.
Review main only. Do not edit, commit or push. To run tests:
`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`, then vitest; never
`playwright install`. Report at most 10 findings, most severe first, fewer if
fewer are real: severity, file:line, what is wrong, a concrete failure
scenario, how to confirm (a test or command), confidence (certain / likely /
guess). Then the areas checked and found clean.

### Rules (packages/engine against DESIGN.md)
Feature interactions across items (evolution + pools + bonuses; selections +
passed-over + professions; XP splits + thresholds; quests + undo/replay);
replay of stored logs with versioned events, upcasters and rules flags;
goldens that really pin behaviour; determinism; rounding and boundary
levels; rule numbers hard-coded instead of from the rules config.
High = wrong outcome in normal play, data loss, crash, a stored campaign
that no longer replays.

### Boundaries (GM-only data, GM authority, input, Electron)
Every path to a player: projections, WebSocket broadcasts, REST endpoints,
error messages, session logs, file/portrait endpoints, the web bundle,
resync paths. GM authority: loopback and GM-key checks, header spoofing, key
leaks. LAN web risks: CORS, WebSocket Origin, CSRF, DNS rebinding. Input:
validation gaps, payload size, path traversal. Electron hardening.
Players picking a character without a password is by design (D3).
High = GM-only data reaches a player in normal use, a player runs GM
commands, remote code execution.

### Tests (can the tests catch bugs?)
Least-covered logic files in server and web; assertions that cannot fail;
missing rejected-input cases; un-awaited async; order-dependent tests;
fixed sleeps in e2e; fixed ports; unseeded property tests; goldens that can
silently regenerate; one or more concrete mutations that no test would
catch. Run the e2e suite with `--workers=4` and every failing test alone
(`-g`): a test that fails alone depends on another test's state.
High = a test guarding a hard rule (no GM data to players,
determinism, replay) cannot actually fail.

### UX (player and GM screens against DESIGN §9)
Open the newest screenshots in `docs/screens/` with the Read tool (1366×768
and 390×844 for player screens) and run the e2e specs if needed. Look for
unreadable text, overflow and clipping on phones, wrong or missing
information against DESIGN §9, metallic grade themes applied wrongly,
missing empty/error/loading states, keyboard and contrast problems,
confusing wording at the table. High = a player or the GM cannot do a core
table action, or the screen shows wrong game data.

## Triage

- Verify every High and Medium yourself before acting (write the failing
  test or trace the code path). Not reproduced → note it below; never fix on
  a reviewer's word alone.
- Confirmed High → fix this run (it outranks the current item), or make it
  the first unchecked item under "QF — Quality fixes" in ROADMAP.md.
- Confirmed Medium → a QF item. Low → Backlog below (M11 hardening sweeps it).

## Sweep log

| Date (UTC) | Scope | Lens · model | High | Medium | Low | Confirmed | Not reproduced | Tokens |
|---|---|---|---|---|---|---|---|---|
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Rules · fable | 1 | 0 | 1 | 1 H (QF.1) | 0 | 381k |
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Boundaries · sonnet | 0 | 2 | 3 | 2 M, one raised to High as a hard-rule leak (QF.2, QF.3) | 0 | 327k |
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Tests · haiku | 0 | 5 | 4 | 4 M (QF.4–QF.7); 1 M lowered to Low (latency checks are acceptance criteria, now QF.8) | 0 | 343k |
| 2026-10-22 21:10 | B, 5e72abe..520f6ce | Boundaries · haiku | 0 | 2 | 0 | 1 M (QF.9: trade probe and item definitions); 1 M is a known gap (`previewXpAward` UI belongs to unchecked M4.6) | 0 | 187k |
| 2026-10-22 21:10 | B, 5e72abe..520f6ce | Tests · fable | 0 | 0 | 5 | 5 L to Backlog (18 engine mutations, 17 caught) | 0 | 233k |
| 2026-10-22 21:10 | B, 5e72abe..520f6ce | UX · sonnet | 0 | 0 | 4 | 2 L to Backlog; 2 already accepted in REVIEW-LOG | 0 | 74k |
| 2026-10-23 03:10 | C, 520f6ce..4cf9f1b | Rules · haiku | 0 | 1 | 2 | 1 M (QF.12: no golden uses the new rules flags) | 0 | 154k |
| 2026-10-23 03:25 | C, 520f6ce..4cf9f1b | Tests · sonnet | 0 | 1 | 6 | 6 L to Backlog; the M (M4.1/M4.2/MQ.13 time out at 4 workers on 2 CPUs) is load, as QF.8 (Flakes) | 1 M | 102k |
| 2026-10-23 03:25 | C, 520f6ce..4cf9f1b | UX · fable | 0 | 0 | 5 | 5 L to Backlog | 0 | 152k |
| 2026-10-23 09:16 | D, 4cf9f1b..34f6f14 | Rules · sonnet | 0 | 2 | 1 | 2 M, both also found by the MR.A review and fixed there (stale re-rating D155; `rerate` golden); L to Backlog | 0 | 99k |
| 2026-10-23 09:16 | D, 4cf9f1b..34f6f14 | Boundaries · fable | 0 | 0 | 1 | L to Backlog (off-lens) | 0 | 166k |
| 2026-10-23 09:16 | D, 4cf9f1b..34f6f14 | UX · haiku | 0 | 0 | 3 | 3 L to Backlog | 0 | 126k |
| 2026-10-23 15:10 | A, 34f6f14..41be1ee | Rules · fable | 0 | 0 | 3 | 3 L to Backlog | 0 | ~115k |
| 2026-10-23 15:10 | A, 34f6f14..41be1ee | Boundaries · sonnet | 0 | 0 | 2 | 2 L to Backlog | 0 | ~90k |
| 2026-10-23 15:10 | A, 34f6f14..41be1ee | Tests · haiku | 0 | 2 | 4 | 2 M confirmed and fixed this run (QF.15); 4 L to Backlog | 0 | 186k |
| 2026-10-23 21:15 | B, 41be1ee..d6fedf8 | Boundaries · haiku | 0 | 0 | 1 | L to Backlog | 0 | ~133k |
| 2026-10-23 21:15 | B, 41be1ee..d6fedf8 | Tests · fable | 0 | 2 | 8 | 2 M confirmed by reading the tests (QF.16); 8 L to Backlog (16 mutations, 3 caught) | 0 | ~189k |
| 2026-10-23 21:15 | B, 41be1ee..d6fedf8 | UX · sonnet | 0 | 1 | 5 | 1 M confirmed in code (QF.17); 5 L to Backlog | 0 | ~121k |
| 2026-10-24 03:08 | C, d6fedf8..3902046 | Rules · haiku | 0 | 0 | 3 | 3 L to Backlog (one rated "High by definition", Low by trigger: whitespace-only title duplicates in a pre-D177 log) | 0 | ~207k |
| 2026-10-24 03:08 | C, d6fedf8..3902046 | Tests · sonnet | 0 | 1 | 6 | 1 M confirmed by mutation (QF.21, fixed this run); 6 L to Backlog | 0 | ~137k |
| 2026-10-24 03:08 | C, d6fedf8..3902046 | UX · fable | 0 | 2 | 7 | 2 M confirmed in code (QF.19, QF.20, fixed this run); 7 L to Backlog | 0 | ~193k |
| 2026-10-24 15:13 | D, 3902046..45da2c5 | Rules · sonnet | 0 | 0 | 1 | 1 L to Backlog | 0 | ~85k |
| 2026-10-24 15:13 | D, 3902046..45da2c5 | Boundaries · fable | 0 | 0 | 2 | 2 L to Backlog (PC-vs-PC contest estimate also asked as Q) | 0 | ~182k |
| 2026-10-24 15:13 | D, 3902046..45da2c5 | UX · haiku | 0 | 0 | 3 | 3 L to Backlog | 0 | ~133k |
| 2026-10-24 21:10 | A, 45da2c5..ee1a405 | Rules · fable | 0 | 0 | 2 | 2 L to Backlog | 0 | ~195k |
| 2026-10-24 21:10 | A, 45da2c5..ee1a405 | Boundaries · sonnet | 0 | 0 | 0 | none | 0 | ~75k |
| 2026-10-24 21:10 | A, 45da2c5..ee1a405 | Tests · haiku | 0 | 3 | 7 | 2 M confirmed by mutation and fixed this run (QF.22); 1 M not a defect (withdrawn options exist only on chosen menus, so the filter is dead for open menus; Low); 7 L to Backlog | 1 M | ~188k |
| 2026-10-25 21:10 | B, ee1a405..ff8a1be1 | Boundaries · haiku | 0 | 0 | 2 | 2 L to Backlog | 0 | n/a |
| 2026-10-25 21:10 | B, ee1a405..ff8a1be1 | Tests · fable | 0 | 1 | 5 | 1 M confirmed by reading the tests (QF.23); 5 L not recorded in detail (the run overran and logged only the counts) | 0 | n/a (46 min) |
| 2026-10-25 21:10 | B, ee1a405..ff8a1be1 | UX · sonnet | 0 | 2 | 6 | 2 M confirmed in code (QF.24, QF.25); 6 L not recorded in detail | 0 | n/a |
| 2026-10-26 03:15 | C, ff8a1be1..e781ac3b | Rules · haiku | 0 | 0 | 1 | 1 L to Backlog | 0 | ~149k |
| 2026-10-26 03:15 | C, ff8a1be1..e781ac3b | Tests · sonnet | 0 | 1 | 3 | 1 M confirmed by the reviewer's mutation (QF.28); 3 L to Backlog (3 e2e fails at 4 workers pass alone: load) | 0 | ~107k |
| 2026-10-26 03:15 | C, ff8a1be1..e781ac3b | UX · fable | 1 | 1 | 5 | 1 H confirmed in CSS and fixed this run (QF.26); 1 M confirmed in code (QF.27); 5 L to Backlog | 0 | ~169k |
| 2026-10-26 09:12 | D, e781ac3b..ee438ac1 | Rules · sonnet | 0 | 1 | 1 | 1 M confirmed in code and fixed this run (QF.29; the region half not real); 1 L to Backlog | 0 | ~90k |
| 2026-10-26 09:12 | D, e781ac3b..ee438ac1 | Boundaries · fable | 0 | 0 | 1 | 1 L to Backlog | 0 | ~165k |
| 2026-10-26 09:12 | D, e781ac3b..ee438ac1 | UX · haiku | 0 | 3 | 6 | 1 M confirmed and fixed this run (QF.30); 1 M lowered to Low (Enter in the loading-text field submits the Generate form: standard form behaviour, the GM is filling that form); 1 M already in Backlog (MC.4 L3, leaving the console mid-generation); 6 L to Backlog | 0 | ~115k |

Pilot notes: every confirmed finding was missed by the per-item reviews
(QF.1 is in MQ.3, reviewed twice the run before). No false alarms. The
reviewers ran 15–20 minutes each in the background.

## Flakes

- 2026-10-26 10:55 · CI `desktop-smoke` red on d3c743c2 (QF.31, web-only change; `test` job green): `apps/desktop/test/desktop.spec.ts:151` cleanup `rmSync(userData)` threw ENOTEMPTY after the forced-kill test (Chromium still writing the profile as it died). Not reproduced (no time this run). Watch for a repeat; a second one becomes a QF item (retry rmSync with `maxRetries`, or wait for the process tree to exit).
- 2026-10-26 10:15 · CI `test` red on 910765fc: `e2e/M2.A.spec.ts:169` (latency, restart test) GM console "Failed to load resource: … 503". Passed here alone (×3) and in the latency project with `--workers=2`. Not a test race this time: the MC.5 Listening panel polled every 2 s while idle, so a request was in flight as the server closed. Fixed by QF.31.
- 2026-10-25 00:20 · CI `test` red on 8006c1b (docs-only close-out commit; green on 0f7eeed just before): `e2e/M8.3.spec.ts:208` keyboard sweep reported 98 elements "never reached by Tab" on the GM console (the first six View-as buttons and everything from data-kb 214 on), so the Tab walk lost its place partway. Passed here alone (17 s) and in its file with `--workers=2`. Flake; watch for a repeat. If it repeats it becomes a QF item (the efficiency auditor's idea: wait for focus to settle after each Tab press instead of reading it at once).
- 2026-10-24 22:44 · CI `desktop-smoke` red on ac1bf1e (M10.A merge): `apps/desktop/test/launch.spec.ts:73` splash screenshot failed with "Protocol error (Page.captureScreenshot): Unable to capture screenshot" while the hand-over was held (QF.14), so the window was still open; 6 other desktop tests passed and the run before (5ac1948) was green. A new mode, not the QF.14 race: watch for a repeat; a second one becomes a QF item (assert the splash without a screenshot, or capture through `BrowserWindow.capturePage`).
- 2026-10-24 22:45 · local full e2e (run a56191db): `e2e/M8.A.spec.ts` G→A climb hit its 180 s timeout while a reviewer ran `npm ci` and the Electron smoke in parallel on this 2-CPU workspace; alone it passes in 25 s. Load, not a bug; watch for a repeat in CI.
- 2026-10-24 02:35 · local full e2e (run 805662911): `e2e/M2.A.spec.ts` restart test failed again on a GM console error "Failed to load resource: … 503 (Service Unavailable)"; passed alone and with `--workers=2`. Second occurrence: now QF.18. Fixed by QF.18 (2026-10-24 13:48): the GM change-log refetch in flight at each stop; the test now waits for it.
- 2026-10-23 19:25 · local full e2e (run 698982a6): `e2e/M2.A.spec.ts` (latency project, restart test) failed once with a GM console error "Failed to load resource: net::ERR_CONNECTION_RESET" while a 2,000-step vitest property run loaded the 2-CPU workspace; passed alone right after. Flake under load; watch for a repeat.
- 2026-10-22 16:55–17:38 · CI on main red four times (5e72abe, d244b21,
  176523f, 6ca3e7e). Not a flake: `e2e/M3.7.spec.ts` "View-as panes" relied
  on the previous test having loaded the demo. It passed locally (1 worker)
  and failed in CI once the repo went public (bigger runners, 2 workers).
  Fixed with one server and demo per test; LOOP §4 now says how to reproduce
  CI's parallelism. (The 18:10 run logged it as a flake: `--repeat-each` on
  one worker always ran the tests in order, so it passed.)
- 2026-10-22 · Under 4 workers on 2 CPUs, `e2e/M3.3.spec.ts` (DING history)
  and `e2e/MS.3.spec.ts` (View-as, live) fail; each passes alone. Load
  sensitivity, see QF.8. The latency specs now run in a serial `latency`
  project after the rest (QF.8, D147).
- 2026-10-22/23 · Full local e2e (1 worker): the newest late spec timed out
  at its first step (MQ.13, MQ.14, then MQ.6 "locks the list at once"), each
  green alone. Not a flake: pages from earlier tests were never closed and
  kept reconnecting to stopped servers. Fixed by QF.10 (full suite 5.4 → 4.1
  min, green).
- 2026-10-23 · Sweep C (Tests): under 4 workers on 2 CPUs `e2e/M4.1.spec.ts`
  ~56, `e2e/M4.2.spec.ts` ~54 and `e2e/MQ.13.spec.ts` ~90 hit the 30 s test
  timeout; each passes alone in about 10 s. Load sensitivity, see QF.8.
- 2026-10-23 · CI `desktop-smoke` red on 0b417f0 and 90d9971: the MS.7
  splash bound (< 1000 ms from process start) measured 1085 and 1020 ms.
  Not our code's time: Electron's own cold start under xvfb on a loaded
  runner. Measured from app-ready instead (D146, QF.8).

- 2026-10-23 06:50 · CI `desktop-smoke` red on f4d07d9 (docs and engine
  only; green on bc42279 just before): `apps/desktop/test/launch.spec.ts:33`
  "page.screenshot: Target page ... has been closed" on the splash, which
  had already handed over to the GM console. A race in the test (it
  screenshots a window that closes by design), not in this diff. If it
  repeats it becomes a QF item: screenshot before the hand-over can happen,
  or assert the splash text without a screenshot. It repeated on ab3f114
  (10:31 UTC): now QF.14.

## Backlog (Lows; M11.5 goes through these)
- Rules (sweep C 2026-10-26): `skill.granted` allows description/flavor up to 4000 characters (`envelope.ts` ~431) while every other skill text field caps at 2000/1000.
- Tests (sweep C): `detectPortrait` WebP branch: removing the `WEBP` marker check fails no test (a RIFF WAVE would pass).
- Tests (sweep C): the sync.test wire canary plants GM-only text in only two places (rules, an XP reason); add faction notes, region names, hidden-quest text.
- Tests (sweep C): `M8.4.spec.ts` 262/347/359 and `M4.7.spec.ts` 107 prove "nothing happened" with fixed `waitForTimeout`.
- UX (sweep C): banner "For" input `min={1}` while the rule is 5 s–24 h (`GmScreen.tsx` ~716).
- UX (sweep C): timed banners show raw seconds left ("7200 s left"); use minutes/hours.
- UX (sweep C): header chip "Remove all" banners has no confirm (each removal undoable, one by one).
- UX (sweep C): `MarksReview.tsx` "Extra mark (override)" looks like a routine control; only a hover title says it breaks the rule.
- UX (sweep C): `SkillOverrides.tsx` Profession kind silently disabled without a profession; same-name profession re-grant (legal since MT.7 round 2) cannot be sent.
- Rules (MT.A review): an approved evolution re-rating list loses entries when a listed skill changes rarity (setRarity, mark upgrade, accepted merge) before the player chooses; the builder says nothing and no re-approval is asked (`evolution/model.ts` dropStaleRerates). Consider a "changed since you approved" note.
- Docs (MT.A review): `docs/GM-OVERRIDES.md` "Where" line numbers drift (e.g. reducer refusals moved ~19 lines after MT.9); `scripts/gm-overrides.test.ts` checks keys only. Regenerate the column or drop line numbers.
- UX/code (MT.A review): `PracticePanel.tsx:34` calls `setHeld` during render; derive it instead.
- UX (MT.A review): `MergeOfferPanel.tsx:59` "This offer no longer fits your skills" also shows when the joint-use count or the once-per-grade limit is the cause; pass the reason.
- UX (QF.25 review): the GM override warning loses focus to the page when a live change (award, undo, other GM window) closes it; Escape does not close it.
- Tests (QF.24 review): no engine/server test that a second character's history lacks another's `mergeOffer` notice (the hub's generic `characterId` filter covers it).
- Boundaries (sweep B 2026-10-25): the GM change log shows unshared private-journal rows as "note written" (no text, but the GM learns a note exists); consider dropping them from the GM view.
- Boundaries (sweep B 2026-10-25): the desktop build sets no Electron fuses (`electronFuses`: RunAsNode off, cookie encryption, ASAR integrity).
- UX (M11.3 review r2): the player Notifications rows are keyed `${seq}-${rows.length - i}` (`PlayerScreen.tsx` Feed), so every new ding remounts every row and focus on an entry revealed by "Show older" falls to the body; key by `seq` if unique. Revealed entries keep `tabindex="-1"` (harmless).
- Perf (M11.3 review): the engine's id index (`events/log.ts` ID_INDEX) is shared per lineage and never pruned; dropped branches leave stale entries (a mismatched hit scans). Fine at table scale.

- M11.2 review round 2 (sonnet): `lostWrites` in `apps/server/src/store.ts` compares the snapshot's post-upcast `eventCount` with raw log lines; harmless while `RAW_EVENT_UPCASTERS` is empty, but a future splitting raw upcaster must compare upcast events instead.
- M11.2 review (sonnet): the outage shows only a small muted "Reconnecting…" beside the title; the sheet, party panel and toasts look live (no dim, no banner). No client heartbeat in `apps/web/src/live.ts`: if the server machine itself loses power, phones see no close event and show "Connected" until TCP times out. Two recoveries in the same millisecond would give the same `events.jsonl.torn-<stamp>` name. Untested shapes: a NUL-filled tail containing a newline (refuses, per D42), a torn or empty `snapshot.json` (recovers; probed by hand).
- Sweep B Tests (fable): `practice.edited` keeping a merged-away skill the entry already names is untested; no rejected-input case for an unknown stat in `practice.edit`; `practice.reviewed` `.min(1)` untested; `marksReview` banked filter, `noUpgrade` status and `used` tie-break unpinned; `jointUsesOf` name sort untested (API-only path); session-log merge phrase and `skillMerge` DING text/filter have no unit test; unreachable reserved-rarity merge branches (`evolution/model.ts` ~511); merged-name clash check case-insensitivity untested.
- Sweep B UX (sonnet): practice review list has no CSS (bullets, text touching OK/Edit); marks review's Confirm buttons sit apart from their skill and evidence; Log practice/Save disabled with no "pick a skill or a stat" hint; GM windows each keep their own character picker; Evolutions bonus grid has no phone breakpoint and no 390px screenshot.
- Sweep B Boundaries (haiku): `THE_SYSTEM_TEST_HOLD_START` hook in `apps/desktop/src/main.ts` ~205 (unpackaged only).
- QF.16 review: no builder test of a mixed-rarity pair that does get a prompt (needs a rule where the result fits the ceiling).
- M6.1 review: Reload discards unsaved edits without asking, and after a save while stale the other GM's value shows only on Reload; the bonus preview ignores the item cap (legend says so); `changedSince` compares JSON (key order); bad Give counts are disabled but unexplained; a new item is not selected after Add; negative bonuses accepted without a hint.

- UX (M5.5 review): practice edits of a deleted character's entries are refused; the To review list is unbounded and not per session (Mark all reviewed caps at 500); the end-of-scene order desyncs if the GM switches character mid-scene and has no cancel; a stale stat shows as "None" in the edit select but is kept; the edit form always sends skills and stat; the e2e does not assert the edited fields or Mark all reviewed.
- UX (M5.4 review): Send merge is two commands; a failed `skill.describe` leaves the merge with no text and no retry (the banner says so); no engine-level name-clash test through the builder (the e2e and `mergeSkills` cover it).
- UX (M5.3 review): the marks review's success text stays after an undo; `busy` is never reset if `client.command` throws; the window grows long with many characters; no UI assertion for the lost-skills and montage lines; `?? p.count` fallback in `marksReview` pairs is dead code; e2e reruns rewrite committed screenshots (repo-wide).
- UX (M5.1 review): the offer builder's result banner stays after live updates; a draft is dropped without notice when the player chooses the selection being edited; practice dates show the UTC day; Withdraw uses a native confirm; no e2e for a repeat chip click or a declined confirm.
- Tests (QF.8 review): `npm run e2e` chains `--project=e2e && --project=latency`, so locally a failing e2e spec skips the latency specs (CI runs both steps regardless).
- Rules (MQ.14 review): a stat base under 5 units gives an item cap of 0, so any item bonus there shows "(+0.0, capped)"; consider a minimum cap of 1 unit.
- Content (MQ.13 review): a campaign seeded before MQ.13 keeps the old Mage/Rogue/Brawler/Healer; "Add the default set" matches classes by name, so the old Healer blocks the new one, and under stored rules (name-only skills) the old Common Mana Bolt blocks the new Inferior one, with no hint to the GM.
- Content (MQ.13): the default set has no skill-library entry for the race skill Identify (Common), so a new campaign's characters show Identify with no description (the demo writes its own text).
- Skills (MQ.12 review): a hand-edited copy (`textEdited`) keeps its text through an upgrade, and the GM has no way to clear the mark and return the copy to library text.
- Skills (MQ.12 review): renaming a library entry or changing its rarity orphans copies at the old key (they keep their text; effects drop to null) with no GM warning; a copy upgraded to a rarity with no entry keeps the old text silently.
- Skills (MQ.12 review): if M4.9 switches `libraryByRarity` on for a stored campaign, earlier `skill.describe` edits lack `textEdited` and would be overwritten by the next library edit.
- Boundaries: the QF.2 canary is engine-level (projection); no server-level
  test drives a player's refused item command through the hub and scans the
  frames (the hub sends only `projectForPlayer` output).
- Rules: `offerSelection` (`evolution/model.ts` ~214) lets the GM offer a
  name the character already chose (and an evolution renamed) as a fresh
  option, so the character can end up with both forms (QF.1 review).
- Rules: `mergeSkills` (`skills/model.ts` ~219) does not refuse a retired
  skill name, unlike selections and transforms (D63).
- Boundaries: accepting a stale trade reveals the proposer's exact holdings
  ("has 7"); trade ids are client-chosen; some errors name party ids
  (`economy/model.ts` ~114, ~124; `commands.ts` trade.propose).
- Boundaries: no CSP, `frame-ancestors`, nosniff or Referrer-Policy on the
  app shell, and static serving allows dotfiles (`server.ts` ~61).
- Boundaries: `isAllowedHost` ignores text after `]`; `isLoopback` is unused
  while D3 still says "loopback or GM key"; a hand-set `GM_KEY` needs only 16
  characters and bad GM keys are not throttled (`security.ts`, `config.ts`).
- Tests: exact-limit cases are untested (nickname 60, note 2000, flavour
  1000, join name 200, portrait 2 MB), and some rejections are asserted with
  `toBeTruthy()`.
- Tests: web logic covered only by e2e (`live.ts`, `gmKey.ts`,
  `player/chime.ts`, `player/changeCount.ts`, `gm/portraitUpload.ts`).
- Tests: `e2e/M3.1.spec.ts` test 2 depends on test 1's end state.
- Tests: `apps/server/test/sessionLog.test.ts` ~437 waits up to 5 s with no
  assertion, so a failure shows up later as a length mismatch.
- Tests (sweep B): `shareXp`/`splitXp` floor in grade-gap scaling is
  unpinned (`progression/xp.ts` ~174, ~238): `Math.floor`→`Math.round`
  survives; add a share like 200 × ⅓ → 66.
- Tests (sweep B): `e2e/MQ.8.spec.ts` ~128-130 and `e2e/MQ.7.spec.ts`
  ~158-161 cut frame scans at the first leaking frame, so they cannot fail;
  cut by frame count taken before the command (as M3.9 ~135 does).
- Tests (sweep B): `e2e/MQ.7.spec.ts` ~131-133 checks Miranda's toast after
  it has expired; assert her history has no NOTICE.
- Tests (sweep B): `randomCommand` (`test/helpers/events.ts`) generates no
  selection/evolution/profession, `noticeTo`, ranked-entity or `enemyGrade`
  commands, so replay and canary properties never combine them with undo.
- UX (sweep B): MQ.8 demo tier text reads "TIER A storm-bred…" (fixture
  wording); out-of-range Identify could say why ("too powerful to read").
- UX (sweep B): MQ.6 [Take] buttons misalign between offer rows on a phone.
- Rules (MQ.A review): titles are plain strings, so MQ.14's title percentages and the pools' "maximum rises from a title" path are engine-only until M6.4; add an end-to-end pools test there.
- Rules (MQ.A review): a GM pool set to the same value ends the no-heal mark (D129, deliberate), so re-equipping then refills; the GM form could say "healed to full".
- Process (MQ.A review): MQ rules that need GM commands without UI yet (withdraw option M5.1, evolution stat bonus and profession offers M5.2, quest `noticeTo` M7.1, entity grade/level M7.2, rules switches M4.9) are reachable only through the WebSocket API until those items land.
- Boundaries (QF.3 review): the rate limit is per socket, so a script that reconnects gets a fresh 30-message burst each time (no per-address limit); create/delete churn still grows the event log (D136 residual). NotesPanel shows no usage readout, only the limit error.
- UX (QF.3 review): the player practice form's 200-character hint ignores selected skill names, which count toward the 500-character entry cap; "Practice log is full (1 entries)" wording at a cap of 1.
- Tests (QF.4 review): a schema version downgrade (a revert) lets `golden:record` re-pin states at the lower version; the CLI main block and `readManifest`'s missing-file path are untested; the golden scan is case-sensitive and non-recursive.
- Rules (sweep C): `overLimit` practice count includes GM-logged entries, so GM entries use up a player's 5,000 allowance (`events/commands.ts` ~1280).
- Rules (sweep C): `reducer.ts` ~1293 comment says evolution refills include titles; titles are not wired until M6.4.
- Tests (sweep C): hub undo path (`hub.ts` ~282, ~288: `undo ? [] : …`, `onlyIfChanged: !undo && …`) and the rate-limit bucket cap (`Math.min(burst, …)` ~109) survive mutation.
- Tests (sweep C): `overLimit` note.edit title growth and practice `skills` in the entry size are unpinned (`commands.ts` ~1275, ~1306); the item-cap `+ 1e-9` guard and `Math.max(0, …)` in `bonuses/effective.ts` ~147 survive mutation.
- Tests (sweep C): one commit can edit a golden log, its manifest hash and the schema version together; a CI comparison against `origin/main` would catch it.
- UX (sweep C): XP-loss preview wording ("450 XP · 50 lost", "tracks are at the top") misleads for a level-0 character the award itself caps (`GmScreen.tsx` ~484-500).
- UX (sweep C): "capped" is explained only by a `title=` tooltip, invisible on phones (`PlayerScreen.tsx` ~366-372).
- UX (sweep C): Notifications default filter "Level-ups" hides a gift-only history ("No notifications match.").
- UX (sweep C): `.skill-effects` lacks `overflow-wrap: anywhere` (`styles.css` ~1010); stat bonus annotation is 12 px muted (`styles.css` ~1171).
- Rules (QF.5 review): the engine lint flags declarations of one's own names `Date`/`Math` (enum members, class members, type parameters); none exist.
- Tests (QF.6 review): desktop.spec attaches stdout/stderr listeners after launch; output before then is not checked.
- Tests (QF.7 review): the failed-fsync test does not pin the log's bytes after the refusals; the undo path where ftruncate succeeds and its fsync fails is untested; a short write that does not throw is untested.
- Boundaries (QF.9 review): a non-party player with a trade id gets the reducer's `only "kim" can answer`; an accept failure tells the counterparty the proposer no longer has their offer; a proposal's `get` ids reach the counterparty as bare ids (the proposer's choice, not a probe); items from declined trades stay "seen" for good.
- Tests (QF.12 review): the `libraryByRarity` pin in `defaults.jsonl` shows as a replay rejection, not a state diff.
- Rules (sweep D): after the MR.3 overflow migration, undoing an earlier XP award that fed a banked track is refused with "a later event depends on it" and no hint that the migration is why (`reducer.ts` `rules.migrated`).
- Boundaries (sweep D, off-lens): `migrateOnLoad` (`apps/server/src/migrate.ts` ~14-24) does not close the store when the migration throws, so a failed demo switch keeps the lock and every later switch gets 409 until restart; wrap in try/catch and `store.close()`.
- UX (sweep D): the GM Skill text form keeps "Library text in use"/"Skill text saved" after the GM switches character or skill (`GmScreen.tsx` SkillText); a disabled Use library text explains itself only by `title=`; `AwardXp` swallows a `previewXpAward` throw and hides the lost-XP warning.
- UX (MR.A round 2): for a re-rated copy whose old-rarity entry is missing, the Skill text form says "No library entry for this rarity." while Use library text is enabled.
- Rules (sweep A): `rules.edited` lowering a grade's `xpPerLevel` leaves a character over the new threshold unlevelled until the next award (then several DINGs at once); re-run the level loop or flag it in `rulesStateProblems` (`reducer.ts` ~1689).
- Rules (sweep A): the `rules-settings` golden ends on default rules (re4 reset, re6 undo), so a no-op `rules.edited` would still replay to it; end on a non-default edit and re-pin.
- Rules (sweep A): `typicalSessionAward` multiplies by every participant, including those with no XP room, so its own suggestion loses their share (documented choice; the preview shows the loss).
- Boundaries (sweep A): `GET /api/gm/export` with no open campaign returns 200 `{error}` instead of 404 (`server.ts` ~323).
- Boundaries (sweep A): no cap on concurrent pre-join WebSocket connections or connection rate (LAN DoS only).
- Tests (sweep A): `changeLogPage` counts `undone` after filters despite the QF.13 doc; untested under a filter that excludes the undone row, so the console's restart guard can miss it (`history/changeLog.ts` ~292).
- Tests (sweep A): `e2e/M4.7.spec.ts` ~107 fixed 300 ms sleep before a negative leak check; await a later visible broadcast instead.
- Tests (sweep A): `RulesSettings.tsx`, `XpAward.tsx`, `ChangeLog.tsx` have no unit tests (e2e only).
- Tests (sweep A): `CAMPAIGN_FIELD_VISIBILITY` is not read by `projectForPlayer`, so it documents rather than enforces (`projection/player.ts` ~95).
- M5.2 review: no e2e exercises the evolution builder's "Offer merge" button or the merge-row rarity label (engine and model unit tests cover the rules).
- M5.2 review: the builder's stale-option check does not re-check a release's stored professions or re-rating against the current character (choose re-defaults them).
- (M5.A review, 2026-10-23) Merge transform at evolution renames practice entries for the transformed skill but not its consumed partner (`evolution/model.ts` ~786), so the merged skill inherits one side's joint-use history; `skill.merge` renames nothing. Pick one rule (DESIGN §6: merged skill starts fresh).
- (M5.A review) Merged skill's `kind` comes from the alphabetically first skill (`skills/model.ts` mergeSkills uses `a.kind`); class + profession merges always become class skills. Take the higher-rarity skill's kind or let the GM choose.
- (M5.A review) "Send merge" sends `skill.merge` then `skill.describe`; undoing the merge from the Change Log is refused until the describe is undone. Carry description/flavour in `skill.merge`.
- (M5.A review) The default re-rating at evolution also drops Identify (race skill), lowering the Identify tier; the builder gives no hint. Per DESIGN §6, but worth a note in the re-rating row. (Q64)
- (M5.A review) Practice "Remove" has no confirmation (`PracticeCapture.tsx` ~293) while Withdraw does; "Mark all reviewed" repeats the 500 batch limit from `envelope.ts`.
- (M5.A round 2) `MergeBuilder.tsx` ~18 uses an unpinned default character (`ids[0]`), like the evolution builder before its fix; a character created ahead of the current one mid-build would carry the typed name to the wrong character. Also "1 of these 1 uses" grammar when requiredJointUses is 1.
- Rules (sweep C): `title.awarded` now refuses a whitespace-only duplicate (`titleKey` collapses inner spaces, reducer ~848), so a pre-D177 log with "Dragon  Slayer" and "Dragon Slayer" no longer replays; D177 should name the refusal (none is known to exist).
- Rules (sweep C): a loot table may define per-pick ranges whose worst-case total exceeds the `loot.rolled` bundle caps (1e9 currency, 1e6 per item), so such a roll is refused with a raw schema message; validate at define/edit.
- Rules (sweep C): the `CAMPAIGN_STATE_SCHEMA_VERSION` comment skips v28 (ledger) and v29 (title library) (`reducer.ts` ~73).
- Tests (sweep C): an empty loot roll (all "nothing") sending no gift notice is untested (`history/index.ts` ~193 `!isEmptyBundle`); `isDing` `title` kind is unpinned in `history.test.ts`; `stabilityOffers` exact-tag match is unpinned (substring mutation survives); `parseStabilityRules('__proto__: +5')` silently drops the rule; the title DING wording has no unit test; boundary mutations survive in `currencyModel.ts` (MAX_AMOUNT, reason 200), `titleLibraryModel.ts` (`parsePercent`, `parseFlat` bounds) and `loot.ts` ~72 (item min 0).
- UX (sweep C): Title and Item library disable Save with no message for an unparseable bonus ("10%", "0.5"); the Item library reason stays after a Give/Take and rides the next one; Take is enabled for a count above what the character holds; practice stability offers' "Not now" dismisses every offer, not one; Loot tables with an empty item library say only "choose an item"; Credits/Title library leave the right third blank at 1366 while Item library/Loot inputs stretch ~1300 px, and ledger cells wrap; the phone Titles row is crammed into the narrow value column.
- UX (M7.A review): the bestiary stat fields take whole stat points (17 shows as 1.7) with no hint, unlike the character editor (`Bestiary.tsx` ~189); the contest roller defaults side B's grade to G for an entry with stats but no grade without saying so (`encounterModel.ts` ~103).
- (Moot: MT.3 removed the hunger tracker.) Rules (sweep D): `hunger.set` over several characters is refused whole when one has outgrown hunger (`commands.ts` hunger.set, `reducer.ts` `hungerFaded`); the console guards per character, but a scripted group set fails for everyone.
- Boundaries (sweep D): a PC-vs-PC shared contest lets each player solve the other's stat from their own value and the rounded chance (`projection/player.ts` ~946 `playerContests`); the GM chooses to share; D182/Q67 accepted only the NPC case.
- Boundaries (sweep D): the 1,000-state projection canary seeds no contests, regions or factions (hunger retired by MT.3) (`projection.test.ts` `seed()`); targeted unit tests and e2e frame scans cover them today.
- UX (sweep D): the encounter roller's Who select and "Players see" field truncate names at 1366 (`Encounter.tsx` ~190, `.contest-side`); Offer montage is hidden with no hint when the clock is under half or has a failure (`Encounter.tsx` ~434); "Party is here" button's accessible name "The party is in …" lacks its visible label (`Trackers.tsx` ~260, WCAG 2.5.3).
- UX (M8.1 review): diamond animates only on the status ring; the other windows' frames are static; the `.player-grid .window:not(.skill-detail)` rule (0,3,0) outranks single-class border variants on player windows; the phone full-page theme shot is too tall to judge the frame.
- Tests/UX (M8.2 review): `useEvolutionFlash` has no hook test (character switch, second evolution within 2.4s); an `undefined` grade is stored in `seen`, so an evolution landing during a view gap would not play; evolving into diamond swaps `prism` for `evolve-ring` for 2.4s; the M8.2 e2e reads styles inside the 2.4s window (could flake under heavy load).
- UX (M8.A review): the evolve ring starts at brightness(1.8), so dull bronze reads as gold for the first second of G→F (`themes.css` evolve-ring); a per-theme boost would keep dull metals dull. The evolution DING plays over the swell (consider muting the chime while `evolving`). The selection cue keys on the pending count (re-offer 1→1, two levels at once 0→2). The M8.1 `<metal>-1366x768.png` names are status-window clips, not viewports. The M8.3 keyboard sweep runs with sound off, so the volume slider and the evolution dialog's focus trap are not exercised. A full e2e run rewrites ~17 committed PNGs (animation phase).
- UX/tests (M9.1 review): the M9.1 shots are Session-panel clips named by viewport (like M4.3's), and the refused-copy textarea has no 390px shot; after a rejected `clipboard.write` the legacy copy runs after an await (usually still within Chrome's activation window, else the textarea shows; untested); M4.3/M9.1 PNGs change on every e2e run (timestamps, ports, QR).
- (M9.5 review) Import content: no select-all / none for long packs (34 entries); engine refusals show their "Event … (type):" prefix in the entry list; GM-note tags accept case duplicates; a content file repeating a quest title within itself gets no note.
- (M9.A review, fable) Drafting a menu or evolution ahead of the level-up gives an un-tickable entry (now documented in CONTENT-FORMAT); duplicate-noted entries are ticked by default on re-import; the M9.A acceptance creates Jake without `classWeights` and covers no drafted menu, practice, marks or stability in the report; the report does not log region moves or name a hidden quest's reveal; an import applies as one undo per entry; the evolution preview note lists class names but not transforms, professions or re-rates; reports written before D198 have no Party section until rebuilt; a DING toast can still show after an evolution.
- (M10.1 review) Quit backups are never pruned (D199) and a same-second quit backup failure is only logged; the Windows firewall steps give the Wi-Fi path only (no Ethernet); a loopback-only join address gets no "no network found" hint.
- (M10.1 review r2) After the 3 s close grace an in-flight HTTP handler can hit the closed store (500); a stuck close leaves the demo campaign's LOCK (recoverable); no test drives the grace path or Windows `session-end`.
- (M10.2 review) The `mac:` block in electron-builder.yml is unbuilt and untested (D200/Q73); the newest green Release run is a manual dispatch, the `release` push path last ran on 2026-10-23; the AppImage smoke step ends with a broad `pkill -f`.
- (Sweep A 2026-10-24, Rules · fable) The session report's Party section prints rarity names ("Common") while content files take rarity ids, so a re-rate Claude copies from the report is refused as an unknown rarity; the tutorial pack's Rare Identify tier is out of reach in five sessions, and the F→E re-rate drops Identify below every tier unless the GM keeps it.
- (Sweep A 2026-10-24, Tests · haiku) Untested: the 2 MB preview body limit (only a mocked 413), `report: false` for a running session's JSON, case-insensitive duplicate notes beyond items; content boundary tests derive from CONTENT_LIMITS itself; M9.5 checks secrets in page text only, not frames; M4.7/M8.4 use fixed waits before negative frame checks; M3.3 timed out once at 4 workers (load).
- (M10.A review · fable) Windows log-off backup is best-effort (Windows may end the process once WM_ENDSESSION returns; untestable here); the Windows firewall step assumes the app is already in "Allowed apps" (no "Allow another app… → TheSystem.exe" path); `JoinPanel` reads `/api/join` once per mount, so new interfaces show only after a console reload; AppImage launches in tests and release.yml pass `--no-sandbox`, a plain double-click on Ubuntu 24.04 (AppArmor userns) may hit the SUID-sandbox error; the 3 s close-grace comment and path (already noted above) stays.
- (MC.5 review r2) A second GM view (the browser /gm beside the desktop window) sees listening on with no mic of its own and posts off within a poll, ending the first window's session; a campaign switch leaves the old Listener's open segment unflushed until the next POST.
- (Sweep D 2026-10-26, Rules · sonnet) `shop.define` accepts the same item twice as wares at different prices.
- (Sweep D 2026-10-26, Boundaries · fable) `PUT /api/gm/ai/key` is accepted from any GM console, so a GM console opened in a LAN browser would send the Anthropic key over plain HTTP; refuse it unless the request is loopback (`isLoopback` is unused) and hide the form.
- (Sweep D 2026-10-26, UX · haiku) Enter in the loading-text field submits Generate; a ticked loading screen with blank text sends nothing and says nothing; Test connection disabled without a reason; Shops: Sell disabled with no characters and no hint, identical aria-labels across shops, "for nothing" vs "for 0 Credits", a shop whose items were removed shows "Nothing for sale." with no hint; on a phone the loading text shows twice (banner and toast).
- (QF.29/QF.30 review) The panel's "no key" message stays after the GM saves a key until the next Generate; the key pre-check ignores Cancel until it returns.

## Final review (M11.5)

Whole-repo review by a model other than the builder's, at the head of
`wip/M11.5` (main plus M11.4). Lenses: all four above at once, plus the
install and first-session path a GM follows from `docs/GM-GUIDE.md`.
Findings already in the Backlog are not repeated; M11.5 triages the Backlog
itself: each Low is fixed, or kept and summarised by area in `docs/DONE.md`
under "Known gaps" (the Backlog lines stay as the detail).

2026-10-25 · fable at 480d613a: 0 High, 0 Medium, 7 Low (5 Low, 2 guesses).
Fixed: the hub logs an engine error inside a command. Kept, in `DONE.md`:
the rest. The Backlog was kept whole (no Low affects play at the table).
- MT.4 (sonnet review, Low): players' Credits history follows the shared 300-entry ledger, so old rows can drop with no "older entries not shown" note; rows carry no date; a missing counterparty shows its raw id; projection tests lack trade/loot rows.
- MC.1 (sonnet review round 2, Low): the status route decrypts the key on every call (on macOS the keychain may prompt more than once); the no-encryption hint names Linux keyrings on every OS; a very small test call shows "$0.000"; spend is kept in memory only (a restart starts it at 0).
- QF.27 (sonnet review, Low): [Answer]'s inline scroll-margin is never cleared and the banner stack is found by its test id; QF.28 nit: "2 MB" is hard-coded in portraits.ts and derived in store.ts.
- MC.3 (sonnet review rounds 1–2, Low): a shop ware whose item is missing is dropped from the Shops window without a hint; removing a shop leaves its open offers (cancel by hand); `saleOpen` matches by item, so an unrelated open GM trade of that item also disables Sell; Cancel/Remove status replaces the "Offered" line.
- MC.4 (sonnet review round 2, Low): loading screens to end are matched by text and position, so a same-text pinned broadcast the GM sends by hand in that window (or after a rejected loading broadcast) could be taken down instead; leaving the console mid-generation leaves its banner for the GM to remove in Live banners.
- (QF.31 reviews) Listening panel: a second idle GM window goes stale (no poll); a mic-on restart can still catch a poll as the server closes; "Loading the speech model…" could stick if `ready` arrives with `available` false; the Stop timeout handle is not stored; `misses` never resets; panel wiring has no component test (pure rule only).
- MC.7 (sonnet review round 2, Low): the `logged` filter for drafting with no session matches every outside-session entry; Confirm can double-log if the draft delete fails; the contest practice dedupe remembers only the last pair; the ±2-minute app-action window drops drafts silently; MC.7's two screenshots are byte-identical (the queue now holds the drafts, so both show one view).
- MC.8 (sonnet review round 1, Low): dismissal is keyed on the model's title, so a reworded idea can return; the dismiss e2e never asks again; the pace setting is client-only and not persisted.
