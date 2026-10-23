# Quality sweeps

Per-item reviews (LOOP §6) see one diff at a time. Sweeps (LOOP §10) look
across items, with several models on different lenses, for what those
reviews miss. Decisions: L13 in `docs/DECISIONS.md`. Fixes are queued as QF items in
`docs/ROADMAP.md`.

**Last sweep:** 41be1ee (2026-10-23, A) · **Next rotation:** B

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

Pilot notes: every confirmed finding was missed by the per-item reviews
(QF.1 is in MQ.3, reviewed twice the run before). No false alarms. The
reviewers ran 15–20 minutes each in the background.

## Flakes

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
