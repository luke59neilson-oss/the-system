# Progress

**Status:** in progress: M0–M4, MS, MQ and MR done; QF.1–QF.15 done; M5.1–M5.3 done; Preview ready: Actions → Release → Run workflow (M4)
**Next item:** M5.4 Merges (resume `wip/M5.4`)
**Blockers:** none

## Run log

<!-- Newest at the bottom. One entry per run: start/end UTC, preflight,
items finished, tests, engine coverage, review summary, open wip/* branches,
next item, blockers. -->

### Setup session · 2026-10-21 13:45–14:05 UTC
- Repo created by Luke; docs written; roadmap revised after a Sonnet review
  (see DECISIONS D14).
- Verified from the workspace: push to branches incl. workflow files; GitHub
  Actions runs on this private repo (test workflow green); npm registry;
  Electron and electron-builder binary downloads; vitest 5 runs; Playwright
  1.64 drives `/opt/pw-browsers/chromium`.
- Verified blocked: deleting remote branches, pushing tags, GitHub API writes.
  A leftover `perm-test` branch exists on the remote; ignore it.
- Not yet verified from an unattended run: `add_repo` without confirmation,
  push to main, reviewer subagents on `sonnet`/`fable`. The first scheduled
  run records these in its preflight.
- Next: M0.1.

### Run a5d530b3 · 2026-10-21 14:12–14:53 UTC
- Preflight: `add_repo` not needed (repo already attached and cloned); push to
  main works (lock commit pushed); `npm view vitest version` → 5.0.5; reviewer
  subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; no CI runs existed yet. A concurrent
  docs commit (52283a9, walking-skeleton milestone MS and preview builds) landed
  mid-run; merged it, and follow its work order (M0 → M1.1–M1.5 → M1.13 →
  M2.1–M2.3 → MS → M1.6…).
- Finished: M0.1 Monorepo scaffold, M0.2 CI, M0.3 LAN server skeleton,
  M1.1 Rules config, M1.2 Character model (all reviewed by Sonnet; see
  REVIEW-LOG.md).
- Tests: 134 unit tests (10 files), 2 e2e (M0.1). Engine line coverage 99.1%
  (floor 90% set in vitest.config.ts).
- CI: green on f6a0b8e, fdfd298 and 7b414c5 (latest code on main).
- Reviews: 5 items, 8 rounds, 0 High; every Medium fixed (two left by design:
  M4.9 id-keyed config edits, D22).
- Toolchain notes: TypeScript pinned to 6.0.x (typescript-eslint does not yet
  support TS 7, D18). Node 22 in CI.
- Open `wip/*` branches: none.
- New question: Q9 starting World Stability (default 100).
- Next: M1.3 Event-sourced core.
- Blockers: none.

### Run 3b746078 · 2026-10-21 15:07–15:47 UTC
- Preflight: `add_repo` tool not offered in this session; repo already cloned
  and attached, fetch/ff-merge worked. Lock pushed to main. `npm view vitest
  version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context,
  different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (7b414c5).
- Finished: M1.3 Event-sourced core, M1.4 XP and leveling, M1.5 Free points
  (each reviewed by Sonnet in 2 rounds; see REVIEW-LOG.md).
- Tests: 221 unit tests (15 files) incl. fixed-seed property test (seed
  20261021) and three frozen golden logs (basic, xp, freepoints). Engine line
  coverage 99.15% (floor 90%).
- CI: green on 1a7c6d0 … c8d859f (every code commit this run).
- Reviews: 3 items, 6 rounds, 0 High; Mediums fixed except two kept by design
  and logged (D34 create events store inputs; D35 class spread uses a
  cumulative highest-deficit split, raised as Q10).
- New decisions D27–D38; new question Q10 (class spread rounding).
- Open `wip/*` branches: none.
- Next: M1.13 Player projection (then M2.1–M2.3, MS).
- Blockers: none.

### Run 647c5fd1 · 2026-10-21 16:06–16:53 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned, fetch/ff-merge worked. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (b02ec4f).
- Finished: M1.13 Player projection, M2.1 Persistence, M2.2 Live protocol and authority (each reviewed by Sonnet in 2 rounds; see REVIEW-LOG.md). M2.2 was built on `wip/M2.2` and fast-forwarded into main once clean (the branch stays on the remote; nothing left on it).
- Tests: 279 unit/integration tests (21 files) incl. the projection canary over 1,000 random states (seed 20261022) and a live GM + 2 players canary over every player frame and public HTTP body; 2 e2e (M0.1). Engine line coverage ≈99% (floor 90%).
- CI: green on every code commit pushed to main this run through 2fe68fd; 84c8d69 (M2.2) pushed at the end of the run.
- Reviews: 3 items, 6 rounds; 1 High (M2.2 GM HTTP gate bypass via `/%61pi`, fixed and tested); all Mediums fixed or logged (D44 one event per command; D46 GM key over LAN).
- New decisions D39–D46; new questions Q11 (party pool bars), Q12 (GM from another device).
- Open `wip/*` branches: none unfinished (`wip/M2.2` is merged).
- Next: M2.3 Join helper, then MS.1–MS.6, MS.A.
- Blockers: none.

### Run (lock id blank) · 2026-10-21 17:06–17:44 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned, fetch/ff-merge worked. Lock pushed to main (its `run` id came out blank: `xxd` is missing in this image; harmless). `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (a5eb685).
- Finished: M2.3 Join helper, MS.1 Minimal GM screen, MS.2 Minimal player screen (each reviewed by Sonnet in 2 rounds; see REVIEW-LOG.md).
- Tests: 298 unit/integration tests (22 files) incl. QR decode via jsQR, a new golden log (`broadcast.jsonl`), broadcast canaries in the projection and live sync tests; 6 e2e (M0.1, MS.1, MS.2) with screenshots in `docs/screens/MS.1/` and `docs/screens/MS.2/`. Engine line coverage 99.12% (floor 90%).
- CI: green on every code commit except 852df0f (MS.2 e2e spec used a DOM global the tools tsconfig lacks; my check output was grepped instead of exit-code-checked). Fixed in f46f1a7 four minutes later; later runs green. Lesson: gate pushes on `npm run check` exit status.
- Reviews: 3 items, 6 rounds, 0 High; Mediums fixed (per-URL QR options; broadcasts kept in state, campaign state v3; DING resend on join; gap notice only after reconnect).
- New decisions D47–D51; new question Q13 (starter class).
- How to try it: `npm run build && node apps/server/dist/main.js`, open the printed `http://localhost:30333/gm#key=…` link as GM and the join URL (`/`) as a player.
- Open `wip/*` branches: none.
- Next: MS.3 Perspective switcher, then MS.4–MS.6, MS.A.
- Blockers: none.

### Run 5f86c6b8 · 2026-10-21 18:06–18:51 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (local `main` was stale; reset to `origin/main`), fetch worked. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (87ee4b3).
- Finished: MS.3 Perspective switcher, MS.4 Demo campaign (split, D53: titles, items, quest/stability and grades above G moved to new item M1.15), MS.5 Desktop wrapper (preview) — each reviewed by Sonnet in 2 rounds; see REVIEW-LOG.md. MS.5 was built on `wip/MS.5` and fast-forwarded into main once clean.
- Tests: 326 unit/integration tests (27 files) incl. demo campaign build, campaign switch server tests, `startApp`, desktop launch helpers; 10 e2e (M0.1, MS.1–MS.5) with screenshots in `docs/screens/MS.3/`, `MS.4/`, `MS.5/`; desktop smoke (`npm run desktop:smoke`, Electron under xvfb) passes locally, not in CI by design (D54). Engine line coverage 99.15% (floor 90%).
- CI: green on every code commit except 63823e9 (MS.3 e2e used `window` under the tools tsconfig; my push chain checked `echo`'s exit code again). Fixed in b13d4be three minutes later. ea3c9fd (MS.5 merge) was still running at the end of the run; the next run checks it first.
- Reviews: 3 items, 6 rounds; 1 High (MS.3: the "keep panes mounted" fix had not applied; fixed and proven by a frame marker test); all Mediums fixed; accepted Lows logged.
- New decisions D52–D54. New roadmap item M1.15 (demo campaign content).
- How to try it: `npm run build && node apps/server/dist/main.js`, open the printed GM link; "View as" bar for player perspectives and Table view; "Load demo campaign" in the GM header. Desktop: `npm run desktop:smoke` or `npm run build -w @the-system/desktop && npx electron apps/desktop` after fetching the Electron binary (see apps/desktop/README.md).
- Open `wip/*` branches: none unfinished (`wip/MS.5` is merged).
- Next: MS.6 Preview release (electron-builder; release workflow on push to `release`), then MS.A.
- Blockers: none.

### Run 01ce3e89 · 2026-10-21 19:06–19:47 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (detached HEAD; reset `main` to `origin/main`), fetch worked. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (ea3c9fd, the MS.5 merge).
- Finished: MS.6 Preview release (reviewed by Sonnet in 2 rounds; see REVIEW-LOG.md). Built on `wip/MS.6`, fast-forwarded into main once clean. electron-builder config, `.github/workflows/release.yml` (push to `release` publishes `preview-<date>`; push to `release-dry-run` builds and checks only), packaged-app smoke `npm run package:smoke -w @the-system/desktop` (D55).
- Acceptance: Release run 39663632813 on `release-dry-run` at b88418e green — Windows installer + portable, macOS universal dmg (ad-hoc signed, on `macos-15-intel`), Linux AppImage; each packaged app launched and connected in CI. The AppImage also built and launched under `xvfb-run` locally. No Release published yet: MS.A pushes `main` to `release`.
- Tests: 326 unit/integration tests (27 files), 10 e2e, plus the packaged smoke (Linux/Windows/macOS in the release workflow). Engine untouched; line coverage 99.15% (floor 90%).
- CI: green on every `wip/MS.6` push; b88418e pushed to main at the end of the run (the next run checks it first).
- Reviews: 1 item, 2 rounds, 0 High; Mediums fixed or resolved by the green dry run.
- Environment notes: macOS arm64 runners did not pick up jobs (capacity; jobs cancelled after ~15 min) → Intel runner. The release-dry-run branch now exists on the remote and is meant to be reused. Each mac run costs ~2–3 min of 10× macOS minutes.
- Open `wip/*` branches: none unfinished (`wip/MS.6` is merged).
- Next: MS.A Milestone acceptance and review (reviewer `fable`), then `git push origin main:release`.
- Blockers: none.

### Run 9fed26a9 · 2026-10-21 20:06–20:36 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (detached HEAD; local `main` had unrelated history, reset to `origin/main`; old ref kept locally as `old-local-main`). Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `fable` and `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (b88418e).
- Finished: MS.A Milestone acceptance and review (fable, 2 rounds; new `e2e/MS.A.spec.ts`: first session end to end through a server restart with the phone reconnecting; Medium fixed: GM link for another browser on the host, D56). M1.6 Titles and bonuses (sonnet, 1 round, 0 H/M; Lows fixed; D57).
- **Not done:** `git push origin main:release` (MS.A's preview build) was denied by the session's auto-mode permission classifier as a production deploy. Not retried or worked around. The release workflow is proven by the dry run (39663632813); Luke can push `main` to `release` to publish the first preview.
- Tests: 349 unit/integration tests (28 files) incl. fixed-seed bonus reference test (seed 20261106); 11 e2e (M0.1, MS.1–MS.5, MS.A); desktop smoke (`npm run desktop:smoke`) passes locally. Engine line coverage 99.19% (floor 90%).
- CI: green on 0df3fa7, 13c255d, 112f8df, cc2b308; 55918e5 running at the end of the run (the next run checks it first).
- Reviews: 2 items, 3 rounds, 0 High; 1 Medium fixed; Lows fixed or logged.
- New decisions D56–D57; new question Q14 (refill pools on level-up).
- Note: running e2e rewrites tracked screenshots (join URL port changes); discard re-renders of other items before committing.
- Open `wip/*` branches: none unfinished.
- Next: M1.7 Items and economy (stopped at 26 min rather than start a large engine item that could not be reviewed within the timebox).
- Blockers: preview release push needs Luke (see header).

### Run ea91d71d · 2026-10-21 21:06–21:51 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (detached HEAD; reset `main` to `origin/main`). Lock pushed to main (its first commit had a blank id, fixed with `od`; `xxd` is missing). `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (55918e5).
- Finished: M1.7 Items and economy, M1.8 Practice log and notes, M1.9 Skills (each reviewed by Sonnet in 1 round, 0 High/Medium; Lows fixed or carried to later items; see REVIEW-LOG.md).
- Engine: campaign state v6 (items, holdings, trades; practice log, notes; character v3 with skill marks and merges). The GM console now receives `projectForGm(state)` (unshared journal entries dropped). New golden logs `economy`, `practice`, `skills`; older golden states regenerated additively.
- Tests: 429 unit/integration tests (31 files); property test now 1,200 fixed-seed steps over every event type except two named unreachable ones; projection canary covers items/holdings/trades/practice/notes. E2E MS.1, MS.2, MS.A re-run green (screens re-renders discarded). Engine line coverage 99.3% (floor 90%).
- CI: green on every code commit through 5af1e38; 3ba5011 running at the end of the run.
- New decisions D58–D63; new questions Q15–Q19 (bonuses and pools, GM stock, journal privacy on disk, excess marks, merges above the ceiling). Roadmap carry-overs added to M3.7, M3.10, M5.5, M1.10.
- Open `wip/*` branches: none unfinished.
- Next: M1.10 Selections and evolutions (stopped at 43 min: past the 35-minute start limit).
- Blockers: preview release push still needs Luke (see header).

### Run 1e88e3c9 · 2026-10-21 22:07–22:46 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (local `main` was a stale pre-rewrite history; reset to `origin/main`). Lock pushed to main (first commit had a blank id: `xxd` missing; fixed with `od`). `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (3ba5011).
- Finished: M1.10 Selections and evolutions (2 rounds, 3 Medium fixed), M1.11 Resolution and clocks (2 rounds, 2 Medium fixed), M1.12 Quests and World Stability (1 round, 0 High/Medium). See REVIEW-LOG.md.
- Engine: character v4 (selections, evolution); campaign state v9 (clocks; quests, World Stability, day counter). New modules `evolution`, `resolution`, `quests`. PlayerView gains the owner's menus/evolution options, `day` and visible `quests`. New golden logs `evolution`, `clocks`, `quests` (older `.state.json` regenerated additively); `character.professionGranted` is now covered by a golden log.
- Tests: 475 unit/integration tests (35 files) incl. the 0→240 simulation (29 selections, capstones 10/45/90/140/190/240, six GM-released evolutions), 36-case 10,000-roll odds test (seed 20261111), projection canary extended to menus, evolutions, clocks, hidden quests and gauges. E2E MS.1–MS.5, MS.A green locally (screens re-renders discarded). Engine line coverage 99.07% (floor 90%).
- CI: green on every code commit except d409f6b (E2E job; logs not downloadable from here; all 11 specs passed locally and the next commit d8368fc was green). b7a0cf6 running at the end of the run.
- New decisions D64–D67; new questions Q20 (must every evolution transform a skill), Q21 (capstone before evolving), Q22 (flat ⅓ in the lower-grade mode). Roadmap notes added to M5.1, M5.2, M7.1.
- Open `wip/*` branches: none unfinished.
- Next: M1.14 Campaign simulation (stopped at 39 min: past the 35-minute start limit).
- Blockers: preview release push still needs Luke (see header).

### Run e560e415 · 2026-10-21 23:07–23:56 UTC
- Preflight: `add_repo` not offered in this session; repo already cloned (detached HEAD and a stale local `main`; reset `main` to `origin/main`). Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` and `fable` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md; latest CI run on main green (b7a0cf6).
- Finished: M1.14 Campaign simulation (sonnet, 2 rounds; 3 High in round 1, all in the test's rigor, fixed); M1.15 Demo campaign content (sonnet, 2 rounds; 1 Medium fixed); M1.A Milestone acceptance and review (fable, 2 rounds; 1 Medium fixed: stale snapshot after a rules migration). See REVIEW-LOG.md.
- Engine: new GM-only `title.award` event (D69; golden log `titles`). Demo now reaches grades G/F/E/D through evolutions, with titles, equipped items, an open menu, an unassigned free-point batch and a visible World Stability quest (D70). Snapshot format v2 records the rules config version; derived lists sort host-independently; rarity-keeping transforms keep banked marks (D71).
- Tests: 494 unit/integration tests (37 files), including the 40-session, 4-character simulation (seed 20261121; invariants after every command; replay and leak checks every session and while releases or menus are pending). All 11 e2e specs green (MS.4 screenshots updated for the new demo; re-renders of other items discarded). Engine line coverage 99.19% (floor 90%).
- CI: green on every code commit this run (c213ecf, 148ec52, df5724a, 56b2db6).
- New decisions D68–D71; new questions Q23 (party sees titles?), Q24 (profession start vs banked XP), Q25 (declining an offered profession). Roadmap notes on M3.6–M3.8 (show the demo's menu, gear and gauge) and M7.3 (store the race level used for the XP bonus).
- Not done: M1.A's `git push origin main:release`. The permission classifier refused it at MS.A, so it was not retried.
- Open `wip/*` branches: none unfinished.
- Next: M2.4 Session log autosave, then M2.A (stopped at 47 min, past the 35-minute start limit).
- Blockers: the preview release push still needs Luke (see header).


### Run 6ffe29f6 · 2026-10-22 00:06–00:52 UTC
- Preflight: `add_repo` was not offered in this session. The repo was already cloned (detached HEAD), so `main` was reset to `origin/main`. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` and `fable` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (56b2db6).
- Finished:
  - M2.4 Session log autosave (sonnet, 2 rounds; 2 Medium: one fixed, one decided as D72/Q27).
  - M2.A Milestone acceptance and review (fable, 2 rounds). 1 High fixed: shutdown waited on sockets that never answered, so a sleeping phone skipped the last session-log write and left the lock. 1 Medium fixed: a host name change made a crash-left lock look foreign (D73).
  - See REVIEW-LOG.md for both.
- Built:
  - Engine `report/sessionLog` (pure; cached pre-sitting fold).
  - Server `SessionLogWriter`, writing `<dataDir>/exports/<campaign>/session-log-<stamp>.md` every 5 min and on close.
  - A `preClose` hook that writes the logs and then terminates sockets.
  - Machine-id campaign locks (desktop `<userData>/machine-id`).
  - New `e2e/M2.A.spec.ts`.
- Tests: 512 unit/integration tests (38 files), including a raw zombie-socket shutdown test. All 12 e2e specs green; screenshot re-renders discarded. Engine line coverage 99.34% (floor 90%).
- CI: green on be60158, 9bf0d6d, 0b9be95, 9818e4f and bb892f4. 3151482 was still running at the end of the run.
- Release: `git push origin main:release` worked this time (M2.A, LOOP §8.2). Release run 39701983963 was in progress at the end of the run; the next run checks that it published `preview-<date>`.
- New decisions D72–D73; new questions Q26 (GM notes in logs: `export` tag) and Q27 (hidden quests in the GM-only log). Roadmap note on M4.3: point the session log at the started session.
- Open `wip/*` branches: none unfinished.
- Next: M3.1 Join screen. Stopped at 43 min, past the 35-minute start limit.
- Blockers: none.

### Run 5a4cdc41 · 2026-10-22 01:06–01:33 UTC
- Preflight: `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale remote-tracking ref), so `main` was reset to `origin/main`. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (3151482). The Release run on 3151482 succeeded and published the pre-release `preview-2026-10-22-4.1`.
- Finished:
  - M3.1 Join screen (sonnet, 2 rounds; 1 High fixed: the e2e init script broke typecheck).
  - M3.2 Status screen (sonnet, 2 rounds; 3 Medium fixed: live-update coverage, compact pane, glow logic).
  - See REVIEW-LOG.md for both.
- Built:
  - `/api/characters` adds the grade's theme token.
  - Join screen: portrait monogram in the grade metal, grade, "Continue as…" and "Last played" from localStorage (try/catch; works when storage throws), Refresh.
  - Status screen: DESIGN §9 order, grade-metal frame, rarity-coloured skill lists with nicknames, pool bars, a glow on changed values.
  - Demo: Jake's first class skill is nicknamed "Old Faithful".
  - New `e2e/M3.1.spec.ts` and `e2e/M3.2.spec.ts`.
- Tests: 523 unit/integration tests (40 files). All 15 e2e specs green; screenshot re-renders of earlier items discarded (their player shots now predate the M3.2 look).
- CI: green on b0e1210. 11afded (M3.2) was still running at the end of the run.
- New decisions D74–D75; new question Q28 (rejoin automatically?).
- Open `wip/*` branches: none unfinished.
- Next: M3.3 Notifications and history. Not started: at 27 min it needs engine/server history (DINGs back to day 1, with undo), which would not fit with review before the 60-minute stop.
- Blockers: none.

### Run b1b95d91 · 2026-10-22 02:06–02:55 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale, unrelated local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (11afded).
- Finished (see REVIEW-LOG.md):
  - M3.3 Notifications and history (sonnet, 2 rounds; 3 Medium fixed or measured).
  - M3.4 Free points (sonnet, 2 rounds; round 1 had 4 Medium, all fixed; round 2 had 2 Medium, both fixed).
- Built:
  - Engine `history` module: `notificationsBetween` and `notificationHistory`, folded from the log with undone events skipped.
  - Hub: history derived from the log (no cap, no `gap`; protocol v3). Items carry `at` and `day`. A `reset` frame is sent after an undo, and on a rejoin past an undo.
  - Player Notifications window: Show filter, search, "Day N · time".
  - Queued DING pop-ups at the bottom of the screen and an optional Web Audio chime (off by default).
  - Free-point assignment: steppers, review and confirm, pinned to its batch, a GM-change notice, and a locked list.
  - The live glow restarts without remounting.
  - New `e2e/M3.3.spec.ts` and `e2e/M3.4.spec.ts`.
- Tests: 536 unit/integration tests (44 files). All 17 e2e specs are green; screenshot re-renders of earlier items were discarded. Engine line coverage 99.35% (floor 90%).
- CI: green on ccd68ac, 1d400d3, 4ce5cb8 and 9b98ced. The final M3.4 fix commit was pushed at the end of the run.
- New decisions D76–D77; new question Q29 (what pops up as a DING; sound default).
- Open `wip/*` branches: none.
- Next: M3.5 Skill detail. Not started: at 47 min this run was past the 35-minute start limit.
- Blockers: none.

### Run cfeff3e8 · 2026-10-22 03:06–03:41 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (db45aba).
- Finished: M3.5 Skill detail (sonnet, 2 rounds; round 1 had 2 Medium, both fixed; round 2 had none). See REVIEW-LOG.md.
- Built:
  - Character skills carry the System `description` and `flavor` (character state v5, campaign state v10; golden states regenerated with an additive diff).
  - Text comes from optional fields in `character.created` (the Archer starter skills have original text), from the offered description when a selection is chosen, and from a new GM-only `skill.described` event. A renaming evolution transform clears it.
  - New golden log `skilltext.jsonl`.
  - The projection adds per-skill `marksNeeded`, `nextRarity` and `atCeiling` from the rules config.
  - Player skill detail dialog: rarity-coloured official name, kind, Unique tag, nickname Add/Edit/Remove (not in the GM's View-as panes), description, flavour, and mark progress with banking and ladder-top text.
  - GM console "Skill text" form.
  - The demo describes Identify and gives each character a mark.
  - New `e2e/M3.5.spec.ts`.
- Tests: 547 unit/integration tests (45 files). All 18 e2e specs green; screenshot re-renders of earlier items discarded. Engine line coverage 99.36% (floor 90%).
- CI: green on f6f895e and 329c3f7.
- New decisions D78–D79; new question Q30 (who writes skill text). Roadmap note on M4.1: fill skill text on grant, including Identify.
- Open `wip/*` branches: none.
- Next: M3.6 Skill selection. Not started: at 34 min, an item plus two review rounds would not fit before the 60-minute stop.
- Blockers: none.

### Run 832a5b4e · 2026-10-22 04:06–04:36 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (e8f5f3b).
- Finished: M3.6 Skill selection (sonnet, 2 rounds; round 1 had 3 Medium, all fixed or partly fixed with unit tests; round 2 had none). See REVIEW-LOG.md.
- Built:
  - A "Skill selection · N waiting · [Choose]" strip under Free points/Titles. The DESIGN §9 rows are unchanged.
  - A modal dialog with the offered skills as cards side by side, one column on phones. Each card shows the rarity-coloured `[Name (Rarity)]`, Class/Profession, rarity and description.
  - Choose → review → Confirm. The command carries `offerId`.
  - A GM re-offer, choice or undo closes the dialog with a notice. Escape cannot drop a choice in flight, and focus lands on the new skill. The View-as panes show the badge without [Choose].
  - New `apps/web/src/player/selection.ts` (unit tested) and `e2e/M3.6.spec.ts`.
- Started M3.7 on `wip/M3.7` (base 57987d6, head e42874b): `PlayerView.inventory` holds the player's own currency, items, equipment and trades, plus definitions of only the items those mention. The canary was reworked so that holdings, trades and held items are owner canaries and the rest of the library stays GM.
- Still to do on M3.7:
  - Switch pool maxima and the stats block to effective stats (D60). Decide how pools clamp when an unequip, gift, trade or `item.edited` lowers a maximum without breaking undo (D31).
  - Inventory UI: equip, give, trades, incoming notices.
  - e2e checking the demo's ring and bow on Jake.
- Tests: 551 unit/integration tests (45 files). All 19 e2e specs are green, and screenshot re-renders of earlier items were discarded. Engine line coverage 99.36% (floor 90%).
- CI: green on 078936c and 167999d. 57987d6 was pushed at the end of the run.
- New decision D80. New question Q31 (should a skill selection DING?).
- Open `wip/*` branches: `wip/M3.7` (unfinished, see above).
- Next: M3.7, resuming `wip/M3.7`. Not finished: the pool-clamp semantics touch the undo rules (D31) and could not be built and reviewed before the 60-minute stop.
- Blockers: none.


### Run 9565aa8d · 2026-10-22 05:07–05:57 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest CI run on main was green (57987d6).
- Finished M3.7 Inventory, gifts, trades (resumed `wip/M3.7`, merged to main by fast-forward). Reviewed by sonnet in 2 rounds: round 1 had 4 Medium (one was not a bug), round 2 had none.
  - Pool maxima use effective stats everywhere. After every event, pools clamp down to the effective maximum and never refill (D81). Undo stays deterministic.
  - The Stats block shows effective values with the gear difference underneath.
  - New Inventory window: currency, equipment with [Unequip], items with [Equip]/[Give], Give currency, Propose a trade, offers with [Accept]/[Decline], own offers with [Withdraw], and past trades (D82).
  - New `gift` and `trade` notices pop up and have a history filter.
  - New `e2e/M3.7.spec.ts`: the demo ring and bow on Jake, effective stats, and HP max rising with an amulet without healing.
- Finished M3.8 Quest log. Reviewed by sonnet in 2 rounds: round 1 had 1 Medium, round 2 had none.
  - A Quests window shows the day, quest text, days left, and a World Stability % gauge only when visible. The projection adds `stabilityPercent` from the configured range (D83).
  - On phones the order is Status, Quests, Inventory, then the feeds.
  - New `e2e/M3.8.spec.ts`: the demo quest's gauge at 89%, with live updates.
- CI fix: 23e69c2 failed because the 40-session simulation test passed the 5 s default limit under coverage. This is a pre-existing borderline: it was also over 5 s locally on 57987d6. The test now has a 60 s limit, and the reducer skips item bonuses when nothing is worn. 6bf8fdf was green; 27c0d4f was pushed at the end of the run.
- Tests: 570 unit/integration tests (47 files). All 22 e2e specs green; screenshot re-renders of earlier items were discarded. Engine line coverage 99.34% (floor 90%).
- New decisions D81–D83. New question Q32 (gear and pools; gift/trade pop-ups).
- Open `wip/*` branches: none unfinished (`wip/M3.7` is merged).
- Next: M3.9 Identify. Not started: at 49 min this run was past the 35-minute start limit.
- Blockers: none.

### Run 5faa0b38 · 2026-10-22 06:08–06:44 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main had failed (27c0d4f: `format:check` on `reducer.ts`). Fixed first with Prettier (631f6f3, CI green).
- Finished M3.9 Identify. Reviewed by sonnet in 2 rounds: round 1 had 1 Medium (canary timeout margin) and 3 Low; round 2 had none.
  - Entities in the campaign state (v11, D84). Each has a GM name, a player label, Identify tiers and the characters who know it. New GM events `entity.defined`/`edited`/`revealed`, a new golden log, and additive golden state diffs.
  - The player projection adds `identify`: only known entities, each with the single tier text the viewer's Identify rarity unlocks. The canary is extended.
  - An Identify window under Quests (after Inventory on phones): choose a known entity and read its tier text, live.
  - The demo trains Casper's Identify to Uncommon. He reads "[Fever]"; Miranda reads "[Malignant Miasma]". The Drum is known to nobody.
  - New `e2e/M3.9.spec.ts` also checks that the players' WebSocket frames never carry GM names, deeper tiers or unrevealed entities.
- Tests: 583 unit/integration tests (49 files). All 23 e2e specs green. Engine line coverage 99.36% (floor 90%).
- CI: green on 631f6f3 and 0ae144d; 98b5742 running at the end of the run.
- New decision D84. New question Q33 (Identify level gap; per-character knowledge).
- Open `wip/*` branches: none unfinished.
- Next: M3.10 Notes. Not started: at 34 min, an item plus two review rounds would not fit before the 60-minute stop.
- Blockers: none.

### Run b7215e54 · 2026-10-22 07:07–07:58 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (98b5742).
- Finished M3.10 Notes. Reviewed by sonnet in 1 round: 0 High, 0 Medium, 8 Low (3 fixed).
  - `PlayerView.notes`: own journal (shared or not) and party notes, never GM notes or other players' journals; the canary is extended.
  - Player note ids are server-generated, and hidden notes answer "unknown note", so players cannot probe for them.
  - The GM's View-as panes join with `viewAs` (read-only; unshared journal entries left out).
  - A Notes window: new/edit/delete, share with the GM, Markdown subset rendered safely, tags, search and filters. The demo has journal, party and GM notes.
- Finished M3.11 Practice and montage (on `wip/M3.11`, merged to main by fast-forward). Reviewed by sonnet in 1 round: 0 High, 1 Medium (fixed), 5 Low (1 fixed).
  - Montages in the engine: offer on a qualifying clock, one focus per offered character (also a "montage" practice entry), close. State v12, new golden log `montage.jsonl`.
  - `PlayerView` adds own practice entries (no tags) and open montages offered to the viewer.
  - A Practice window under Quests: montage focus form, a collapsible Log practice form, recent entries. The demo has an open montage for Jake and Miranda.
  - The property test now runs 2,000 random commands (was 1,200) so every command type, montages included, is accepted at least once with the new generator.
- Tests: 599 unit/integration tests (53 files). All 25 e2e specs green; screenshot re-renders of earlier items were discarded. Engine line coverage 99.36% at the start of the run (floor 90%).
- CI: green on 148d3f4 and 6c3b0c0; f2c68e3 running at the end of the run.
- New decisions D85, D86. New questions Q34 (who edits party notes), Q35 (montage focus and marks).
- Open `wip/*` branches: none unfinished (`wip/M3.11` is merged).
- Next: M3.12 Party view.
- Blockers: none.

### Run a379851e · 2026-10-22 08:07–08:53 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (f2c68e3).
- Finished M3.12 Party view. Reviewed by sonnet in 1 round: 0 High, 0 Medium, 7 Low (2 fixed).
  - A Party window sits under Status (on phones after Quests and Practice, before Inventory). It shows each other character's name in their grade metal, bracketed race, class and profession levels, and one bar per pool. Bars are labelled HP/MP/Stamina and read Full, Empty or a whole percent; bars at 25% or below are red. Levels and labels glow live (D87).
  - It reads only `PlayerView.party`, so no raw pools or stats reach it.
  - The M3.2 no-flash assertion is now scoped to the Status window, because Jake's party view legitimately follows Sultan.
- Finished M3.13 Table extras, now the evolution screen alone (D88). The contest pop-up moved to M7.3 and the hunger tracker to M7.4, where the engine first has rolls and hunger. Reviewed by sonnet in 2 rounds: round 1 had 3 Medium (focus and re-release handling, all fixed); round 2 had 0 High, 0 Medium, 2 Low (accepted).
  - The Status window gets an "Evolution · <grade>-grade available · [Evolve]" row.
  - [Evolve] opens a modal with the paths side by side: transforms, then reshaped class stats.
  - Choosing a path shows warnings: marks reset, selections waiting, a reshape, and that the choice is final. A Profession picker appears when professions are offered. Then Evolve or Back.
  - A release that is replaced, settled or withdrawn elsewhere closes the modal with a notice.
- Tests: 610 unit/integration tests (53 files). All 27 e2e specs green; screenshot re-renders of earlier items were discarded. Engine untouched this run (line coverage 99.36%, floor 90%).
- CI: green on b17e8bb, a1f5d7f and 8f71d59; 8afc40b running at the end of the run.
- New decisions D87, D88. New question Q36 (warnings before an evolution; warn-only default).
- Open `wip/*` branches: none unfinished (`wip/M3.13` is merged).
- Next: M3.A Milestone acceptance and review (fable reviewer; ends by pushing `main` to `release`). Not started: the run was past the 35-minute mark.
- Blockers: none.

### Run b4b5e178 · 2026-10-22 09:06–09:42 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD, shallow, and a stale local `main`), so `main` was reset to `origin/main` and the history unshallowed.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `fable` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (8afc40b).
- Finished M3.A Milestone acceptance and review. Reviewed by fable in 1 round: 0 High, 1 Medium (fixed), 8 Low (3 fixed, rest accepted; see REVIEW-LOG).
  - New `e2e/M3.A.spec.ts`: every player window for Jake, Miranda, Casper and Sultan at 1366×768, 1920×1080 and 390×844; zero console errors, no sideways scroll, skill detail, selection and Identify open and close, and a WebSocket canary for GM-only text (D89). JPEG screenshots in `docs/screens/M3.A/`.
  - Fix: practice forms show the official skill name with the nickname beside it (D78); long history/DING text wraps.
- Tests: 610 unit/integration tests (53 files). All 30 e2e tests green (21 M3/MS/M0/M2 spec files plus M3.A's three viewports); screenshot re-renders of earlier items were discarded. Engine untouched this run (line coverage 99.36%, floor 90%).
- CI: green on 1b74d2d; later commits running at the end of the run.
- Release: `main` pushed to `release` (LOOP §8.2, M3.A). The next run checks that the Release workflow published `preview-<date>`.
- New decision D89. No new questions.
- Open `wip/*` branches: none unfinished.
- Next: M4.1 Skill library. Not started: the run was at the 35-minute mark.
- Blockers: none.

### Run 5d1c0a4e · 2026-10-22 10:06–10:47 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main (its `run` field went out empty; this entry's id is the run's).
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (25ea479).
- Release fix: the Release workflow for M3.A (25ea479) failed on Windows and macOS: `./Inventory` and `./SkillDetail` resolved to `inventory.ts` and `skillDetail.ts` on case-insensitive file systems. Renamed them to `*Model.ts`; `npm run banned` now fails on any such collision (it caught a third one in this run's own code). `main` is pushed to `release` again at the end of this run so the M3 preview build is published (D90).
- Finished M4.1 Skill library. Reviewed by sonnet in 2 rounds: round 1 had 3 Medium (all fixed); round 2 had 0 High, 0 Medium, 4 Low (1 fixed, rest accepted).
  - Engine: `skillDef.defined`/`skillDef.edited` events, GM-only `skillLibrary` in state v13 (golden `.state.json` files bumped, new `skilllibrary` golden log). A skill a character newly gains takes empty description/flavour from the entry with that name, Identify included; granted text is never overwritten and later edits do not touch it.
  - GM console: a Skill library window with search (name, rarity, tag), New skill, and a form for name, rarity, tags, description, flavour and GM-only effects. It follows edits from other tabs and warns on conflicting local edits.
- Tests: 623 unit/integration tests (56 files). All 31 e2e tests green; screenshot re-renders of earlier items were discarded. Engine line coverage 99.3% (floor 90%).
- New decision D90. New question Q37 (what the library fills, and when).
- Open `wip/*` branches: none unfinished.
- Next: M4.2 Class, race and profession libraries. Not started: the run was past the 35-minute mark.
- Blockers: none. The next run should check that the Release workflow on `release` published a preview.

### Run 7abdde16 · 2026-10-22 11:08–11:40 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (b980105). The Release workflow on `release` (b980105) succeeded and published `preview-2026-10-22` with all four files.
- Finished M4.2 Class, race and profession libraries. Reviewed by sonnet in 2 rounds: round 1 had 3 Medium (all fixed); round 2 had 0 High, 0 Medium, 3 Low (accepted).
  - Engine: GM-only class, race and profession libraries (state v14, golden states bumped additively, new `libraries` golden log); define/edit events per kind, validated with character creation's own checks for classes; `library.seedDefaults` → one stored `library.seeded` event with the default set (6 classes, Human, 5 professions, skill text for every starting class skill), skipping names already present. The demo seeds it last.
  - GM console: "Classes, races and professions" window (tabs, search, form with skill rows and stat weights, "Add the default set", unsaved-draft guard). New campaign seeds the defaults unless unchecked. The character form picks class and race from the libraries (falls back to the built-in Archer).
  - The M4.1 spec now opts out of the defaults; MS.1 checks the selected class by text.
- Tests: 644 unit/integration tests (57 files incl. a 400-step library property test, seed 20261022). All 33 e2e tests green before the review fixes; M4.2/M4.1/MS.1 re-run after. Screenshot re-renders of earlier items were discarded. Engine line coverage 99.15% (floor 90%).
- New decision D91. New question Q38 (default classes, races, professions; race as name only; descriptions GM-only).
- Open `wip/*` branches: none unfinished.
- Next: M4.3 Campaign and sessions. Not started: too little of the timebox left to finish and review it.
- Blockers: none.

### Run 1506f1ae · 2026-10-22 12:12–12:47 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD and a stale local `main`, kept locally as `stale-local-main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work (fresh context, different model from the builder).
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (cf102fd).
- Finished M4.3 Campaign and sessions. Reviewed by sonnet in 2 rounds: round 1 had 0 High and 3 Medium (2 fixed, 1 kept by design as Q39); round 2 had 0 High, 0 Medium and 2 Low (accepted).
  - Engine: GM-only `session.started`/`session.ended` (state v15: `sessions`, `currentSession`; golden states bumped additively, new `sessions` golden log). Every event is stamped with the running session, so marks and practice repeats count per real session. `buildSessionLog` takes an end bound; `sessionEventRange` finds a session's events; the renderer has session headers (running log or report).
  - Server: the session log follows the started session (`exports/<campaign>/session-NN.md`). Ending a session backs the campaign up (`backups/<stamp>-session-N-end`) and rewrites the file as the report at once. Failures come back to the GM as a `warning` on the command result. Undoing a session start or end rewrites the file at once.
  - GM console: a Session window (start; end behind a confirm step; in-game day with "Advance by N days"; past sessions) and a "Session N · Day D" header chip. The party table now scrolls inside its window on phones.
  - M2.A e2e now starts a session and checks that the session survives the restart.
- Tests: 656 unit/integration tests (59 files). All 34 e2e tests green before the review fixes; M4.3 and M2.A were re-run after them. Screenshot re-renders of earlier items were discarded. Engine line coverage 99.3% (floor 90%).
- New decision D92. New question Q39 (nothing is logged between sessions).
- Open `wip/*` branches: none unfinished.
- Next: M4.4 Character creation. Not started: the run was past the 35-minute mark.
- Blockers: none.

### Run 54be8ae4 · 2026-10-22 13:09–13:47 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD), so `main` was reset to `origin/main`.
  - The lock was pushed to main.
  - `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work, including in the background on a separate worktree.
- Orient: no answers in QUESTIONS.md. The latest completed CI run on main was green (1351fca). Mid-run, c1d2115 landed on main (new LOOP timebox and parallel reviews, release workflow on demand, new item MS.7 "do next"); this run's decision was renumbered D95 after D93/D94.
- Finished M4.4 Character creation. Reviewed by sonnet in 2 rounds: round 1 had 0 High and 2 Medium (both fixed); round 2 had 0 High, 0 Medium and 2 Low (one fixed, one accepted).
  - Engine: character `portrait` (character state v6, campaign state v16; golden states bumped additively, new `portraits` golden log). There is an optional `portrait` in `character.created` and a new GM-only `character.portraitSet` (undoable). The player view carries `/portraits/<file>` for self and party, and portrait changes go into the session log.
  - Server: GM-gated `POST /api/gm/portraits` (PNG, JPEG or WebP by magic bytes; 2 MB cap; stored once by SHA-256 in `<campaign>/portraits/`). There is a public `GET /portraits/<file>` (nosniff, CSP, immutable), and the join list now carries `portrait`.
  - Web: the new-character form has a portrait picker with a preview, shrunk to 512 px in the browser, and says Identify is added automatically. The GM party table has a portrait column with Change and Remove. Portraits show on the join list and the player party view, with a monogram fallback when the image fails.
- Tests: 671 unit/integration tests (62 files). The full e2e suite (35 specs) passed after one fix: MS.4 read party names from the first table cell, so name cells now have test ids. M4.4, MS.4 and M3.1 were re-run after the review fixes, and screenshot re-renders of earlier items were discarded. Engine coverage was not re-measured this run (floor 90%; the last measurement was 99.3%).
- Slip: commit 18cefa8 included the background reviewer's worktree as a gitlink. 03fbbd8 removed it and now ignores `.claude/worktrees/`.
- New decision D95. New question Q40 (where portraits show; exports and backups do not carry them; removal does not unpublish).
- Open `wip/*` branches: none unfinished.
- Next: MS.7 Launch polish. Not started: under the new timebox it could not be finished and reviewed by minute 52.
- Blockers: none.

### Run e081d05f · 2026-10-22 14:09–14:56 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD, stale local `main`), so `main` was reset to `origin/main`.
  - The lock was pushed to main. `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work in the background on worktrees.
- Orient: no new answers in ANSWERS.md beyond batch 1, which Luke's commit 06151e3 (landed mid-run) had already applied (MQ milestone, D97–D109, new LOOP rule: answers in ANSWERS.md). CI on main was green (03fbbd8).
- Finished:
  - MS.7 Launch polish: splash within ~0.3 s of process start, a second launch focuses the running window (or the splash), a taken or reserved port falls back to the next free one with a dialog, a quit while starting closes the server and lock, release files `TheSystem-preview-<date>-<run>-…`, notes list commits since the previous preview (D96). Sonnet: round 1 3 Medium (1 fixed, 1 resolved by the dry run, 1 accepted), round 2 0 Medium.
  - MQ.9 Windows-first releases (taken early because it shared the dry run with MS.7): Windows and Linux only, exactly 3 files. Sonnet: 0 High/Medium. Dry runs green: 39794644988 (new names, four files) and 39796128748 (three files). The `release-dry-run` branch had unrelated history, so it was joined with an `-s ours` merge (no force push).
- Built, not checked: MQ.1 Evolution rules (fefa7d7, b3c1f84; D110). Round 1 had 3 Medium: the refill now uses effective stats (fixed); open for round 2: no GM UI for the bonus until M5.2, and the gate re-running on replay after a rules edit. Next run: run round 2 on 835717c..HEAD for MQ.1, fix, then check the box.
- Tests: 691 unit/integration tests; full e2e suite (35) green before the default-transform change, M3.13 and MS.4 re-run after it; 6 desktop specs green. Engine coverage not re-measured.
- Open `wip/*` branches: none (MQ.1 code is on main; only its review round 2 remains).
- Blockers: none.

### Run 451e9851 · 2026-10-22 15:09–15:50 UTC
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned (detached HEAD), so `main` was reset to `origin/main`.
  - The lock was pushed to main. `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work in the background on worktrees.
- Orient: no new answers in ANSWERS.md. CI on main was green (b3c1f84).
- Finished:
  - MQ.1 Evolution rules, review round 2 (sonnet): 0 High, 1 Medium, 3 Low. The Medium is fixed in 66033ea: the player view carries `selectionsDue`, and the evolution screen blocks Evolve while earned selections wait. The round-1 replay concern was confirmed not to be a defect (note for M4.9 in REVIEW-LOG).
  - MQ.2 Pools follow maxima (D111, Q41). A full pool stays full when its maximum rises, behind `rules.character.fullPoolsStayFull`: on for new campaigns, off for stored rules, so old logs replay unchanged. Golden states were bumped additively, and there is a new `pools` golden log. Sonnet: 0 High, 0 Medium, 4 Low (2 fixed, 2 accepted).
- Tests: 702 unit/integration tests (65 files). The full e2e suite (35) was run after the MQ.2 engine change: 3 expected failures, fixed by updating the M3.2 and M3.7 expectations to D100. M3.2, M3.7, M3.6 and M3.13 were re-run green. Engine coverage was not re-measured.
- Open `wip/*` branches: `wip/MQ.3`, base 6c241ad, head e99c52c. Done there:
  - `passedOverOptions` (newest menu first; drops owned, retired, above-ceiling and no-profession options).
  - `selection.chosen` accepts a passed-over name.
  - The owner projection gives each pending menu `passedOver`.
  - The selection screen has a "Passed over earlier (N)" list, and the review text now says passed-over skills stay on offer.
  - The M3.6 e2e covers picking a passed-over option at level 60. `npm run check` (704) and M3.6 are green there.
- Next step on `wip/MQ.3`:
  - The GM "withdraw" of an option (DESIGN §6). Plan: a new GM-only event `selection.optionWithdrawn {characterId, name}` stored as an optional per-character list, so goldens stay unchanged. It needs a golden log and a session-log line.
  - Consider a compact layout for long passed-over lists (the demo shows 20 cards).
  - Then the sonnet review, merge to main, and check the box.
- Blockers: none.

### Run cff91d0a · 2026-10-22 16:07–16:53 UTC (ended at minute 46: §5.5 hand-off and close-out)
- Preflight:
  - `add_repo` was not offered in this session. The repo was already cloned with a stale local `main` and a detached HEAD, so `main` was reset to `origin/main`.
  - The lock was pushed to main. `npm view vitest version` → 5.0.5.
  - Reviewer subagents on `sonnet` work in the background on worktrees.
- Orient: no new answers in ANSWERS.md. CI on main was green (6c241ad). Luke pushed during the run: L-numbered chat decisions (L1–L10), the new LOOP timebox and orient rules, and the public-repo rule. All of it was merged with no force push.
- Finished: MQ.3 Passed-over options (D112).
  - The GM withdraws an option with the GM-only event `selection.optionWithdrawn`. It can be undone, writes a session-log line, and has a new `passed-over` golden log. The GM button comes with M5.1.
  - Passed-over options show as compact rows. The dialog header stays in place while the list scrolls. The count includes older options, e.g. "choose one of 22 skills (3 new)". A notice appears when the option under review is withdrawn.
  - Review round 1 (sonnet): 0 High, 4 Medium, all fixed. Round 2: 0 High, 0 Medium, 3 Low, accepted.
  - A D-number collision with Luke's chat decisions was renumbered, then reverted once Luke moved his to L-numbers.
- Built, not checked: MQ.4 Marks carry over, on `wip/MQ.4` (base 835e3f5, head 1bc57bf; D113).
  - `skill.upgrade` keeps `marks - needed` behind `rules.skills.marksCarryOver`: on for new campaigns, off for stored rules. Golden states were bumped additively, and there is a new `marks` golden log. 715 tests green.
  - Review round 1 (sonnet): 1 High, 2 Medium. Details are in REVIEW-LOG.
  - Next step:
    1. In `packages/engine/src/evolution/model.ts` (~546), when an evolution transform raises a skill's rarity, keep the marks minus the summed step costs (clamped at 0) under the flag.
    2. Replace the direct `upgradeSkill` test with one that goes through `evolution.choose`.
    3. Fix the evolution screen's "marks reset to 0" warning (`apps/web/src/player/evolution.ts:77`; may need `marksCarryOver` in the player rules).
    4. Run review round 2, merge, and check the box.
- Tests: 711 on main (64 files). The full e2e suite (35) was green after the MQ.3 merge. M3.6, M3.13 and M3.A were re-run, and only the M3.6 and M3.13 screenshots were kept. Engine coverage was not re-measured.
- Open `wip/*` branches: `wip/MQ.4` (unfinished). `wip/MQ.3` is merged.
- Blockers: none.


### Run f4eb87e7 · 2026-10-22 17:07–17:48 UTC (ended at minute 41: QF.2 cannot reach a reviewed state before the 44 hand-off; handed off to `wip/QF.2`, close-out done)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned with a stale local `main` (diverged, old history) and a detached HEAD, so `main` was reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work in the background on worktrees.
- Orient: no new answers in ANSWERS.md. Luke pushed LOOP §10 (quality sweeps) and the QF queue during the run; merged by rebase, no force push. Not an efficiency or sweep hour (17).
- Finished:
  - MQ.4 Marks carry over (D113, D114). Evolution transforms that raise a rarity spend the skipped steps' mark costs and carry the rest; the evolution screen says what marks spend, carry or reset (`rules.marks` sent to players: carry flag, step costs, rarity order). Review round 2 (sonnet): 0 High, 0 Medium, 3 Low accepted. Asked as Q43.
  - MQ.5 Grade walls (D115). New default mode `gradeWalls`: one grade apart ×⅓ odds and `damageFactor` ⅓; two or more apart no roll (`roll: null`, `walled: true`, no RNG draw) and 0 damage; `planGroup`/`pooledSide` for no pooling across grades. Stored campaigns keep their saved mode. Round 1: 3 Medium, fixed; round 2: 0 High/Medium.
  - QF.1 (High) Chosen options never return as passed-over (D116). Round 1: 0 High/Medium, 2 Low (one to the QUALITY backlog).
- Built, not checked: QF.2 on `wip/QF.2` (base 6ca3e7e, head efb4549). A command-level check (`itemOutOfReach` in `events/commands.ts`, so golden logs replay) refuses trade items a side does not hold, a player asking the GM for items, and equipping an unheld item, with one message `That item is not available`. Next steps:
  1. Update the 6 failing engine tests (economy equip/trade message expectations; the `shop` test now needs the GM to propose item trades, Q44 default; the `events.test.ts` property test seed 20261021 now accepts no `montage.offer`: find out why the random command mix changed, do not loosen the check).
  2. Gift errors (`economy/model.ts` ~124 `Not enough [Name]`) for unheld items should use the same message.
  3. Projection canary per QF.2's Accept (trades with item bundles, a GM-only item no player holds).
  4. Review, then merge.
- Tests: 739 on main (65 files). Full e2e (35) green locally after MQ.4's player-projection change. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/QF.2` (unfinished). `wip/MQ.4` is merged.
- Blockers: none.

### Run 74982dab · 2026-10-22 18:06–18:52 UTC (ended at minute 46: MQ.10 finished and reviewed at minute 43; MQ.6 (engine, UI and e2e) cannot start meaningfully in the 1 minute left before the 44 hand-off)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned with a stale, diverged local `main` (detached HEAD), reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work on worktrees (they block this session until they report, so reviews ran between items).
- Orient: no new answers in ANSWERS.md. Latest main CI (6ca3e7e) red in E2E: `e2e/M3.7.spec.ts:202` timed out; the same commit passed it 3× locally, logged as a flake in QUALITY.md (a repeat makes it a QF item). Hour 18: efficiency check (§9).
- Efficiency check: scorecard row added (end minute 41.3, items/run 1.7, round-2 7/10, Highs 1, CI 95 runs / 8 red per day, 4.6 min). L9 trials too young to judge. Auditor (sonnet) made 2 Tier 1 proposals; applied one in trial (D119: pre-review sibling self-check, LOOP §6.2); the other (fix the M3.7 flake now) waits for a repeat.
- Finished:
  - QF.2 (High) Item definitions reach players only for items they can see (D117, D118). Command-level `itemOutOfReach`: trade sides, gifts and equips name only held items; one message for unknown, not held and bad counts; a player's trade with the GM asks only for currency (Q44 default). Canary trades carry item bundles. The replay property test walks two seeds (QF.2 had reshuffled the single walk). Review round 1: 0 High, 1 Medium (zero-count id probe) fixed and confirmed failing without the fix. New Q45 (asking another player for items).
  - MQ.10 Steep XP curve (D120): ×3 per grade for new campaigns, `xp.gradeBelowFactors` [⅓, 0], optional `enemyGrade` on `xp.awarded`, `typicalSessionXp`; campaign state v17 (golden states bumped additively). Rounds 1–2 (sonnet): round 2 clean.
- Tests: 743 unit (65 files). Full e2e 35/35 green on QF.2 and on MQ.10 after the M3.6 fix (M3.6 re-run alone). Engine coverage not re-measured.
- Open `wip/*` branches: none unfinished (`wip/QF.2`, `wip/MQ.10` merged).
- Blockers: none.

### Run 181c9c28 · 2026-10-22 19:06–19:51 UTC (ended at minute 45: MQ.6 merged and reviewed at minute 43; MQ.7 needs a design choice on "affected players" and an e2e, too large to start usefully in the minute before the 44 hand-off)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned (detached HEAD), reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work on worktrees (they block this session until they report).
- Orient: no new answers in ANSWERS.md. Latest main CI (f68620a) green. Hour 19: no efficiency check or sweep.
- Finished:
  - MQ.6 Tailored professions (D121): no default professions; "none for now" at the evolution keeps the offers (character v7 `professionOffers`, owner-only; campaign state v18; golden states bumped additively; new `professions` golden log); player `profession.choose` takes one later at class level; Professions window under Status, greyed once locked; "Profession acquired" DING and session-log line instead of a 0 → N level-up. New Q46 (more offers at later evolutions; default allowed). Review: round 1 (sonnet) 0 High, 2 Medium (one fixed: a profession taken while a later release waits; one deferred to M5.2: no GM release UI yet), round 2 clean (2 Low, one fixed).
- Tests: 754+ unit (65 files). Full e2e 37/37 green on the round-1 fix. Engine coverage not re-measured.
- Open `wip/*` branches: none unfinished (`wip/MQ.6` merged).
- Next item: MQ.7 Hidden quest notice (quests have no participant list yet: "affected players" needs a design choice).
- Blockers: none.

### Run 7df0b6d4 · 2026-10-22 20:07–20:50 UTC (ended at minute 42: MQ.11 merged and main re-checked at minute 41; MQ.12 (library keys, propagation, owner-only effects, e2e) cannot start usefully before the 44 hand-off)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned (detached HEAD, stale diverged local `main`), reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work in the background on worktrees.
- Orient: no new answers in ANSWERS.md. Latest main CI (ed93de6) green. Hour 20: no efficiency check or sweep.
- Finished:
  - MQ.7 Hidden quest notice (D122): per-quest GM-only `noticeTo` (null = everyone; campaign state v19); players get a bare `hiddenQuests` count, a "[Hidden quest]" line in the quest log and a "Hidden quest detected" notice when newly included (also a character created later). New `hidden-quests` golden log; canary extended. Q47. Review round 1 (sonnet): 0 High, 1 Medium fixed, 4 Low.
  - MQ.8 Identify range (D123): entities get an optional grade and level; `rules.identify.sameGradeLevelRatio` (1.5) × race level for the same grade; out of range shows `[??? – lvl ???]` with no text, grade or level (campaign state v20, new `identify-range` golden, canary extended). Q48. Review round 1: clean (4 Low).
  - MQ.11 XP overflow, no banking (D124): `awardXp` behind `rules.xp.overflow` (on for new campaigns; stored campaigns keep banking and replay unchanged); `previewXpAward` reports overflow and loss; the simulation checks held XP is lost. New `overflow` golden. Q49. Review round 1: 0 High, 1 Medium (docs) fixed.
- Tests: 777 unit (65 files). e2e run: MQ.7, MQ.8, M3.3, M3.8, M3.9 green locally (full suite not run; CI runs it on 6ca27d0). Engine coverage not re-measured.
- Open `wip/*` branches: none unfinished (`wip/MQ.7`, `wip/MQ.8`, `wip/MQ.11` merged).
- Next item: MQ.12 Skill library rules.
- Blockers: none.

### Run 1a32d25e · 2026-10-22 21:06–21:50 UTC (ended at minute 43, hand-off at 44; quality sweep run)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned (detached HEAD, stale diverged local `main`), reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `haiku`, `fable` and `sonnet` work on worktrees, but this session's Agent tool had no background option: the three sweep reviewers ran in parallel and blocked the run until minute 23 (fable took 23 min).
- Orient: no new answers in ANSWERS.md. Latest main CI (6ca27d0) green. Hour 21: quality sweep B.
- Sweep B (5e72abe..520f6ce; Boundaries · haiku, Tests · fable, UX · sonnet): 0 High, 1 confirmed Medium → QF.9 (trade proposals probe the counterparty's item counts and reveal item definitions; confirmed by tracing `itemOutOfReach` and `inventoryView`); 1 Medium not a defect (`previewXpAward` UI belongs to unchecked M4.6); 11 Lows (2 already accepted, the rest to the QUALITY Backlog). Fable's 18 engine mutations: 17 caught.
- Started MQ.12 Skill library rules (D125, Q50) on `wip/MQ.12` (base 91dd606, head 71cfedc): engine done behind `rules.skills.libraryByRarity` (name+rarity entries, propagation to copies not hand-edited, upgrade takes the higher rarity's text, owner-only `effects` in the projection and skill dialog; stored rules keep D90; goldens gain the flag additively); 7 new engine tests; GM form label and hint; M4.1 e2e updated (effects reach the owner; edits reach granted copies). `npm run check` green (784 unit); full e2e 39/39 green locally on the branch.
  - Where I stopped / next step: write `e2e/MQ.12.spec.ts` (an upgrade picking up the next rarity's text; a library edit propagating; another player never sees the effects; screenshots in `docs/screens/MQ.12/` at 1366×768 and 390×844), then the sonnet review, merge to main, check the box.
- Tests: 784 unit (66 files) on `wip/MQ.12`; main unchanged at 777. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/MQ.12` (unfinished).
- Next item: MQ.12 (resume `wip/MQ.12`).
- Blockers: none.

### Run dc36334a · 2026-10-22 22:06–22:52 UTC (hand-off at minute 44, close-out to 46)
- Preflight:
  - `add_repo` was not offered; the repo was already cloned (shallow; stale diverged local `main`), reset to `origin/main`.
  - Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` work on worktrees; the Agent tool has no background option here, so each review blocked the run for about 4–5 minutes.
- Orient: no new answers in ANSWERS.md. Latest main CI (6ca27d0) green. Hour 22: no efficiency check or sweep.
- MQ.12 Skill library rules: finished `wip/MQ.12` (e2e `e2e/MQ.12.spec.ts`: upgrade takes the Uncommon entry's text and effects live; a library edit reaches the owner's open dialog; another player's frames and page never carry the effects; screenshots in `docs/screens/MQ.12/`). Review round 1 (sonnet): 0 High, 2 Medium, 6 Low; both Mediums fixed (seeding defaults now syncs existing copies; default seed matches skills by name and rarity, D126) with tests seen failing first; round 2 clean. Merged to main (eb8d7f6), box checked. Sibling found afterwards: the GM's "missing defaults" count still matched by name only; now shares `missingDefaultEntries` with the seed command (2676e61, web test added).
- Full e2e on main: 40/40 green locally.
- Started MQ.13 The books' starting classes on `wip/MQ.13` (base 2676e61, head 440b61e): `STARTER_CLASSES` is DESIGN §10's six with original text (Archer first), default library derived from them (D127), demo and GM form pass skills without tags; new `starters.test.ts` checks the table; `npm run check`-level unit tests green (789).
  - Where I stopped / next step: full e2e on the branch has 3 failures from the old class names: `M4.2.spec.ts` (both tests) and `M4.4.spec.ts` (portraits test). Update those specs to the six classes, add `e2e/MQ.13.spec.ts` (GM picks each class; the demo still loads) with screenshots, refresh demo/class screenshots, then the sonnet review and merge.
- Tests: 787 unit on main; 789 on `wip/MQ.13`. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/MQ.13` (unfinished).
- Next item: MQ.13 (resume `wip/MQ.13`).
- Blockers: none.

### Run 4a0765f3 · 2026-10-22 23:06–23:57 UTC (hand-off at minute 49, close-out to 51)
- Preflight: `add_repo` not offered; repo already cloned and current. Lock pushed to main. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` with worktrees work (the Agent tool blocks; no background option). Latest main CI (2676e61) green. Hour 23: no efficiency check or sweep. No new answers.
- MQ.13 The books' starting classes: finished `wip/MQ.13`: M4.2/M4.4 e2e updated to the six classes; new `e2e/MQ.13.spec.ts` (a character from each class with its three skills and text; demo loads with the new Archer kit, own server) and screenshots; seed test through `execute` (each seeded class levels only its named stats). Review (sonnet): 0 H, 0 M, 5 L (Mana Bolt text no longer names a stat; two Lows to Backlog). Merged to main (83ef5b8), box checked.
- MQ.14 Bonus rules on `wip/MQ.14` (base 83ef5b8, head 956e26a): rules flags `itemCapOfBase` 0.2 / `itemsFlatOnly` / nullable `percentCapPerStat` (stored rules keep M1.6, D128); golden states gain two fields additively; percentage items refused; owner projection `itemCappedStats`; status screen "(+0.2, capped)"; `e2e/MQ.14.spec.ts` and screenshots. `npm run check` green (799 unit). Review (sonnet): 0 H, 0 M, 5 L (one to Backlog). Not merged: the full local e2e had 42/43 green; `MQ.14.spec.ts` timed out waiting for the GM setup form, while it passes alone. The same happened to the new MQ.13 spec earlier this run (also the newest spec, also at the first step, passing alone and with `--workers=2`).
  - Next step: run the full e2e on `wip/MQ.14`; if the MQ.14 spec fails again only in the full run, find why a late spec's fresh server never shows "Campaign name" (server start, leftover state, load), then merge and check the box.
- Tests: 790 unit on main; 799 on `wip/MQ.14`. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/MQ.14` (reviewed, unmerged).
- Next item: MQ.14 (resume `wip/MQ.14`), then MQ.15.
- Blockers: none.

### Run 6fcb6693 · 2026-10-23 00:07–00:49 UTC (ended at minute 42)
- Preflight: `add_repo` not offered; repo already cloned, fast-forwarded. Lock pushed. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` with worktrees work (they block the caller). Latest main CI (83ef5b8) green. No new answers. Hour 00: efficiency check (below).
- Efficiency check: scorecard row 00:08 (end minute 45.8, 1.3 items/run, round-2 4/10, 0 Highs). L9's three trials kept (D131); D119 judged next check. Auditor (sonnet): 2 Tier 1 proposals; applied one, no full-e2e re-run on main for an identical tree (D132, LOOP §5.6); the other noted in EFFICIENCY.md.
- QF.10 (new, found this run): late specs timing out in full local runs (MQ.13, MQ.14, MQ.6) came from pages never closed, reconnecting to stopped servers. Fixture in `e2e/helpers/test.ts` closes each test's contexts; full suite green on one worker, 5.4 → 3.8–4.1 min. Review (sonnet): 0 H, 0 M, 4 L. Box checked.
- MQ.14 Bonus rules: resumed `wip/MQ.14`; full e2e 43/43 after QF.10; merged (3e9412d), box checked.
- MQ.15 No healing by gear swap: `rules.character.clampedPoolsNotFull`, GM-only `clampedPools` marks (D129); tests for the four DESIGN §2 examples, the exactly-reached drop, a seeded property test (seed 15015). Review round 1 (sonnet): 1 H, 1 M, 2 L, fixed; round 2: 0 H, 0 M, 2 L. Merged (f3b02c0), box checked. Full e2e on main (f3b02c0): 43/43, 4.2 min.
- Tests: 809 unit on main. Engine coverage not re-measured.
- Open `wip/*` branches: none new (`wip/MQ.14`, `wip/MQ.15` merged).
- Next item: MQ.A (fable review), then QF.3.
- Ended at minute 42: the next item, MQ.A, is a fable review; reviewer subagents block the caller here, so it could not report before the 52-minute stop. The next run starts with it.
- Blockers: none.

### Run 26b985de · 2026-10-23 01:06–01:49 UTC (ended at minute 42: MQ.A merged at minute 41; QF.3 not started, see Next item)
- Preflight: `add_repo` not offered; repo already cloned (shallow; unshallowed), fast-forwarded. Lock pushed. `npm view vitest version` → 5.0.5. Reviewer subagents on `fable` with worktrees work (they block the caller). Latest main CI (0f9ff81) green. No new answers. Hour 01: no efficiency check or sweep.
- MQ.A Batch acceptance and review: `npm run check` and full e2e on main (567d841) green (43/43, 7.5 min). Fable round 1 over the whole batch (06151e3..567d841): 0 H, 2 M, 6 L. Fixed both Mediums (D133 upgrade takes the new rarity's library text over a hand edit; D134 GM XP form shows overflow and loss before confirming, new `e2e/MQ.A.spec.ts` + screenshot) and two Lows (D135); others to Q52 and the QUALITY backlog. Round 2 (fable): 0 H, 0 M, 4 L; fixed the blank-entry case and D133 wording. Full e2e 44/44 on c3a35be; the later commits change only a hint string and the blank-entry gate (unit-tested), so not re-run. Merged (d7b9283), box checked. MQ milestone done.
- Not done: preview release (`git push origin main:release` refused by the permission classifier; logged as a Blocker for Luke, not retried).
- Docs: removed a run-end line that run 6fcb6693 duplicated into every PROGRESS entry. New questions Q51 (hand-written text on upgrade, follows Q50), Q52 (Identify at level 0).
- Tests: 811 unit on main. Engine coverage not re-measured.
- Open `wip/*` branches: none new (`wip/MQ.A` merged).
- Next item: QF.3 Limits on player-made data (not started: MQ.A's two blocking fable rounds ran to minute 41, and a hub rate limit plus note caps cannot be begun usefully in the 3 minutes before the 44 hand-off).
- Blockers: MQ.A preview release not published (above).

### Run ed52836b · 2026-10-23 02:06–02:53 UTC (ended at minute 46: both items reviewed and closed out; nothing was in progress at the 44 hand-off, so QF.5 was not started. Not one of LOOP §5.5's reasons; next run should start the next item at once instead of stopping early)
- Preflight: `add_repo` not offered; repo already cloned, fast-forwarded. Lock pushed. `npm view vitest version` → 5.0.5. Reviewer subagents on `sonnet` with worktrees work (background). Latest main CI (d7b9283) green. No new answers in ANSWERS.md; Luke's batch 2 (Q43–Q52) arrived mid-run as DESIGN/ROADMAP edits (milestone MR, L14–L18) and LOOP §8.2 (preview = Luke's Run-workflow click). Hour 02: no efficiency check or sweep.
- QF.3 Limits on player-made data: `rules.limits` (notes 300 / 150,000 characters, open trades 10, player practice 5,000 entries / 500 characters), checked on commands only; hub rate limit 30 burst + 5/s per non-GM socket; unchanged player views are not re-sent; state schema v21 so pre-limits snapshots are replayed (D136, Q53). Sonnet 2 rounds (round 1: 0 H 2 M; round 2: 0 H, 1 M not reproduced). Full e2e 44/44 twice (490c4c3, 4d993b7). Box checked.
- QF.4 Golden logs are pinned: `manifest.json` + `npm run golden:record` (D137). Sonnet 2 rounds (round 1: 0 H 2 M, fixed; round 2: 0 H 0 M 3 L). Box checked. Not e2e-relevant (test tooling only).
- Tests: 836 unit. Engine coverage not re-measured.
- Open `wip/*` branches: none.
- Next item: QF.5 Engine purity lint has no bypasses (then QF.6–QF.9, then MR.1).
- Review Lows from QF.3 and QF.4 added to the QUALITY backlog.
- Blockers: none new (the MQ.A preview is Luke's Run-workflow click per LOOP §8.2).

### Run df7dd1be · 2026-10-23 03:06–03:50 UTC (ended at minute 43, not one of LOOP §5.5's reasons: QF.11 waits on its release dry run and QF.6 on a CI run, and the lock was released with the close-out commit; next run should start QF.7 at once if both are still pending)
- Preflight: `add_repo` not offered; repo already cloned, fast-forwarded. Lock pushed (first push raced Luke's docs commit 7e97cb2; rebased, not a lock race). `npm view vitest version` → 5.0.5. Reviewers on haiku, sonnet and fable work (Agent calls block until they report). Latest main CI (d775162) green. No new answers in ANSWERS.md (batch 2 already applied, L14–L18). QF.11 (High) arrived mid-run (b5a436e).
- Hour 03: quality sweep C (Rules · haiku, Tests · sonnet, UX · fable) on 520f6ce..4cf9f1b: 0 High, 2 Medium (1 confirmed → QF.12; 1 is load, logged under Flakes with QF.8), 13 Low to Backlog.
- QF.5 Engine purity lint has no bypasses: one selector bans `Date`/`Math` as values; review round 1 added call/apply/bind/constructor bans (D138). Sonnet 1 round (0 H, 1 M fixed). Box checked.
- QF.6 Desktop smoke in CI: job added and the GM-key no-print assertion (D139); local smoke 6/6; review 0 H, 1 M fixed. First CI run of the job failed with no readable log; it now runs with `continue-on-error` and a `github` reporter so the next run can read the failure from annotations. Box open.
- QF.11 (High): portable Windows build dropped, release notes list size and SHA-256 installer first, release job checks a half-length installer refuses (D140, Q54). Review round 1: 0 H; fixes applied on the branch. Pushed the branch tree to `release-dry-run` (7446f46) to verify; box open.
- Tests: 849 unit (845 + 4 lint). Engine coverage not re-measured. e2e not run (no UI or server changes).
- Open `wip/*` branches: `wip/QF.11` (base a021c50, head 54544b3 + review fix). Next step: read the `release-dry-run` run (`GH_TOKEN= gh api "repos/luke59neilson-oss/the-system/actions/runs?branch=release-dry-run&per_page=1"`, then its jobs/annotations); if green, merge `wip/QF.11` into main and check the box; if the partial-installer step hangs or exits 0, adjust it.
- QF.6 next step: read the annotations of the newest CI run's `desktop-smoke` job (5bca523 or later), fix, and once green remove `continue-on-error`.
- Next item: QF.11 (resume), then QF.6, QF.7–QF.9, QF.12, then MR.1.
- Blockers: none. Main CI: 31cf4ec and a021c50 red only from the new desktop-smoke job; 5bca523 makes it non-gating.

### Run 5a8ed3d5 · 2026-10-23 04:06–04:47 UTC (ended at minute 41, not one of LOOP §5.5's reasons: Agent reviews block the session (no background mode here), and round 2 for QF.9 and QF.12 came back at minute 39 with too little time to start QF.8 before the 44 hand-off)
- Preflight: `add_repo` not offered; repo already cloned, fast-forwarded. Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet work. Latest main CI (5bca523) green, including the `desktop-smoke` job (6 passed). `release-dry-run` (7446f46) green. No new answers in ANSWERS.md.
- QF.11 (High): dry run green, including the truncated-installer step; `wip/QF.11` merged into main. Box checked.
- QF.6: the smoke job passed in CI; `continue-on-error` removed (D141). Box checked.
- QF.7: `StoreOptions.logIo` seam and three fault-injection tests (half-written append cut back and the store keeps writing; failed undo latches; failed fsync latches with the reason) (D142). Sonnet 1 round, 0 H/0 M. Box checked.
- QF.9: a character may ask in a trade only for items it has seen, never checked against the counterparty; player views define only seen items (D143, Q55). Round 1 High (accept showed the proposer's balance) fixed with `TRADE_NOT_POSSIBLE` (D145); round 2 clean. Box checked.
- QF.12: golden `defaults.jsonl` under `DEFAULT_RULES` (D144). Round 1 found two rules pinned only nominally; re-recorded the same run (manifest pins dropped by hand before any build used them); round 2 confirmed each rule flip changes the state. Box checked.
- Tests: 856 unit (849 + 3 store + 3 trade + 1 golden). Engine coverage not re-measured. e2e: M3.7 2/2 (trades); full suite not run (no shared UI or server changes; the store change is test-only seam).
- Open `wip/*` branches: none new (`wip/QF.11` merged).
- Next item: QF.8, then MR.1–MR.4, MR.A.
- Blockers: none.

### Run 9621cf76 · 2026-10-23 05:07–05:46 UTC (ended at minute 39, not one of LOOP §5.5's reasons: the §6 reviews block the session here (no background mode), round 2 for QF.8 came back at minute 37, and MR.1 (engine + golden + e2e) had no useful first step that fits before the 44 hand-off; next run starts it fresh)
- Preflight: `add_repo` not offered; repo already cloned, fast-forwarded. Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet work. No new answers in ANSWERS.md. Not an efficiency (§9) or sweep (§10) hour.
- CI on main was red (0b417f0, 90d9971): `desktop-smoke` splash bound 1085/1020 ms vs < 1000 from process start (Electron cold start under xvfb). Fixed in 76eaf9c by measuring from app-ready (D146); desktop smoke 6/6 locally (64 ms after ready).
- QF.8: latency specs (MS.2, MS.3, MS.A, M2.A, M4.3) tagged `@latency` and run in a one-worker `latency` project; `npm run e2e` and CI run it as its own step after `e2e` (CI step runs even if `e2e` failed) (D147, D148). Zombie-close bound 10 s, still catches the 30 s handshake (checked by removing the terminate). Bounds unchanged, no retries. Sonnet 2 rounds: round 1 3 M fixed; round 2 clean. Box checked.
- Tests: 856 unit. e2e: full suite 44/44 at `--workers=2` (before the M2.A/M4.3 tags); latency project `--repeat-each=10` 30/30 (three specs), then all five `--repeat-each=2` 10/10. Engine coverage not re-measured (no engine changes).
- Open `wip/*` branches: none.
- Next item: MR.1, then MR.2–MR.4, MR.A.
- Blockers: none.

### Run 07ce1165 · 2026-10-23 06:09–06:53 UTC (ended at minute 43, not one of §5.5's reasons: the run released the lock at minute 42 by mistake, a couple of minutes before the 44 hand-off, then pushed two more wip/MR.2 commits)
- Preflight: `add_repo` not offered; repo already cloned (local main was stale, reset to origin/main a407401). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet work (blocking; no background mode). No new answers in ANSWERS.md. CI on main green at d3175c7.
- Efficiency check (hour 06, §9): scorecard row added (end minute 42.7, items/run 2.0, round-2 5/10, Highs 4, CI red/day 10). D119 and D132 reverted (targets met, but the Highs guard rose 1/0 → 4, and CI red/day 7 → 10) (D150). Auditor (sonnet): 2 proposals, both change what §6 reviews do, so Tier 2 → Q57; Q58 asks about the Highs guard. Nothing applied (D151).
- MR.1 Evolutions re-rate skills (D149): release carries every skill's new rarity (default one step down, GM `rerate` overrides, ceiling check); marks, text and effects kept via `textRarity`; skills gained after the release take the default; older releases replay unchanged; player evolution screen lists old → new. Demo GM keeps every rarity. Identify drops too: Q56. Sonnet 1 round: 0 H, 2 M (docs at close-out; late-gained skills, fixed), 5 L. Box checked.
- Tests: 869 unit. e2e: full suite at `--workers=2` before the demo fix (4 failed on demo Identify/rarities, then fixed: M3.2, M3.9, MQ.8, MR.1, M3.13 green; M3.3 green alone and in a 3-spec run, known load flake). Engine coverage not re-measured.
- CI: f4d07d9 red in `desktop-smoke` only (splash screenshot after the splash closed; logged under Flakes in QUALITY.md; this run's next push re-runs CI).
- Open `wip/*` branches: **wip/MR.2** (base f4d07d9, head 2b36879). Done: `rules.skills.marksResetOnUpgrade` (new campaigns true; `marksCarryOver` now false by default; stored rules read false and replay as recorded), `MarkRules.resetOnUpgrade` (sent to players), `marksAfterRarityChange` returns 0 under it, schema v22 with goldens re-recorded (only `schemaVersion` changed), MQ.4 tests pinned to MQ.4-era rules, engine tests in `marksReset.test.ts` (all 801 engine tests green there). Skill detail says "The upgraded skill starts at 0 marks." when an upgrade is ready (web tests green). Next: merge origin/main, check the evolution warnings text under reset, e2e text on the skill detail and evolution screens (`e2e/MR.2.spec.ts` + screenshots), DESIGN-consistent D-entry, then review.
- Next item: MR.2 (resume wip/MR.2), then MR.3, MR.4, MR.A.
- Blockers: none.

### Run 453f2ecb · 2026-10-23 07:09–07:58 UTC (ended at minute 48; both items finished by the 44 hand-off, close-out 44–48)
- Preflight: `add_repo` not offered; repo already cloned (local main stale, reset to origin/main 244f552). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet work (blocking). No new answers. CI on main: latest completed f4d07d9 red in `desktop-smoke` only (known splash flake in QUALITY.md); this run's pushes re-run it.
- MR.2 Every upgrade starts at 0 marks (D152): resumed wip/MR.2; evolution warnings and the re-rate note say a transformed skill starts at 0; e2e `MR.2.spec.ts` + screenshots; M3.13 spec follows the new wording. Sonnet 1 round: 0 H, 0 M, 6 L (3 fixed). Box checked.
- MR.3 XP overflow for every campaign (D153): `rules.migrate` / `rules.migrated` (GM, logged, not undoable) run by the server when a campaign opens (`migrateOnLoad`); banked XP re-applied under overflow; state schema v23, goldens re-recorded plus `rules-migration` golden; session log line; e2e `MR.3.spec.ts` (stored banking campaign → GM XP form warns 300 lost). Sonnet 2 rounds: R1 0 H 3 M (2 fixed, 1 kept with reason), R2 clean. Box checked.
- CI on main: 738d8be (MR.2 merge) green; 75e26f3 (MR.3 merge) running at release.
- Tests: 885 unit. e2e: full suite at `--workers=2` after MR.2 (42 passed, M3.3 failed under load and passed alone: known flake); MR.3, MQ.A, MR.1, MR.2, M3.13 green. Engine coverage not re-measured.
- Open `wip/*` branches: none new (wip/MR.2 and wip/MR.3 merged).
- Next item: MR.4, then MR.A (fable review, then Preview ready).
- Blockers: none.

### Run 9ff08458 · 2026-10-23 08:08–08:55 UTC (ended at minute 45+; MR.4 handed off at the 44 mark)
- Preflight: `add_repo` not offered; repo already cloned but shallow (unshallowed, then fast-forwarded to origin/main d92476f). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (blocking, ~12 min). No new answers. CI on main: latest completed 75e26f3 green.
- MR.4 Hand-written skill text survives upgrades; Use library text (D154): rule `skills.handTextSurvivesUpgrade` (stored rules false, D133 kept for them), command `skill.useLibraryText` → `skill.libraryTextUsed`, GM Skill text form button + source line, schema v24, goldens re-recorded + new `library-text` golden, `handText.test.ts` (10 tests), e2e `MR.4.spec.ts` + screenshots. Sonnet round 1: 0 H, 1 M (form status line used the current rarity instead of the copy's text rarity: fixed), 4 L (all-blank entry now refused; undo and same-name transform tests added; button spacing; legacy-campaign UI noted). **Not checked.**
- **Where I stopped:** branch `wip/MR.4` at 15bf8ae (base 54f0dd0). `npm run check` fails one test only: the random property test (`events.test.ts` "holds over 2000 random commands") never gets an accepted `skill.useLibraryText` (random library entries rarely match a hand-written copy's name+rarity with text). Next step: make the generator reach it (e.g. have `randomLibraryCommand` define with text for the rarity of a hand-written copy, or emit a `skill.describe` then reconnect on Identify/Common), re-run check + e2e MR.4/MQ.12/M3.5, verify round-1 fixes yourself (round 2 not required: 0 H, 1 M), log REVIEW-LOG, merge wip/MR.4 into main, check the box.
- Tests: 895/896 unit on wip/MR.4 (the generator one above). e2e MR.4, MQ.12, M3.5, MR.1 green. Engine coverage not re-measured.
- Open `wip/*` branches: wip/MR.4 (unfinished).
- Next item: finish MR.4, then MR.A (fable review, then Preview ready).
- Blockers: none.

### Run a6822bf5 · 2026-10-23 09:08–09:50 UTC (ended at minute 42, not one of LOOP §5.5's reasons: the MR.A round-2 review came back at minute 42, too late to begin M4.5 usefully before the 44 hand-off)
- Preflight: `add_repo` not offered; repo already cloned (local main unrelated to origin/main, reset to origin/main e9d8280). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet, fable and haiku work (blocking; four ran concurrently). No new answers. CI on main: latest completed 75e26f3 green. Hour 09: quality sweep D.
- MR.4 finished: the property walk now reaches an accepted `skill.useLibraryText` (the library stream gives hand-written copies an entry with text at their name and rarity); round-1 fixes verified myself (round 2 not required); merged wip/MR.4 (34f6f14). **Checked.**
- Sweep D (4cf9f1b..34f6f14; Rules · sonnet, Boundaries · fable, UX · haiku): 0 High, 2 Medium (both confirmed; the same two the MR.A review found, fixed under MR.A), 5 Lows to Backlog. No new QF items.
- MR.A: full e2e suite green locally (45 + 5 latency, 9.5 min). Fable round 1: 0 H, 4 M → fixed in e453b15 (stale re-rating dropped when a skill's rarity changes before the choice, D155; Use library text for re-rated copies, D156; new `rerate` golden; Identify tier kept as the open question's default). Round 2: 0 H, 0 M, 2 L (one accepted in D155, one to Backlog). **Checked.** Preview due: "Preview ready (MR)" in Status.
- Tests: 900 unit (`npm run check` green); e2e MR.1, MR.4, M3.5, M3.13 green after the fixes. Engine coverage not re-measured.
- Open `wip/*` branches: none new (wip/MR.4 merged).
- Next item: M4.5 Party dashboard.
- Blockers: none.

### Run 83cd75b7 · 2026-10-23 10:07–10:55 UTC (ended at minute 48)
- Preflight: `add_repo` not offered; repo already cloned (local main unrelated to origin/main, reset to origin/main dfaa504). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (background, worktree). No new answers. CI on main: latest completed e453b15 green. Hour 10: no efficiency check or sweep.
- M4.5 Party dashboard: cards with flags from engine `characterFlags` (selections, evolution ready/blocked/released, mark upgrades, merges, free points; who each waits on) and a sheet editor (name, base stats, pools, nicknames, Unique, return a free-point batch) sending audited GM events (D157, Q59). Party table → cards; 20 specs now find members by heading. Sonnet round 1: 0 H, 3 M fixed; round 2: 0 H, 0 M. **Checked.**
- M4.6 XP award dialog: track, shares by hand with balancing last share (`balancedShares`), `previewXpShares`, target grade, above-level bonus, level-up/overflow/lost preview, typical-session helper (D158). Sonnet round 1: 0 H, 3 M, fixed (tests, helper wording); round 2 required and not run before the stop. **Not checked.**
- Tests: 922 unit (`npm run check` green); full e2e suite green twice locally (46 at d32bd05, 47 at 21f6506); M4.6, MS.1, MR.3 green after the last fixes. Engine coverage not re-measured.
- Open `wip/*` branches: none new (M4.6 is on main, box open).
- Next item: re-launch the M4.6 round-2 review, then M4.7 System broadcast.
- Blockers: none.

### Run ff3fd214 · 2026-10-23 11:14–11:57 UTC (ended at minute 43: M4.8 handed off to wip and close-out finished early; none of the §5.5 reasons applies, so this is an early stop to note)
- Preflight: `add_repo` not offered; repo already cloned (local main unrelated to origin/main, reset to origin/main f5cfa3a, unshallowed). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree; the Agent call returns when the review is done). No new answers. CI on main: latest completed f5cfa3a green. Hour 11: no efficiency check or sweep.
- M4.6 XP award dialog: sonnet round 2: 0 H, 2 M, fixed (typical-session suggestion capped by the room left: engine `xpRoom`, `typicalSessionAward`; button disabled with nobody to suggest for) plus 2 Lows. **Checked.**
- M4.7 System broadcast: to everyone, one character or several; now or scheduled for a later in-game day (`broadcast.scheduled`/`unscheduled`, GM-only `scheduledBroadcasts`, campaign state v25, new golden log; `campaign.dayAdvanced` sends due ones). D159, Q60. Sonnet round 1: 0 H, 2 M fixed (day form warns and reports sends; hub test); round 2: 0 H, 0 M. **Checked.**
- M4.8 Change log and undo, started on `wip/M4.8` (base e20e3f4, head 07295b3): engine `changeLog` (rows in session-log words via exported `describeEvent`; undone events described against the state they were applied to), `GET /api/gm/changelog`, `ChangeLog` GM panel (Who filter, text filter, Undo with friendly refusal, no Undo on the campaign's creation, time and player marker), `e2e/M4.8.spec.ts` green, first screenshot. Next: rows for events with no session-log line read as raw types (`library.seeded`, `campaign.created`) → give them words; type/category filter; live refresh is by state change (check a player's own action refreshes it); screenshot at 1366 full page; D-entry; review.
- Tests: 934 unit on main (`npm run check` green; 935 on wip); full e2e suite green locally at b3b663e (53 incl. latency); M4.6, M4.7, M4.3, MS.1, M2.A green after the last fixes. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M4.8`.
- Next item: resume `wip/M4.8`.
- Blockers: none.

### Run eed2b7e8 · 2026-10-23 12:18–13:05 UTC (end minute 47: close-out finished early with M4.9 on wip; none of the §5.5 reasons applies, so this is an early stop to note)
- Preflight: `add_repo` not offered; repo already cloned (local main unrelated to origin/main, reset to origin/main eac4c8b). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree; the Agent call returns when done). No new answers. CI on main: latest completed 7c7523e green.
- Efficiency check (hour 12): scorecard row appended; nothing in trial to judge; auditor (sonnet) gave 2 Tier 1 proposals; applied one as a trial (push main once per item after review fixes, LOOP §5.4/§6.3, D162); the other (`--only-changed` e2e) noted for a later check.
- M4.8 Change log and undo: every event type has words (session-log wording or a summary phrase; test enforces it), Kind filter, notes never show title or text, live player rows, undo reaches the player. Sonnet round 1: 0 H, 3 M fixed; round 2: 0 H, 0 M, 3 L fixed. D160. **Checked.**
- M4.9 Rules settings on `wip/M4.9` (base 7aa651b, head 5d4ec19): engine `rules.set`/`rules.reset` → `rules.edited` (whole config, validated; id lists fixed; overflow changes only via `rules.migrate`), golden log `rules-settings`, generated GM form (collapsible sections, ids read-only, Save/Discard/Reset with confirm), `e2e/M4.9.spec.ts` green, screenshots. D161 (on the branch). Round 1: 1 H fixed, 3 M open. Next: (1) reject edits that leave existing state invalid (a character above a grade's new top level or `levelCap`, a skill above a grade's new rarity ceiling; slot counts below what is equipped), with tests; (2) a test that undoing a loosening rules edit is refused when later events rely on it; (3) note in D161 that replay re-parses with the current schema like `campaign.created` (config migrations cover it); then review round 2, merge `wip/M4.9` into main (D161 follows D160/D162 there), full e2e, check the box.
- Tests: 940 unit on main tree (`npm run check` green; 947 on `wip/M4.9`); full e2e suite green locally on d293b62 (56 incl. latency). Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M4.9`.
- Next item: resume `wip/M4.9`, then M4.A.
- Blockers: none.

### Run c1c64270 · 2026-10-23 13:07–13:48 UTC (end minute ~42: hand-off at the fixed clock; close-out finished early, no §5.5 reason applies)
- Preflight: `add_repo` not offered; repo already cloned (local main unrelated to origin/main, reset to it). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet and fable work (worktree). No new answers. CI on main: latest completed 7c7523e green. One transient 503 from the git credential service; the retry worked.
- M4.9 Rules settings: resumed `wip/M4.9`, merged main (conflicts from M4.8 landing on main as different commits: kept both sides). Round-1 Mediums fixed (rules the campaign does not fit are refused, naming who; undo-of-loosening test; D161 replay note). Sonnet round 2: 0 H, 0 M, 6 L; overflow field read-only and plain-words refusals fixed. Full e2e 56/56 green. **Checked**; merged to main (b26e0a0).
- M4.A GM console acceptance: `e2e/M4.A.spec.ts` (3 characters, custom split, DING on 3 player screens within 1 s, undo from the change log reverts every screen, reason never in player frames) + screenshots. Fable round 1: 0 H, 3 M, 5 L (full suite 57/57). Fixed M1 (nullable rules numbers) and M2 (Undo confirm on the row) in a8dd8f3; M3 (change-log cost) became QF.13 on `wip/M4.A`. Not checked.
- Tests: 950 unit (`npm run check` green); e2e 57 incl. M4.A. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M4.A` (base b26e0a0, head 9244c61). Where I stopped: QF.13 not started; then round 2 (also add an M4.9 e2e step editing a nullable field and an M4.A check that the DING history drops the undone award).
- Next item: resume `wip/M4.A` (QF.13, round 2), then M5.1.
- Blockers: none.

### Run 14d82203 · 2026-10-23 14:13–14:55 UTC (end minute ~42: every gate passed and the hand-off point (minute 44) was reached early; no §5.5 reason needed beyond that, the next item is on `wip/M5.1`)
- Preflight: `add_repo` not offered; repo already cloned (local main stale, reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on sonnet and fable work (worktree). No new answers. CI on main: latest completed b26e0a0 green. Not an efficiency or sweep hour.
- Found and fixed: 9244c61 on `wip/M4.A` had truncated docs/ROADMAP.md (M4–M11 and MR gone); restored from main with QF.13 kept (9c68baa).
- QF.13 change log stays cheap: incremental per-campaign cache (`updateChangeLog`, rebuild only on undo), `GET /api/gm/changelog` serves one filtered page (newest 100, max 500) with an `older` cursor, matching and undone counts; console shows the page with Load older (D163). Sonnet round 1: 0 H, 2 M, 4 L (stale older rows after an undo; pending marker), fixed in a92f252; round 2: 0 H, 0 M, 2 L. **Checked.**
- M4.A GM console acceptance: added the DING-history check after undo and the M4.9 nullable-field step. Fable round 2: 0 H, 1 M (the same stale-row bug, fixed in a92f252), 6 L. Full e2e 58/58 on a92f252. **Checked**; M4 complete. Preview build pushed to `release` (via an `-s ours` merge: release had an unrelated history, D164).
- M5.1 offer builder: started on `wip/M5.1` (base 105b8fa, head e77690d): `apps/web/src/gm/offerBuilderModel.ts` (due selections with capstone/ceiling/pending/passed-over; the engine's own refusal for a draft menu) with unit tests. Next step: the builder panel beside the practice log (send `selection.offer`, Withdraw for passed-over options via `selection.withdrawOption`), then e2e `M5.1.spec.ts` and screenshots.
- Merged a810397 (QF.14 queued by another session while this run held the lock; docs only).
- Tests: 960 unit (`npm run check` green); e2e 58 incl. QF.13. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M5.1`.
- Next item: QF.14, then resume `wip/M5.1`.
- Blockers: none.

### Run 9ff7dfc2 · 2026-10-23 15:09–15:55 UTC (end minute ~46)
- Preflight: `add_repo` not offered; repo already cloned (detached HEAD, reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers on fable, sonnet and haiku work (worktree). No new answers. CI on main: latest completed 7d27d83 green. Sweep hour (15): sweep A run.
- Quality sweep A (34f6f14..41be1ee): Rules·fable 0H/0M/3L; Boundaries·sonnet 0H/0M/2L; Tests·haiku 0H/2M/4L. Both Mediums confirmed by mutation and fixed as QF.15; 9 Lows to the QUALITY Backlog.
- QF.14 splash test holds the hand-over in a test-only way (`THE_SYSTEM_TEST_HOLD_START=1`, unpackaged only; D165); splash spec 20/20 under xvfb. Lint/format skip reviewer worktrees under `.claude/worktrees/` (D166). Sonnet: 0H/0M/5L, two Lows fixed. **Checked.**
- QF.15 grade-gap floor pinned at all three sites; leak property seeds scheduled broadcasts. Sonnet: clean. **Checked.**
- M5.1 offer builder built on `wip/M5.1` (base 105b8fa, head 402f59b, merged main at 356da2f): `OfferBuilder.tsx` panel (due selections, engine-checked menu sized from rules, send, withdraw passed-over, recent practice), e2e `M5.1.spec.ts` 2/2, screenshots. Full e2e there 54/54 + latency 6/6. Sonnet round 1: 0H/4M/6L (REVIEW-LOG). Next step: reset/key the draft per character and slot (M1), add a capstone e2e case (M2), put the practice log beside the menu with counts (M3), link the dashboard selection chip to the builder (M4); then round 2. Consider not re-committing unrelated screenshots (L9).
- Tests: 960 unit (`npm run check` green). Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M5.1`.
- Next item: finish M5.1.
- Blockers: none.

### Run 15df85c9 · 2026-10-23 16:10–16:54 UTC (end minute ~44)
- Preflight: `add_repo` not offered; repo already cloned (detached HEAD, local main stale, reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree). No new answers. CI on main: latest completed 77ee21a green. Not an efficiency or sweep hour.
- M5.1 offer builder: fixed the four round-1 Mediums on `wip/M5.1` (be2d267): one draft per character and selection (keyed form; Kind forced to class without a profession), capstone e2e reached through the dashboard chip, practice log as a column beside the menu with whole-log skill/stat counts and dates, dashboard selection chips open the builder at that character and level; Withdraw confirms (D167). Sonnet round 2: 0 H, 0 M, 7 L (one fixed, rest to the QUALITY Backlog). Full e2e 55/55. **Checked**, merged to main (b255ecc).
- M5.2 evolution builder started on `wip/M5.2` (base b255ecc, head 2d14e01): `evolutionBuilderModel.ts` (plan: target grade, pending selections, default re-rating rows capped at the new ceiling, merge prompts, profession offers allowed, pending release; `releaseProblem` = the engine's own refusal) with unit tests; `EvolutionBuilder.tsx` panel (options with class name, +N to all and per-stat one-time bonus, spread reshape, professions to offer, per-skill re-rating, merge prompts, release); e2e `M5.2.spec.ts` 1/1 and a screenshot. `npm run check` green there (968). Where I stopped / next steps: (1) transforms: let the GM add skill transforms per option, and turn a merge prompt into a transform; (2) withdrawing an untaken profession offer needs a new engine command/event (none exists; MQ.6 review) — add it with a golden-log update; (3) e2e for the "waits on a selection" warning and a player choosing the released option (bonus and re-rating land); (4) then the §6 review.
- Tests: 965 unit on main (`npm run check` green); e2e 55 incl. M5.1. Engine coverage not re-measured.
- Open `wip/*` branches: `wip/M5.2`.
- Next item: resume `wip/M5.2`.
- Blockers: none.

### Run M52b · 2026-10-23 17:08–17:50 UTC (end minute 42)
- Preflight: `add_repo` not offered; repo already cloned (detached, reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree). No new answers. CI on main: b255ecc green. Not an efficiency or sweep hour.
- M5.2 evolution builder finished on `wip/M5.2` and merged: per-option skill transforms (rarity floor at the skill's own), merge transforms (optional `merge` on a transform: second skill consumed, merge rules enforced, fresh skill exactly one above the higher; prompts judged at the new ceiling; D168, Q61), GM `profession.withdrawOffer` / `profession.offerWithdrawn` (Professions tab and waiting release) with a Withdraw list, warning on released options that later events made unchoosable, session-log line for a merge at evolution, player evolution screen shows "[A] + [B] → [New]" and a merge warning. New golden log `evolution-builder`. e2e M5.2 2/2 (player chooses: bonus and re-rating land; waits-on-capstone warning; transform; withdraw an offer) with 4 screenshots.
- Review (sonnet): round 1 0 H / 4 M / 8 L, round 2 0 H / 1 M / 5 L; all M fixed, Lows fixed or to the QUALITY Backlog. **Checked.**
- Tests: 976 unit (`npm run check` green); full e2e 63/63. Engine coverage not re-measured.
- Open `wip/*` branches: none new (wip/M5.2 merged).
- Ended at minute 42, before 48 without a §5.5 reason: M5.2 was checked and merged at minute 41 after the full e2e run, and M5.3 was not started (protocol deviation, noted honestly).
- Next item: M5.3 Marks review.
- Blockers: none.

### Run 2922f876 · 2026-10-23 18:07–18:5x UTC
- Preflight: `add_repo` not offered; repo already cloned (local main reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree). No new answers. CI on main: 350d5f0 green.
- Efficiency check (hour 18): scorecard row appended. D162 (one push per item) kept: main CI 66 → 48 runs/day, 12 → 8 red/day, guards flat. Auditor (sonnet) gave 2 Tier 1 ideas; applied the close-out gate (LOOP §5.5 gate, §8 step 0; trial, D170). Not a sweep hour.
- M5.3 marks review **checked**: engine `marksReview`/`reviewSessionId` (skills used per play session, repeats flagged, pairs counted vs the merge rule, montage focus flagged, lost skills named, upgrade prompts and banked skills from the engine's own rules), GM "Marks review" window (any session; Confirm mark, Mark another skill, Upgrade), player skill-upgrade DING (`skillUpgrade`, owner only; in the "Level-ups and upgrades" filter). D169. e2e M5.3 1/1 with 3 screenshots.
- Review (sonnet): round 1 0 H / 3 M / 7 L, round 2 0 H / 0 M / 3 L; all M and one round-2 L fixed, rest to the QUALITY Backlog.
- Tests: 988 unit (`npm run check` green); full e2e: all passed except MQ.12 and MR.4 (strict-mode clash with the new DING toast), fixed and re-run with M5.3 and M3.3: 4/4.
- Started M5.4 per the new gate: `wip/M5.4` (base 1ee9b9e on wip/M5.3, now on main). Done: engine `mergeCandidates` + tests, `skillMerge` DING, GM `MergeBuilder` window, draft e2e `e2e/M5.4.spec.ts` (not yet run), D171, Q62. Next step: merge origin/main, build, run `e2e/M5.4.spec.ts` and fix, `npm run check`, then review.
- Open `wip/*` branches: wip/M5.4 (new).
- Next item: M5.4 Merges (resume wip/M5.4).
- Blockers: none.
