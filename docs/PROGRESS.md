# Progress

**Status:** in progress: M0, MS, M1, M2 and M3 done; M4 under way (M4.1–M4.3 done)
**Next item:** M4.4 Character creation
**Blockers:** none.

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

### Run 1506f1ae · 2026-10-22 12:12–12:50 UTC
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
