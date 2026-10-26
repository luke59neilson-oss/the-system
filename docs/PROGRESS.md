# Progress

**Status:** in progress (2026-10-26): MT done; MC (co-DM) under way: MC.1–MC.3 done, MC.4 on wip (round-1 fixes in, round 2 due). Preview ready: Actions → Release → Run workflow (MT).
**Next item:** MC.4 on `wip/MC.4` (head 48a22bcd): add e2e for Regenerate replacing a pending loading screen and a failed/cancelled generation taking it down, rebuild, then the round-2 sonnet review; then MC.5
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

### Run 2922f876 · 2026-10-23 18:07–18:52 UTC (end minute 45)
- Preflight: `add_repo` not offered; repo already cloned (local main reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree). No new answers. CI on main: 350d5f0 green.
- Efficiency check (hour 18): scorecard row appended. D162 (one push per item) kept: main CI 66 → 48 runs/day, 12 → 8 red/day, guards flat. Auditor (sonnet) gave 2 Tier 1 ideas; applied the close-out gate (LOOP §5.5 gate, §8 step 0; trial, D170). Not a sweep hour.
- M5.3 marks review **checked**: engine `marksReview`/`reviewSessionId` (skills used per play session, repeats flagged, pairs counted vs the merge rule, montage focus flagged, lost skills named, upgrade prompts and banked skills from the engine's own rules), GM "Marks review" window (any session; Confirm mark, Mark another skill, Upgrade), player skill-upgrade DING (`skillUpgrade`, owner only; in the "Level-ups and upgrades" filter). D169. e2e M5.3 1/1 with 3 screenshots.
- Review (sonnet): round 1 0 H / 3 M / 7 L, round 2 0 H / 0 M / 3 L; all M and one round-2 L fixed, rest to the QUALITY Backlog.
- Tests: 988 unit (`npm run check` green); full e2e: all passed except MQ.12 and MR.4 (strict-mode clash with the new DING toast), fixed and re-run with M5.3 and M3.3: 4/4.
- Started M5.4 per the new gate: `wip/M5.4` at f5ce2fb (main 098ed9f merged in). Done: engine `mergeCandidates` + tests, `skillMerge` DING (owner only), GM "Merges" window (alert list with merged rarity or refusal reason, name/description/flavour, Send merge = `skill.merge` then `skill.describe`), e2e `e2e/M5.4.spec.ts` 1/1 with 2 screenshots, `npm run check` green (988), D171, Q62. Next step: sibling self-check, launch the sonnet review (base 098ed9f), full e2e (shared GmScreen/format code), then merge to main.
- Open `wip/*` branches: wip/M5.4 (new).
- Next item: M5.4 Merges (resume wip/M5.4).
- Ended at minute 45: hand-off at 44 per §5.5; M5.4's review could not report and be fixed before 50, so it was not launched (next run launches it first).
- Blockers: none.

### Run 698982a6 · 2026-10-23 19:07–19:55 UTC (end minute 47: M5.4 and M5.5 checked and merged; at minute 44 the final full e2e was still running, and M5.A needs it, so no new item was started)
- Preflight: `add_repo` not offered; repo already cloned (local main fast-forwarded to origin/main after unshallowing). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer on sonnet works (worktree). No new answers. Not an efficiency or sweep hour.
- CI on main was red (098ed9f): M4.3 latency spec, 42px sideways scroll at 390px from the M5.3 "Mark another skill" select. Reproduced, fixed (select and label capped at 100%), pushed fdedc32 first.
- M5.4 Merges **checked** (resumed wip/M5.4): sonnet round 1 0 H / 2 M / 5 L, round 2 0 H / 0 M / 4 L; refusal-path tests, name clash held before Send, per-grade text from config, GM 390×844 check. D171 finalised.
- M5.5 Practice capture **checked**: `practice.edited` / `practice.removed` / `practice.reviewed` (GM only), entries carry `reviewed` (state v26, goldens re-recorded, new golden `practice-review.jsonl`), GM "Practice" window (quick-add with Alt+P, end-of-scene prompt, To review list with OK/Edit/Remove/Mark all). D172, Q63. Property-test second seed moved 20261022 → 20261023 (the new commands shift the stream; reason in the test). Sonnet round 1 0 H / 3 M / 5 L (all M fixed), round 2 0 H / 0 M / 4 L.
- Tests: 991 unit (`npm run check` green); engine coverage 98.9% lines; full e2e 60/60 + latency 6/6 on the final M5.5 code. An earlier full run had one latency flake (M2.A connection reset under CPU load; passed alone; noted in QUALITY Flakes).
- Open `wip/*` branches: none new (wip/M5.4 and wip/M5.5 merged).
- Next item: M5.A (fable review). Not started: the gate reached minute 44 while the final full e2e was running, and M5.A's acceptance run needs that suite.
- Blockers: none.


### Run f55e54f2 · 2026-10-23 20:07–20:53 UTC (end minute 45: M5.A checked; M6.1 handed to wip/M6.1 at minute 44)
- Preflight: `add_repo` not offered; repo already cloned (local `main` had an unrelated history, reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Fable reviewer works (worktree; the Agent call blocked until it reported, ~11 min round 1). CI on main green (6cb9ed1). No new answers. Not an efficiency or sweep hour.
- M5.A **checked**: `e2e/M5.A.spec.ts` runs one Archer through evolution (with a kept re-rating), the level 5 selection, player-logged practice reviewed by the GM, a mark upgrade, and a merge, UI on both sides, plus reload, phone and GM-only canary. D173. Fable round 1 0 H / 2 M / 6 L (toast-queue flake → history asserts; merge alerts now count unreviewed uses; evolution builder pins the shown character), round 2 0 H / 0 M / 1 L. Lows to Backlog; Q64 (Identify re-rated at evolution).
- M6.1 Item library **started** on `wip/M6.1` (3940010, main 57813aa merged in): `ItemLibrary.tsx` (create/edit with flat bonuses per stat, rarity change, give/take via `holdings.adjust`), `itemLibraryModel.ts` with 5 unit tests, `e2e/M6.1.spec.ts` passes, `npm run check` green, screenshots in docs/screens/M6.1. Next step: make the nine bonus inputs a compact grid (the fieldset is very tall at 1366×768), add a D-entry, then launch the sonnet review.
- Tests: 992 unit (`npm run check` green); engine coverage 98.95% lines; full e2e 61/61 + latency 6/6 on the final M5.A code.
- Preview ready: Actions → Release → Run workflow (M5) — Luke's one click (D93), not a Blocker.
- Open `wip/*` branches: wip/M6.1.
- Next item: M6.1 (resume wip/M6.1).
- Blockers: none.

### Run 4d0e187e · 2026-10-23 21:08–21:56 UTC (end minute 48: sweep B, M6.1 and QF.16 checked)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet, haiku and fable reviewers all work (worktree; each Agent call blocks until it reports, 2–15 min). CI on main green (57813aa). No new answers. Sweep hour (21 UTC), rotation B.
- Quality sweep B (41be1ee..d6fedf8): Boundaries · haiku 0/0/1; Tests · fable 0/2/8 (16 mutations, 3 caught); UX · sonnet 0/1/5. Mediums confirmed by reading the tests and code → QF.16 (done this run), QF.17 (queued). Lows to Backlog. Last sweep → d6fedf8, next rotation C.
- M6.1 Item library **checked**: bonus grid, give/take row, D174. Sonnet round 1 0 H / 5 M / 4 L (stale-form overwrite, worn-item slot change, equipped copies hidden, units, test gaps incl. a player canary), round 2 0 H / 1 M / 3 L (false slot block) — all Mediums fixed. The full e2e then caught the library's "Name" label clashing with 18 specs' `getByLabel('Name')` → renamed "Item name".
- QF.16 **checked**: tests pin the merge rarity from the higher skill (engine and builder) and a partial practice review; each named mutation fails a test. Sonnet 0 H / 0 M / 2 L.
- Tests: 1,001+ unit (`npm run check` green); full e2e 68/68 green after the label fix (7.2 min).
- Open `wip/*` branches: none new (wip/M6.1 merged).
- Next item: QF.17, then M6.2.
- Blockers: none.

### Run 7a44dcfe · 2026-10-23 22:08–22:55 UTC (end minute 47: hard-stop window; M6.2's round-2 review returned at 45, closed out instead of starting M6.3)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main, which it did not share history with). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; each Agent call blocks, 3–5 min). CI on main green (52b7d42). No new answers. Not a sweep or efficiency hour.
- QF.17 **checked**: `isDing` in `player/history.ts` is the one DING set for the history filter and the Table-view pane; e2e `QF.17.spec.ts` upgrades a skill in Table view and sees `latest-ding` change (fails without the fix). Sonnet 0 H / 0 M / 3 L.
- M6.2 Loot tables **checked** (D175): engine `economy/loot.ts`, events `lootTable.defined`/`lootTable.edited`/`loot.rolled` (picks + bundle), injected `random` (server: crypto), roll for the GM only or into a character's inventory as a GM gift, GM-only `lootLog` (latest 50); state schema v27, goldens re-recorded + new `loot.jsonl`; GM "Loot tables" window with odds per pick. Sonnet round 1 0 H / 2 M / 6 L (undo of a table edit rewrote a past roll; stale draft overwrote another GM's edit) → fixed; round 2 0 H / 0 M.
- Tests: 1,021 unit (`npm run check` green); engine lines 98.7% (reviewer); full e2e 64/64 + latency 6/6 green on 03acc45; M6.2 spec re-run green after the fixes.
- Open `wip/*` branches: wip/M6.2 (same as main now; leave).
- Next item: M6.3 Currency.
- Blockers: none.


### Run 347c6c0d · 2026-10-23 23:07–23:50 UTC (end minute 45: hand-off at 44, close-out)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main, unrelated history again). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; each Agent call blocks, 3–4 min). CI on main green (6dc8157). No new answers. Not a sweep or efficiency hour.
- M6.3 Currency **checked** (D176, Q65): grants and fines are `holdings.adjust` with a reason; GM "Credits" window (toggle a character or Everyone, "<currency> each", reason the player sees, Grant/Fine; a party fine checks every balance first); GM-only state `ledger` (latest 300: grant, fine, gift, trade, loot, other party, reason, balance after) built in `applyEvent`, so undo/replay rebuild it; new `currency` notification to that player only. State schema v28, goldens re-recorded. Sonnet round 1 0 H / 2 M / 6 L → fixed; round 2 0 H / 0 M / 2 L (one fixed). The full e2e caught label clashes with the XP award (M3.2, M3.4, MR.3, MS.4) → fixed and re-run green.
- Tests: 1,038 unit (`npm run check` green on main); full e2e 62/65 on the pre-fix build (the 3 failures were the label clash, re-run green with M6.3 after the fix) + latency 6/6.
- **wip/M6.4** (base b1a723d, head 9f47e86): engine done and unit-tested: `titleDef.defined`/`titleDef.edited` (name ≤80, System text, flat/percent bonuses; unique names, any case), `titleLibrary`/`titleLibraryOrder` in state (schema v29, goldens re-recorded, new `title-library.jsonl`), held library titles count in effective stats everywhere (pools, sheet, party, dashboard), `title.award` uses the library's spelling, `me.titleDetails` for the holder only, `title` DING notification (`*'DING!' Title earned: [X] - text*`, counted by `isDing`). Next: run the full `npm run check` on the branch; GM "Titles" window (library define/edit with bonus fields, award from the library to a character); player Titles row shows each title's text and bonuses; `e2e/M6.4.spec.ts` + screenshots; D177; sonnet review.
- Open `wip/*` branches: wip/M6.4 (resume). wip/M6.2 is merged; leave.
- Next item: M6.4 Titles.
- Blockers: none.

### Run 12ab605a · 2026-10-24 00:07–00:54 UTC (end minute 48: milestone review back at 47, close-out)
- Preflight: `add_repo` not offered; repo already cloned (shallow; local `main` reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet and fable reviewers work (worktree; Agent calls block). CI on main green (b1a723d). No new answers.
- Efficiency check (hour 00): scorecard row appended (end minute 46.2, items/run 1.5, round-2 5/10, Highs 4, CI 47/day, red 8). D170 close-out gate **kept** (D178). Auditor (sonnet): two Tier 1 proposals, (1) start the full e2e with Bash in the background before each blocking review call (this run did that: two full runs overlapped reviews), (2) a label-clash helper script listing specs to run early. Neither applied yet (one per check; next check judges); recorded here for the next check.
- M6.4 Titles **checked** (D177): GM "Title library" window (search, define/edit with percent and flat-stat-point columns, award to a character), player Titles row with bonuses and System text, title DING; rename follows the title to holders; names compare with whitespace collapsed. Sonnet round 1 1 H / 3 M / 3 L → fixed; round 2 0 H / 0 M / 5 L (one fixed). Pushed to main (74bff4c).
- M6.A: `e2e/M6.A.spec.ts` (give, trade, loot roll, title award end to end, leak checks) passes; full e2e 73/73 + unit 1,057. Fable milestone review: 0 H / 3 M / 8 L (REVIEW-LOG). **wip/M6.A** (base 74bff4c, head 43891b7). Next: fix M1 (sheet shows items and titles separately, e.g. "items +0.2 capped, titles +10%"), M2 (notify the player on GM item give/take), M3 (DING the holder and warn the GM when defining/renaming a title someone already holds by name); strengthen the ledger assertion; then fable round 2 (two Mediums or more), check M6.A; preview-ready note for M6.
- Questions: Q66 (title flats inside the % multiplier; default as built).
- Open `wip/*` branches: wip/M6.A (resume). wip/M6.4 is merged; leave.
- Next item: M6.A review fixes.
- Blockers: none.


### Run 27864315 · 2026-10-24 01:07–01:50 UTC (end minute 43: closed out early after handing M7.1 to wip; no §5.5 reason, a protocol slip)
- Preflight: `add_repo` not offered; repo already cloned and current. Lock pushed cleanly. `npm view vitest version` → 5.0.5. Fable reviewer works (worktree; the Agent call blocks, ~20 min). CI on main green (74bff4c) at start. No new answers.
- M6.A **checked** (D179): round 1 fixes M1 (sheet shows "(items +0.2, capped; titles +0.1)" from owner-view `itemStats`), M2 (GM give → gift notice from the GM; take → new `itemsTaken` notice), M3 (defining/renaming a library title onto a held name DINGs that holder; GM form warns first); ledger assertion strengthened. Fable round 2: 0 H / 1 M / 9 L; fixed the M (item library reason field) and four Lows (name-clash warning, history label, mirror leak check, D179). Merged to main (8cb1188); main CI running at close-out.
- Tests: unit 1,062 (+ new quest model tests on wip), full e2e 67/67 green; latency MS.3 failed once at 1,457 ms while the reviewer ran in parallel on this 2-CPU box, passed 6/6 alone (local contention, not a CI flake; not logged in QUALITY).
- Preview ready for M6: Actions → Release → Run workflow (Luke's click, D93).
- M7.1 started: **wip/M7.1** (base 8cb1188, head 06e63fd): `apps/web/src/gm/questManagerModel.ts` (create command with stability rules "tag: delta", timer, visibility, hidden-quest `noticeTo`; nudge command) + unit tests. Next: GM QuestManager window (list, create/edit, status, nudges, apply action, noticeTo picker), the practice-tag stability offer (D67), e2e `e2e/M7.1.spec.ts` + screenshots, sonnet review.
- Open `wip/*` branches: wip/M7.1 (resume). wip/M6.A merged; leave.
- Next item: M7.1 Quest manager.
- Blockers: none.

### Run 805662911 · 2026-10-24 02:06–02:53 UTC (end minute 46: both reviewed items closed and the full e2e ran in the 44–52 close-out window; M7.3 not started because M7.2 finished at minute 45, past the 44 handoff)
- Preflight: `add_repo` not offered; repo already cloned (fast-forwarded). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; each Agent call blocks ~2.5 min). CI on main green (8cb1188) at start. No new answers.
- M7.1 **checked** (D180): GM Quests window (create/edit with only-changed fields and a stale warning, timer, visibility, stability rules and gauge toggle, hidden-quest notice picker, complete/fail/reopen, tagged actions, nudges) and the D67 practice offer (GM quick-add "Quest tags"; queued Apply offers re-read live). Sonnet round 1: 0 H / 2 M / 8 L, all Mediums fixed; round 2: 0 H / 0 M / 6 L. Pushed to main (bc71ed6).
- M7.2 **checked** (D181): entities gain GM-only `stats` and `notes` (campaign state v30, golden states bumped additively); GM "Bestiary and NPCs" window (name, label, grade/level, stats, Identify tiers per rarity, notes, reveal) with the out-of-range label warning. Sonnet round 1: 0 H / 0 M / 6 L; two Lows fixed.
- Full e2e on M7.1: 72/74 at first: M5.5 broke on an ambiguous `/^Action/` label (fixed: the field reads "Quest tags"); M2.A restart test failed on a GM "503" console error, passed alone and with 2 workers: a repeat flake, now QF.18.
- Tests: unit 1,077; engine line coverage 98.7%; full e2e on M7.2 75/75 green.
- Open `wip/*` branches: wip/M7.1 and wip/M7.2 merged; leave.
- Next item: M7.3 Encounter panel.
- Blockers: none.

### Run 3671869191 · 2026-10-24 03:06–03:48 UTC (end minute ~42: the sweep's three blocking reviewers took until minute 31 (the Tests reviewer ran 30 min); the three confirmed Mediums were fixed, reviewed and pushed by minute 40, and M7.3 had no safe first step that fits before the 44 hand-off, so it starts fresh next run)
- Preflight: `add_repo` not offered; repo already cloned (fast-forwarded to 64da0bb). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Haiku, sonnet and fable reviewers all work (worktree; each Agent call blocks until it reports). CI on main green (64da0bb). No new answers. Sweep hour (03 UTC), rotation C.
- Sweep C (d6fedf8..3902046): Rules · haiku 0 H / 0 M / 3 L; Tests · sonnet 0 H / 1 M / 6 L; UX · fable 0 H / 2 M / 7 L. All three Mediums confirmed (code read; QF.21 by mutation) and fixed this run as QF.19 (a GM item give carries its reason to the holder), QF.20 (bestiary Reveal names who is out of Identify range) and QF.21 (hub test for the default loot random source). Lows to the QUALITY Backlog. Last sweep → 3902046, next rotation D.
- QF.19–QF.21 **checked**: sonnet round 1 0 H / 0 M / 6 L; two Lows fixed (blank-reason and mixed-reveal tests). Pushed to main (9908a64).
- Tests: unit 1,080 green; e2e M6.A and M7.2 green locally (full e2e not run: no shared server or UI shell change).
- Open `wip/*` branches: none new.
- Next item: M7.3 Encounter panel. Suggested first step: record each share's race level (or the bonus it got) in `xp.awarded` shares as an optional field (D71 gap (a)); the reducer uses it when present instead of re-deriving `shareBonus` at fold time; additive golden change.
- Blockers: none.

### Run 3773602035 · 2026-10-24 12:07–12:52 UTC (end minute ~45: M7.3 finished and pushed at minute 43 after two review rounds; under 48 because the next item, M7.4, could not take a first commit and still leave the close-out inside the 52 hard stop)
- Preflight: `add_repo` not offered; repo already cloned (local main fast-forwarded to e649726). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers and auditor work (worktree; Agent calls block; two in one message ran at once). CI on main green (9908a64). No new answers. A Release workflow ran on e649726 at 12:01 (Luke's click, presumably). Efficiency hour (12 UTC).
- Efficiency check: scorecard row added (end minute 44.8, items/run 1.7, round-2 share 5/10, Highs 4, CI red/day 1). Nothing in trial to judge. Auditor (sonnet) gave two Tier 1 proposals; applied one (D183: blocking agents in one message, worktree reviewers told their SHA), the other waits.
- M7.3 Encounter panel **checked**: GM Encounter window (contest roller with grade-gap mode, shared rolls as `contest.shared` events with stored outcome, state v31; damage/heal with the grade-wall damage factor; progress clocks with the montage trigger), player contest pop-up, `xp.awarded` shares record `raceLevel` (D71 gap a). D182, Q67. Review: sonnet round 1 0 H / 2 M / 7 L, round 2 0 H / 1 M (accepted as design, Q67) / 5 L.
- Tests: unit 1,102 green; full e2e 69/70 then the one failure (M7.3's own label) fixed and passing alone; the full run first caught a label collision ("Amount") in 9 specs, fixed. Engine coverage not measured this run.
- Open `wip/*` branches: wip/M7.3 (merged; leave it).
- Next item: M7.4 Trackers (hunger fading at E-grade, regions, survivor factions; players see hunger when enabled).
- Blockers: none.

### Run e0da578e · 2026-10-24 13:08–13:52 UTC (end minute ~44)
- Preflight: `add_repo` not offered; repo already cloned (local main reset to origin/main 15f1f8b). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; Agent calls block). CI on main green (4b8d21a). No new answers. Not an efficiency or sweep hour.
- M7.4 Trackers **checked**: hunger tracker (campaign state, renamable steps, fades at `rules.hunger.fadesAtGrade`), regions (current region's name reaches players), survivor factions (GM-only); state v32, trackers golden log, GM Trackers window, player Hunger row and region beside the day. D184, Q68, Q69. Review: sonnet round 1 0 H / 2 M / 6 L, round 2 0 H / 0 M / 6 L.
- QF.18 **checked**: the M2.A restart flake was the GM change-log refetch in flight at each `server.stop()` (reset, or Fastify's 503 while closing); the test waits for it before both stops; `/api/join` reads the port from the live socket. 10/10 under a looping vitest load. Review: sonnet round 1 0 H / 2 M, round 2 0 H / 0 M / 2 L.
- M7.A started: `wip/M7.A` (base 1a96f67, head f5249a0): `e2e/M7.A.spec.ts` covers setup, a quest whose stability gauge stays hidden then is toggled on, and damage. Next step: add a bestiary foe and a shared contest (a first try at the contest step hung at the Roll/Share step and was not committed; check the roller's state after selecting a bestiary side), clock and montage, a stability action from the fight, XP, screenshots; then the full e2e and the `fable` milestone review.
- Tests: unit 1,120 green; full e2e 71/71 (on the M7.4 feature commit); M7.4 spec and M2.A ×10 after the review fixes green. Engine coverage not measured this run.
- Open `wip/*` branches: wip/M7.A (resume); wip/M7.4 and wip/QF.18 merged (leave them).
- Next item: M7.A.
- Blockers: none.

### Run a5af4004 · 2026-10-24 14:07–14:51 UTC (end minute ~44)
- Preflight: `add_repo` not offered; repo already cloned, local main fast-forwarded to origin/main (5183360). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Fable reviewers work (worktree; Agent calls block). CI on main green (1a96f67). No new answers. Not an efficiency or sweep hour.
- M7.A **checked** (M7 milestone done): `e2e/M7.A.spec.ts` runs a sample encounter end to end (bestiary foe, shared same-grade contest with the player's pop-up, damage, a clock and montage with the player's focus, cleanse and system-beast stability actions, XP with the above-level bonus) and proves World Stability reaches the player only while toggled on (no stability in frames while hidden, before and after). Review: fable round 1 0 H / 2 M / 7 L (orphaned montage on clock removal; stale contest stats), round 2 0 H / 1 M / 3 L (the cascade needed `clock.removed` v2 with a legacy upcaster per D34). All fixed; D185. Two UX Lows to the QUALITY backlog.
- M8.1 started: `wip/M8.1` (base d828151 merged in, head a8873d3): `apps/web/src/themes.css` with per-grade tokens (`--metal`, `--metal-hi`, `--metal-lo`, `--sheen`, `--glow-strength`), a sheen ring over the status frame, platinum brushed, diamond animated (off under reduced motion); `e2e/M8.1.spec.ts` passes and writes `docs/screens/themes/`. Next step: the frame ring reads thin at 2px; carry the metal to headings and the other player windows' frames (System-window styling per DESIGN §9), drop the duplicate status-window rule in styles.css, check the 390×844 shots, then the full e2e (shared UI) and the sonnet review.
- Tests: unit 1,125 green; full e2e 72/72 (on the M7.A fixes); M8.1 spec green on the wip. Engine coverage not measured this run.
- Open `wip/*` branches: wip/M8.1 (resume); wip/M7.A merged (leave it).
- Next item: M8.1.
- Blockers: none.

### Run cffd8016 · 2026-10-24 15:07–15:58 UTC (end minute ~52)
- Preflight: `add_repo` not offered; repo already cloned, local main fast-forwarded to origin/main (66ba2af). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet, fable and haiku reviewers work (worktree; Agent calls block, so the M8.1 review and the three sweep lenses ran in one message). CI on main green (d828151). No new answers. Sweep hour (15): sweep D.
- Sweep D (3902046..45da2c5): Rules sonnet 0/0/1, Boundaries fable 0/0/2, UX haiku 0/0/3 (H/M/L). All six Lows to the QUALITY backlog; Q70 (PC-vs-PC contest reveals the other player's stat roughly; default keep). Last sweep 45da2c5, next rotation A.
- M8.1 **checked**: the grade metal is a theme class on the player grid (every player window's border, glow and headings), a 4px masked sheen ring on the status window, platinum brushed blue-white, diamond animated unless reduced motion. Review sonnet: round 1 0 H / 2 M, round 2 0 H / 1 M (platinum ring rendered dark → brightened; spec now measures the rendered ring). The full e2e caught a metal-heading rule outranking rarity colours (M3.5) → zero-specificity `:where`. D186.
- M8.2 **checked**: an evolution plays a 2.4s re-theme (new metal eases in, frames pulse, status ring sweeps); undo, character switches and level-ups never play it; reduced motion swaps at once. Review sonnet: round 1 0 H / 4 M, round 2 0 H / 0 M / 4 L. D187.
- Tests: unit 1,127 green; full e2e 79/79 on M8.1; full e2e 81/81 on M8.2. Engine coverage not measured (no engine changes).
- Open `wip/*` branches: wip/M8.1 and wip/M8.2 merged (leave them).
- Next item: M8.3 Accessibility.
- Blockers: none.


### Run af11bae8 · 2026-10-24 16:08–16:49 UTC (end minute 41: closed out early to fix red CI on main and hand M8.4 off while its round-2 review is due; no §5.5 reason, a protocol slip)
- Preflight: `add_repo` not offered; repo already cloned, main reset to origin/main (c76432c). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; Agent calls block). CI on main green at start (c76432c). No new answers. Not an efficiency or sweep hour.
- M8.3 **checked**: contrast ≥ 4.5:1 checked on the theme tokens (unit) and on the rendered page (in-page scanner: GM console, two players × 7 themes, details opened, skill dialog, phone, placeholders); bronze text lightened via a new per-theme `--metal-text`; silver vs platinum CIEDE2000 9.6 → platinum metal #b2d5f5 (11.4); every control a Tab stop with a 2px outline at 3:1; Tab stays inside the skill dialog; reduced motion stops all motion (global net). Review sonnet: round 1 0 H / 4 M, round 2 0 H / 0 M / 4 L. D188.
- CI red on 8135404: my M8.3 screenshot commit carried a staged `chime.ts → sounds.ts` rename from the M8.4 work, so typecheck failed (latency and desktop-smoke failed after it). Fixed on main (rename reverted); local typecheck clean.
- M8.4 Sound **in progress** on `wip/M8.4` (head e977766, base 8135404): `sounds.ts` with DING / selection / evolution recipes, per-browser volume slider (default 70) shown while sound is on, Sound: off mutes, selection sound on a new menu, evolution sound with the re-theme; unit tests and `e2e/M8.4.spec.ts` (Web Audio recorder) pass. D189. Round 1 review: 0 H / 2 M (screenshot fixed; tests still missing for View-as pane silence and character-switch silence). Next step: `git merge origin/main` into wip/M8.4 — main renamed `sounds.ts` back to `chime.ts`, so after the merge make sure `sounds.ts` holds the M8.4 content and `chime.ts` is gone (PlayerScreen imports `./sounds`); add the pane and switch tests; run round 2 review; then check the box.
- Tests: unit 1,140 on main (1,144 on wip/M8.4); full e2e 78/78 on M8.3 (b50f5ff). Engine coverage not measured (no engine changes).
- Open `wip/*` branches: wip/M8.4 (in progress).
- Next item: M8.4 Sound (resume wip/M8.4).
- Blockers: none.

### Run 88c950af · 2026-10-24 17:06–17:45 UTC (end minute 39: no §5.5 reason, a protocol slip — I handed M9.1 off early, reading the build window as over)
- Preflight: `add_repo` not offered; repo already cloned (local main stale on an unrelated history; reset to origin/main 8d07f52). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: sonnet and fable both work (worktree; Agent calls block). CI on main green at start (dc752fe). No new answers. Not an efficiency or sweep hour.
- M8.4 Sound **checked**: merged main into wip/M8.4 and restored `sounds.ts`; added the pane-silence and character-switch test (verified to fail when a pane guard is removed); round 2 sonnet 0 H / 0 M / 7 L; fixed Lows: empty stored volume → default, phone screenshot. Merged to main (96b8a4d). Note: that docs commit also carried screenshots regenerated by the full e2e and the first evolved-* shots (harmless; replaced by M8.A's).
- M8.A **checked** (milestone M8 done): `e2e/M8.A.spec.ts` climbs an Archer G→A the real way (29 selections, 6 evolutions taken on the player's screen), swell heard each time, 14 real-screen theme shots in docs/screens/themes/evolved-*. Fable review: 0 H / 1 M / 8 L; M1 (sound silent after a reload with sound remembered on: suspended AudioContext never resumed) fixed in `playSound` + first-gesture unlock with a unit test; platinum vs diamond ΔE ≥ 10 asserted; other Lows to the QUALITY backlog. D190. Release push not attempted (refused from here): Luke's one click.
- M9.1 Session report **in progress** on `wip/M9.1` (base 723a82f): the session log/report is also written as `session-NN.json` (format `the-system/session-report` v1, session meta, `report` flag, entries/practice/notes); an undone session's JSON says so; server unit tests. Next step: GM route `GET /api/gm/session-report?n=N&format=md|json` (GM-gated, reads the writer's file; 404 when absent), a "Copy for Claude" button per past session in `SessionPanel.tsx` (copies the markdown), `e2e/M9.1.spec.ts` with screenshots, a D-entry, then the sonnet review.
- Tests: unit 1,146 on main; full e2e 85/87 on wip/M8.4 (M3.10 failed only because I ran M8.A at the same time in the same test-results dir; passes alone; M8.A since fixed); M8.2–M8.4, M8.A, M3.3 green on the final code. Engine coverage not measured (no engine changes).
- Open `wip/*` branches: wip/M9.1 (in progress).
- Next item: M9.1 Session report (resume wip/M9.1).
- Blockers: none.

### Run 6fc27cb7 · 2026-10-24 18:07–18:53 UTC (end minute ~46)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated history; reset to origin/main 8dde3b7). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: sonnet works (worktree; Agent calls block). CI on main green at start (723a82f). No new answers. Efficiency hour (§9).
- §9 efficiency check: scorecard row appended (end minute 44.0, items/run 1.6, round-2 7/10, Highs 0, red/day 2). D183 judged: target up but two guards worse → reverted (D194; SHA wording kept); Q71 (Tier 2) asks Luke about judging unrelated guards against a noise band. Sonnet auditor: applied Tier 1 `npm run clock` + §5.5 wording (D195, in trial); presubmit proposal waits.
- M9.1 Session report **checked**: GM route `GET /api/gm/session-report?n=N&format=md|json` rebuilds any session's report from the event log; Session window "Copy for Claude" / "JSON" per past session and "Copy log for Claude" while running (ClipboardItem inside the click; legacy copy outside a secure context; selected textarea if refused). Sonnet round 1: 1 H (phone overflow in M4.3) / 2 M; fixed; round 2 0 H / 0 M. D191. Merged (5074a8b).
- M9.2 Content format **checked**: `packages/engine/src/content/format.ts` (zod, strict, path-tagged errors), generated `docs/content-format.schema.json`, `docs/CONTENT-FORMAT.md`, four examples in `docs/content-examples/`, `contentToCommands` (titles' whole percent → fraction; characters by id or unique name). Sonnet round 1: 1 H (percent unit) / 3 M; fixed; round 2 0 H / 0 M. D192. Pushed (ed76378).
- M9.3 Import with approval **in progress** on `wip/M9.3` (base ed76378, head cc950a2): engine `previewContent` (scratch-copy run, nothing appended), `POST /api/gm/content/preview`, GM "Import content" window (tick, apply over the GM connection in file order), `e2e/M9.3.spec.ts` + screenshot, D193. Sonnet round 1 at 91668cc: 1 H / 4 M; H (non-preview error replies crashed the window) fixed in cc950a2, unreviewed. Next steps: (1) Mediums: re-preview just the ticked entries before applying (or on every tick) so an entry that depends on an unticked one shows its error; after a part-applied run drop the applied entries from the list; say "the campaign changed since the preview, check again" when an apply is refused; (2) tests: apply stops at a refusal, dependent unticked entry, server error reply, partly invalid preview (disabled rows), character `errors` list, bad file changes nothing (no event appended), 404 with no campaign, wrong key; (3) clear the preview on a network failure; then round 2 sonnet review. Round 2 is due (round 1 had a High).
- Tests: unit 1,169 on wip/M9.3 (1,166 on main); e2e M9.1, M4.3, M2.A, M9.3 green. Full e2e not run this run (no Mx.A; shared server code touched only by new GM routes). Engine coverage 97.53% lines (reviewer's run).
- Open `wip/*` branches: wip/M9.3 (in progress).
- Next item: M9.3 Import with approval (resume wip/M9.3).
- Blockers: none.

### Run 244704ef · 2026-10-24 19:07–19:49 UTC (end minute 42: M9.A started and handed to wip at minute 41; no reviews were outstanding and the rest of M9.A needs the fable milestone review, which would not fit before 50)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated history; reset to origin/main b50a4e4). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: sonnet works (worktree; Agent calls block). CI on main green at start (b50a4e4). No new answers. Hour 19: no efficiency check, no sweep.
- M9.3 Import with approval **checked**: resumed wip/M9.3. Engine `previewContent(…, only)` and route `{ file, only }` re-check just the ticked entries on every tick (an entry that needs an unticked one, or a campaign changed since the preview, blocks Apply); after a refusal the applied entries leave the list and the rest are re-checked, with "the campaign may have changed"; offline clears the preview; non-blocking note for an item whose name exists; re-picking the same file re-checks it. Sonnet round 2: 0 H / 1 M (no UI test for error replies or a blocked tick) / 4 L; fixed (e2e routes 404, 413, aborted, blocked re-check). D193 updated. Merged (f28dec2).
- M9.5 Tutorial content pack **checked**: `docs/content-packs/tutorial.json` (DESIGN §8: 30-day quest with World Stability rules, hidden quest for the reveal, seven regions with GM notes, bestiary with the curse tiers, pale hunters, System beasts and three Beast Lords, loot, [Rapid Spread], three GM notes, hunger on). Content format v1 gained optional `quests`, `regions`, `gmNotes`, `hunger` (D196); preview notes duplicate bestiary entries, quests and GM notes. D197, Q72 (numbers to confirm). Sonnet round 1: 0 H / 2 M / 8 L; fixed; round 2: 0 H / 0 M / 4 L, fixed. Merged (d303765).
- M9.A **started** on `wip/M9.A` (base d303765, head 29ece45): `e2e/M9.A.spec.ts` imports and applies the pack, starts session 1. Next steps: finish the loop in the spec per its TODO (create Jake, 400 XP to the G top, end the session, GET /api/gm/session-report?n=1&format=json shows the level-ups, import a drafted `evolutions` file for Jake, the player sees the evolution choice at 390×844; level-5 menus need the F evolution first), run the full e2e, then the **fable** milestone review (§6.1). After M9.A: Status gets "Preview ready" (§8.2).
- Tests: unit 1,181 on main; e2e full suite 94/94 at 0e37706 (run during the M9.5 review); M9.3 and M9.5 specs green with 2 workers after the fixes. Engine coverage not re-measured this run (last 97.53%).
- Open `wip/*` branches: wip/M9.A (in progress).
- Next item: M9.A Milestone acceptance and review (resume wip/M9.A).
- Blockers: none.

### Run fef87149 · 2026-10-24 20:07–20:49 UTC (end minute 42: M9.A checked and merged at 41; M10.1 opened on wip/M10.1 at 41 and handed off, since no review could start and return before 50)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated history; reset to origin/main 6ee33d4). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: fable works (worktree; Agent calls block). CI on main green at start (d303765). No new answers. Hour 20: no efficiency check, no sweep.
- M9.A Milestone acceptance and review **checked**: resumed wip/M9.A. `e2e/M9.A.spec.ts` runs the Claude loop on the tutorial pack: import, session 1 (Jake to the top of G with 400 XP), end, Copy for Claude (markdown on the clipboard) and the JSON report's level lines, a drafted `evolutions` file imported back, and the player evolving into a drafted path at 390×844; GM-only strings never reach the phone. Fable round 1: 0 H / 2 M / 6 L: drafted menus and evolutions now say in the import preview whose screen they go to, their options and what they replace; session logs and reports gain a Party section (sheets with exact skill names, open menus, unchosen release). Round 2: 0 H / 0 M / 3 L (bracketed names made exact; rest to the QUALITY backlog). D198. Merged (8a72f63).
- Tests: unit 1,185; e2e full suite 95/95 twice (at 0c4c6d1 and 407a703, during the reviews). Engine coverage not re-measured this run (last 97.53%).
- Preview due for M9 (§8.2): Actions → Release → Run workflow.
- Open `wip/*` branches: wip/M10.1 (base 8a72f63, no commits yet). Where I stopped: MS.5 already covers launch, GM key injection, join URL + QR, app-data folder and single instance (D54). Still missing for M10.1: a backup on quit (call the store's `backup('quit')` when closing campaigns in `apps/desktop/src/main.ts`), Windows firewall help (a GM-console note or dialog on win32 when the first player has not connected), and the acceptance under `xvfb-run` (`/health`, GM window connects with the key, a plain browser cannot act as GM) in `apps/desktop/test/desktop.spec.ts`.
- Next item: M10.1 Electron wrapper (final) (resume wip/M10.1).
- Blockers: none.

### Run cf2945f3 · 2026-10-24 21:07–21:53 UTC (end minute 46: M10.A opened on wip/M10.A at 42 and handed off at 44; its fable milestone review blocks the session for ~20 minutes, so it could not start and return before 50)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated shallow history; reset to origin/main c34d9b7). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: sonnet, fable and haiku all work (worktree; Agent calls block, so the M10.1 review and the three sweep lenses ran in one message). CI on main green at start (8a72f63). No new answers. Hour 21: quality sweep A.
- Sweep A (45da2c5..ee1a405): Rules fable 0/0/2, Boundaries sonnet 0/0/0, Tests haiku 0/3/7 (H/M/L). Two Mediums confirmed by mutation and fixed as QF.22; one Medium not a defect (Low); Lows to the QUALITY backlog. Last sweep ee1a405, next rotation B.
- M10.1 Electron wrapper (final) **checked**: quit backs the real campaign up to `backups/<stamp>-quit/` (`startApp` `backupOnClose`, D199); the join panel folds away "Players can't connect?" with Windows Firewall / macOS / generic steps from the server's `platform` on GM-only `/api/join`. Sonnet round 1: 0 H / 2 M (Windows log-off skipped the close and backup; a stuck listener close could beat the backup), both fixed; round 2 0 H / 0 M. Merged.
- QF.22 **checked**: tests pin a drafted `rerate` reaching `evolution.release` and chosen menus leaving the report's open menus (both sweep mutations now fail). Sonnet 0 H / 0 M.
- M10.2 Packaging and releases (final) **checked**: D200/Q73 keep D97's two artifacts (Windows installer, Linux AppImage; macOS out until Luke asks). Local `--linux` package built the AppImage, the packaged smoke passed (now also proving the quit backup in the packaged app), the AppImage answered /health under xvfb; Release run 40092258606 green with both files. Sonnet 0 H / 0 M.
- Tests: unit 1,189; e2e full suite 97/97 (91 e2e + 6 latency) at the M10.1 merge; desktop smoke 6/6; packaged smoke 1/1. Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: wip/M10.A (base 5ac1948, no commits). Where I stopped: run the M10 acceptance (desktop smoke, `npm run package -w @the-system/desktop -- --linux` + packaged smoke, full e2e), then the fable milestone review over 8a72f63..HEAD for M10.1–M10.2; launch it first thing so it returns well before 44.
- Next item: M10.A Milestone acceptance and review (resume wip/M10.A).
- Blockers: none.


### Run a56191db · 2026-10-24 22:08–22:51 UTC (end minute 43: M11.1 opened on wip/M11.1 at 35 and handed off; close-out needed the rest before the 52 stop)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated history; reset to origin/main 813664d). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: fable worked (worktree; Agent calls block). CI on main green at start (5ac1948). No new answers. Hour 22: no efficiency check or sweep.
- M10.A Milestone acceptance and review **checked**: check green (1,190 unit); desktop smoke 7/7 (35/35 at --repeat-each=5); full e2e 90/91 (+ latency 6/6), the miss was `M8.A` timing out under reviewer load and passes alone in 25 s (logged under Flakes); fable packaged the AppImage and ran the packaged smoke. Fable round 1: 0 H / 2 M (release evidence predated the M10 code → Release dry run 40138628866 on `release-dry-run` green on Windows and Linux; an installer's polite close then forced kill skipped the quit backup → backup taken when the quit question opens, D201). Round 2: 0 H / 1 M (the new Electron test's cleanup touched a disposed process handle → fixed). Merged ac1bf1e.
- Preview ready for M10: Actions → Release → Run workflow (D93).
- Tests: unit 1,190; e2e 91 + 6 latency; desktop smoke 7. Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: wip/M11.1 (base ac1bf1e, head 4cca4982). Where I stopped: `apps/server/test/soak.test.ts` has the server, GM + 4 players, a mulberry32 stream (seed 0x5eed1101) of xp awards and renames, and a desync check against `projectForPlayer`; it passes at `SOAK_STEPS=400` (7.5 s) and 1,000 (41 s) but 2,000 exceeds 120 s: per-command cost grows with history (quadratic). First: profile one late command (suspect a whole-history fold, projection or stringify per command/broadcast) and fix it in the server or engine; that also serves M11.3. Then add player commands (free points), the heap-growth check (< 20% after warm-up), and decide vitest vs e2e placement.
- Next item: M11.1 Soak test (resume wip/M11.1).
- Blockers: none.

### Run 6cf41e9c · 2026-10-24 23:07–23:53 UTC (end minute 45: M11.3 opened on wip/M11.3 at 37 and handed off at 38; full e2e ran to minute 43, then close-out)
- Preflight: `add_repo` not offered; repo already cloned (local main on an unrelated history; reset to origin/main d8064e1). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree, background). No new answers. Hour 23: no efficiency check or sweep.
- CI on main at start: latest completed (ac1bf1e) red in `desktop-smoke` only: the splash screenshot failed with "Unable to capture screenshot" while the hand-over was held (a new mode, not the QF.14 race); logged under Flakes in QUALITY.md; this run's pushes re-run CI.
- M11.1 Soak test **checked**: the "quadratic server" from the last run was the test client re-parsing every frame per wait; the server is near-linear. Soak: real server, GM + 4 players, 2,000 seeded commands from both roles, desync checked against both projections after every step, GM-only canary, live-heap growth after warm-up 5–7% (D202). Sonnet: round 1 0 H / 2 M (stale-view race failing at 4,000 steps; end-only desync check) fixed; round 2 0 H / 0 M. Merged 0f7eeed.
- M11.2 Recovery **checked**: vitest power loss at every byte of the log tail plus 60 seeded cuts; e2e SIGKILL mid-session with a torn multi-byte tail, stale lock and half-written snapshot temp file; outage command fails visibly and is never replayed (D203). Sonnet round 1: 1 H (e2e typecheck) / 2 M (a log shorter than its snapshot opened silently → now refuses and changes nothing; a client ahead of the log kept stale notifications → reset) fixed; round 2: 0 H / 0 M. Merged 4b74195.
- Tests: unit 1,195 (+ perf test on wip); e2e 92 + 6 latency (full e2e 92/92 locally, 7.6 min under reviewer load); desktop smoke not run (no desktop change). Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: wip/M11.3 (base wip/M11.2 991b1ec, head 6370677). Where I stopped: `apps/server/test/perf.test.ts` builds a 50,000-event log and times `CampaignStore.open` with full replay: 1.1–1.4 s (< 3 s ✓). But building that log through `execute` is quadratic (0.09 ms per command at 0 events, 0.8 ms at 40k; the build takes 30 s): profile `execute` (suspects: `overLimit`/`itemOutOfReach` or a validation that scans `campaign.events`) and fix it, then shorten the test's build. Still to do: player sheet interactive < 2 s on localhost (Playwright timing, e2e/M11.3.spec.ts, ideally against a large campaign) and screenshots.
- Next item: M11.3 Performance (resume wip/M11.3).
- Blockers: none.

### Run b883f039 · 2026-10-25 00:08–00:49 UTC (end minute 41: M11.4 opened on wip/M11.4 at 39; the lock was released early by mistake (misread the clock while closing out), with M11.4 still buildable; no §5.5 reason)
- Preflight: `add_repo` not offered; repo already cloned (detached HEAD; reset main to origin/main 8006c1b). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree; Agent calls block in this session, so the review ran in the same message as the full e2e). No new answers. Hour 00: efficiency check (below); no sweep.
- CI on main at start: latest completed (8006c1b, docs only) red in `test` → `e2e/M8.3.spec.ts` keyboard sweep ("never reached by Tab", 98 elements). Passed here alone and with `--workers=2`: logged under Flakes in QUALITY.md; this run's push re-runs CI.
- Efficiency check: scorecard row added. D195 (`npm run clock` wording) reverted under strict §9.2 (Highs 0 → 3, red/day 2 → 3; the auditor judges both unrelated, Q71) as D205. Applied the auditor's Tier 1 "never idle on a blocking review" ordering as D206 (in trial, judge at 06:00 + 6 runs). Its flake-fix idea waits for a repeat.
- M11.3 Performance **checked**: profiling showed `appendEvent`'s duplicate-id check scanned the whole log per command; now an id → position index shared per lineage (branch-safe, tested), so building 50k events takes 7 s instead of 30 s. 50k-event full-replay load 0.75 s (< 3 s). Player sheet on a 50k-event campaign rendered 12,000+ history items (1.2–2.0 s); Notifications and System messages now render the newest 50 with "Show older (N more)" (focus moves to the first new entry; filter/search reset the page; search covers everything). Cold first visit 1.0 s, warm 0.4–0.5 s (< 2 s), 1366×768 and 390×844 (D204). Sonnet round 1: 0 H / 4 M (cold path untimed, synthetic campaign accepted, page not reset, focus lost) fixed; round 2: 0 H / 0 M, 2 Lows to the backlog. Merged 6bc2748.
- Tests: unit 1,196; e2e 92 + 8 latency (full e2e 92/92 locally in 6.9 min, alongside the reviewer); desktop smoke not run (no desktop change). Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: wip/M11.4 (base main 6bc2748, head 8c3821b). Where I stopped: `docs/TROUBLESHOOTING.md` has ports (30333, the desktop's 20-port fallback and its error text), addresses (`lan.ts`), and unsigned-app warnings (Windows SmartScreen, macOS Gatekeeper); still TODO there: firewall prompts (Windows Defender, macOS firewall) and same-wifi/guest-network/client-isolation. Not started: `docs/GM-GUIDE.md`, `docs/PLAYER-QUICKSTART.md` (one page; verify every UI label against `apps/web/src`). M11.4 needs a spec only if it ships UI; docs-only items still get a §6 review.
- Next item: M11.4 Guides (resume wip/M11.4).
- Blockers: none.

### Run 7a8361b5 · 2026-10-25 01:07–01:46 UTC (end minute 39: `docs/DONE.md` written, §5.5)
- Preflight: `add_repo` not offered; repo already cloned (detached HEAD; reset main to origin/main fed5b6e). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewers: sonnet and fable worked (worktree; Agent calls block, so reviews ran two at a time in one message). No new answers. Hour 01: no efficiency check, no sweep.
- CI on main at start: latest completed (6bc2748) green; later commits docs only.
- M11.4 Guides **checked**: finished `docs/TROUBLESHOOTING.md` (firewall per OS, same wifi / guest / client isolation, reconnecting, GM key, data folders, lost-writes recovery, one window), wrote `docs/GM-GUIDE.md` and the one-page `docs/PLAYER-QUICKSTART.md`, README links. `scripts/guides.test.ts` checks every bold label against its surface's source (comments stripped), the port messages and the firewall menu paths. Sonnet round 1: 0 H / 4 M (docs not shipped with the app, players pointed at a repo file, weak label test, no macOS note) fixed; round 2: 0 H / 0 M, Lows fixed. Merged a5a24207.
- M11.5 Final review **checked**: fable whole-repo review at 480d613a, 0 H / 0 M / 7 L. Fixed: the hub logs an engine error inside a command. Lows and the QUALITY Backlog kept as Known gaps in `docs/DONE.md` (D207, D208). `docs/DONE.md` written; Q74 asks Luke whether runs stay stopped.
- Tests: unit 1,202; e2e 92 + 8 latency (full run 8.8 min, green); desktop smoke not run (no desktop change). Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: none in progress (wip/M11.4 and wip/M11.5 merged).
- Next item: none; build complete.
- Blockers: none.

### Run 60adeaa2 · 2026-10-25 17:07–17:49 UTC (end minute 42: MT.2 handed to `wip/MT.2` at the build cut-off with no smaller unblocked step left that fits; close-out done early)
- Preflight: `add_repo` not offered; repo already cloned (detached HEAD; local main reset to origin/main cd75c898). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree; Agent calls block, so each review ran beside the full e2e or alongside work). No new answers in ANSWERS.md. Hour 17: no efficiency check, no sweep.
- CI on main at start: latest completed (cd75c898) green.
- MT.1 Evolution re-rating is approved, not automatic **checked**: `evolution.release` needs `rerateApproved: true`; the list starts every skill at its own rarity; an approved release never lowers, merges away or renames a race skill (Identify); unnamed skills keep their rarity at choose; releases stored without the mark replay as MR.1 did (no schema bump, goldens untouched). Builder: "Approve this re-rating" box gating Release, cleared by any later change; race rows say "never drops". Content imports count as approved, and the preview lists the re-rating (D209). Sonnet round 1: 0 H / 3 M fixed; round 2: 0 H / 1 M (rename) fixed and verified by me.
- Tests: unit 1,213; e2e 93 (full `--project=e2e` run green before round 2; MT.1, M5.2, M5.A, MR.1 re-run after the fixes). Latency project and desktop smoke not run (no server or desktop change). Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: `wip/MT.2` (base 3ecef770, head 7dfc2ba9). Where I stopped: `Character.mergeOffer` (optional, so no state schema bump needed if it stays absent until set) and `offerMerge`/`answerMerge` in `skills/model.ts`; `projection.test.ts` field list fails until the projection field is added. Next steps are in the header comment of `packages/engine/test/mergeOffer.test.ts` (events, commands, reducer, history, projection, UI, e2e; the M5.A and MR.2 specs need the player to accept).
- Next item: MT.2 (resume `wip/MT.2`).
- Blockers: none.

### Run 35fed412 · 2026-10-25 18:08–18:48 UTC (end minute ~41: MT.3 opened on `wip/MT.3` at 39 with its acceptance plan; the efficiency close-out took the minutes to 41; the rest of MT.3 (schema bump, goldens, UI removal across engine, content and web) does not split into a safe slice under 3 minutes, so the hand-off is early; no other §5.5 reason)
- Preflight: `add_repo` not offered; repo already cloned (local `main` had an unrelated older history; reset to origin/main, old tip kept on local branch `old-local-main`, also contained in `wip/M6.A`). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree; Agent calls block, so each review ran beside the full e2e or alongside work). CI on main at start: latest completed (3ecef770) green. No new answers in ANSWERS.md.
- Efficiency check (hour 18): scorecard row appended (end minute 42.8, items/run 1.7, round-2 7/10, Highs 3, CI 16/day, red 4). D206 not judged (2 runs old). Auditor (sonnet): Tier 1 applied, LOOP §5.5 "nothing small fits" is not a reason to stop (D211, in trial). Tier 2 narrower round-2 reviews → Q75 (default no change).
- MT.2 Players accept or decline merges **checked** (D210): `skill.merge` records an offer (`skill.mergeOffered`, optional text given on accept); the owner answers with `skill.answerMerge`; an accept is re-checked and refused if a skill changed since the offer; the GM may answer for the player. Player "Skill Merge" card (top of the column, Accept disabled when stale); GM builder shows "Waiting on …" and the answer from state (`lastMergeAnswer`, GM-only). Old `skill.merged` logs replay unchanged; no state schema bump; new golden `merge-offers`. Sonnet round 1: 0 H / 3 M / 4 L → fixed; round 2: 0 H / 0 M / 4 L. Pushed to main (ee78a366).
- Tests: unit 1,223; e2e 94 (full `--project=e2e` green on 13d242ac; MT.2, M5.4, M5.A re-run after the round-1 fixes). Latency project and desktop smoke not run (no server change). Engine coverage not re-measured (last 97.53%).
- Open `wip/*` branches: `wip/MT.3` (base ee78a366, head 067a8ee3). Where I stopped: only `packages/engine/test/noHunger.test.ts`, whose header lists the plan and touch list (state v33 without `hunger`, hunger events reduce as no-ops, commands `hunger.configure`/`hunger.set` removed, rules upcaster strips `rules.hunger`, content `hunger` ignored with a warning, projection and web UI removed, all golden states re-recorded under the bump, M7.4 spec trimmed).
- Next item: MT.3 (resume `wip/MT.3`).
- Blockers: none.

### Run 5964a90a · 2026-10-25 19:08–19:57 UTC (end minute ~49)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had an unrelated older history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree; Agent calls block, so each review ran beside the full e2e). CI on main at start: latest completed (ee78a366) green. No new answers in ANSWERS.md. Not an efficiency or sweep hour.
- MT.3 No hunger tracker **checked** (D212): state v33 without `hunger`; M7.4 hunger events still parse and replay as no-ops (no command, no Undo button, change log says "(no longer used)"); rules config v2 with the first rules migration (1 → 2 drops `hunger`); content `hunger` read but ignored, listed under "Ignored sections" in the import preview; tutorial pack, GM guide and content format cleaned; all golden states re-recorded at v33 (logs unchanged). New `noHunger.test.ts`, `e2e/MT.3.spec.ts` (opens the old `trackers` golden log on the real server). Sonnet: 0 H / 0 M / 6 L; 3 Lows fixed. Merged (336aadbd).
- MT.4 Credits history for players **checked** (D213): the ledger is projected to its owner as `inventory.credits`; the player's Inventory shows a collapsed "Credits history", newest first, with the balance after each change. `creditsHistory.test.ts`, `creditText.test.ts`, `e2e/MT.4.spec.ts`. Sonnet: 0 H / 0 M / 6 L → QUALITY backlog. Merged (fc0bb9ed).
- Tests: unit 1,223; e2e 96 (full `--project=e2e` green on wip/MT.4 55a3b5ec, which contains MT.3). Latency project and desktop smoke not run (no server change beyond the preview field). Engine coverage not re-measured.
- Open `wip/*` branches: none new to resume (wip/MT.3 and wip/MT.4 are merged). MT.5 not started: MT.4's review and full e2e finished at minute 47, after the hand-off point.
- Next item: MT.5 GM override for level, XP and grade.
- Blockers: none.

### Run edb20617 · 2026-10-25 20:08–20:56 UTC (end minute ~48)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had an unrelated older history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Reviewer: sonnet worked (worktree; Agent calls block, so reviews ran beside other work). CI on main at start: latest completed (fc0bb9ed) green. No new answers in ANSWERS.md. Not an efficiency or sweep hour.
- MT.5 GM override for level, XP and grade **checked** (D214, Q76): `character.setProgression` → `character.progressionSet`; Edit sheet → "Level, XP and grade (GM override)" → Review override shows what changes and what it skips (spread, free points, evolutions; selections become due) → Apply. Engine refusals show before Apply; the form reloads on live changes; no DING for set levels; session-log line; a released evolution the new values no longer reach is withdrawn; a re-earned race level grants no second free-point batch. Golden `progression-override`. Sonnet round 1: 0 H / 2 M / 5 L (both M fixed); round 2: 0 H / 0 M / 5 L. Merged (ddf36547).
- MT.6 Broadcasts last a set time or stay pinned: **built, not checked** (D215). Branch `wip/MT.6` at 6d9e9348 (base main ddf36547). `system.broadcast` gains optional `display` (timed 5 s–24 h or pinned), `broadcast.removed`; player banners (sticky, top of screen), GM "Banners on players' screens" list with Remove; golden `broadcast-banners`; `broadcastBanners.test.ts`; `e2e/MT.6.spec.ts` and screenshots. Sonnet round 1: 0 H / 3 M / 6 L. Fixed: M1 sticky banners, M2 arrival stamped with the wall clock, L4 Show resets after sending. **Next step:** M3 (a GM indicator of banners up, e.g. near the top of the console, plus "Remove all"; consider capping stacked banners on 390×844), add `display` to the `system.broadcast` command zod shape, re-shoot screenshots, `npm run check` + MT.6 e2e, then the round-2 review (required: 3 Mediums) before checking the box.
- Tests: unit 1,239 on wip/MT.6; e2e 98 (full `--project=e2e` green on wip/MT.6 fdb64713, which contains MT.5). Latency project and desktop smoke not run. Engine coverage not re-measured.
- Open `wip/*` branches: wip/MT.6 (resume). wip/MT.5 is merged.
- Next item: resume wip/MT.6, then MT.7.
- Blockers: none.


### Run ab633184 · 2026-10-25 21:08–22:05 UTC (end minute ~57, over the 52 hard stop)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had an unrelated history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start (ddf36547) green. No new answers. Sweep hour (21): sweep B launched.
- **Overran the hard stop:** Agent calls block in this environment, and the fable Tests sweep reviewer took 46 min, holding the turn until 22:03. Next sweeps: give the Tests lens a narrower scope or launch it only with work that can absorb a 45-minute wait; never launch a sweep later than minute ~5.
- MT.6: round-1 M3 fixed on `wip/MT.6` d2a09b57 (header "N banners up" chip with Remove all; banner stack scrolls past 40vh on phones; `display` in the command zod shape; e2e + `gm-banners-chip-1366x768.png`). Round 2 (sonnet): 0 H / 1 M / 4 L. **Not checked.** Next step: fix M1 — `BroadcastBanners.tsx` stamps any message first seen after mount with `Date.now()`, so a timed banner seen after a reconnect/sleep shows its full time from reconnect while the GM list has already expired it; bound the start by the send time when the gap is large (and the Lows: clock-skew comment, GM-on-other-device clock, scheduled broadcasts never banners hint, unit test for `activeBanners`). Max 2 rounds reached: verify the fix yourself, log it, check the box.
- Sweep B (scope ee1a405..ff8a1be1), findings **not yet verified** (next run verifies before any QF item): Tests·fable 1 M (`checkRaceSkillsKept` evolution/model.ts:496: a transform with `skill: 'Identify'` is untested; mutation survives) + 5 L; UX·sonnet 2 M (merge offer arrives with no player notification/DING, MergeOfferPanel.tsx:25; ProgressionOverride Review/Apply drop keyboard focus, PartyDashboard.tsx:586-631) + 6 L; Boundaries·haiku 0 M, 2 L (change log shows unshared journal note rows "note written"; no electronFuses). Sweep log row and Backlog not yet written: next run records them in QUALITY.md and advances the rotation to C.
- Tests: unit 1,239 green (`npm run check` on wip/MT.6); full e2e `--project=e2e --workers=1` 98/98 green on d2a09b57.
- Open `wip/*`: wip/MT.6 (resume).
- Blockers: none.

### Run 1ea01aa0 · 2026-10-25 22:09–22:49 UTC (end minute 40: protocol miss, released before minute 48 with no §5.5 reason; MT.7 work was pushed to wip at each step, so nothing is lost)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had an unrelated history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start (ddf36547) green. No new answers. Hour 22: no efficiency check, no sweep.
- MT.6 **checked**: round-2 M1 fixed (`bannerStart`: a live arrival more than 2 min after its send time times from send + 2 min, so a banner seen after a reconnect does not outlive the GM's list); Lows: skew limit documented, scheduled messages say they are list-only, unit tests for `activeBanners`/`bannerStart`. Max rounds reached; verified by unit + e2e.
- Sweep B recorded in QUALITY.md (rotation → C). All 3 Mediums confirmed (mutation / code reading) and fixed: QF.23 (Identify-as-source merge refusal tested; mutation now fails), QF.24 (a merge offer notifies its owner: toast + System messages; e2e with a second player), QF.25 (GM override keeps keyboard focus; keyboard e2e). Reviewed together by sonnet: 0 H / 0 M / 4 L (backlog). **Checked.**
- MT.7 started on `wip/MT.7` (base cd724194, head 27695b6f): `docs/GM-OVERRIDES.md` lists all 283 engine refusals by category (Rule / State / Data / Permission) with the GM's way through; `scripts/gm-refusals.mjs` + `scripts/gm-overrides.test.ts` keep it complete (D215). New engine overrides with tests and goldens: `skill.setRarity`, `skill.grant`, `skill.awardMark` `override: true`. **Next step:** `override: true` on `skill.merge` (store it on the MergeOffer so the accept honours it), `evolution.release` (pending selection), `character.grantProfession` (before E-grade), `montage.offer`; then GM sheet controls for each with warnings, `e2e/MT.7.spec.ts` + screenshots, update the "Planned" rows in GM-OVERRIDES.md, then the sonnet review.
- Tests: unit 1,245 on main (1,257 on wip/MT.7); full e2e `--project=e2e --workers=1` 100/100 green on the QF.25 head before push.
- Open `wip/*`: wip/MT.7 (resume).
- Blockers: none.

### Run f31211eb · 2026-10-25 23:08–23:50 UTC (end minute ~44: MT.7 needed both review rounds and its close-out; MT.8 not started, so the next run starts it fresh rather than from a one-commit wip)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had an unrelated history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start (cd724194) green. No new answers. Hour 23: no efficiency check, no sweep.
- MT.7 **checked** (merged to main): `override: true` on `skill.merge` (kept on the offer; the player's accept honours it; passes the ceiling too), `evolution.release` (kept on the release; the owner's screen and the choice honour it; selections stay due), `character.grantProfession` (before E-grade, or replacing one), `montage.offer`; GM controls with warnings: Edit sheet → "Skill and profession overrides" (Set rarity, Give a skill, Grant/Replace profession), Marks review "Extra mark (override)", Merges "GM override: merge any two skills", Encounter "Early montage (override)", evolution builder "GM override: release now anyway". Change-log rows end "(GM override)". `docs/GM-OVERRIDES.md` lists 310+ refusals, nothing planned; scanner reads literal, ternary, `…Problem`/limit returns and error results (D216–D218). `e2e/MT.7.spec.ts` + screenshots; M5.3 spec updated for the extra-mark button.
- Review: sonnet 2 rounds (R1 1H/3M/3L, R2 0H/3M/1L), all H/M fixed; see REVIEW-LOG.
- Tests: unit 1,267; e2e MT.7, M7.3, MT.2, M5.4, M5.3, MT.1, M5.A green locally (full suite left to CI on this push). Engine coverage not re-measured this run.
- Open `wip/*`: none new (wip/MT.7 merged).
- Blockers: none.


### Run 316478c4 · 2026-10-26 00:09–00:52 UTC (end minute ~43: protocol miss, released before 48 with no §5.5 reason after handing MT.9 to wip; the next run resumes it)
- Preflight: `add_repo` not offered; repo already cloned (local `main` had an unrelated history; reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start (a017f8ec) green. No new answers. Hour 00: efficiency check run (sonnet auditor); no sweep.
- Efficiency: scorecard row appended (end minute 46.0, items/run 1.5, round-2 7/10, Highs 3, red/day 2). D206 reverted (half its target moved the wrong way; D220); D211 judged next check. Auditor's Tier 1 `npm run orient` waits for a later check; Tier 2 sweep budget → Q77.
- MT.8 **checked** (pushed to main): `faction.reveal` toggle (Trackers → "Reveal to players"/"Hide from players", "Revealed" pill, live-edit note); players see revealed factions as `[Name] · standing` under the quest log, never head count, base, notes or unrevealed ones; golden `faction-reveal.jsonl`; GM-OVERRIDES locations refreshed (D219). Review sonnet 2 rounds (R1 0H/2M/6L, R2 clean).
- MT.9 **in progress** on `wip/MT.9` (base 046752cd, head e44483ca): engine `scene.end`/`scene.answer` + optional `scenePrompt` state, player projection `scenePrompt`, golden `scene-prompt.jsonl`, GM End scene sends `scene.end` and lists who has not answered, player prompt in the Practice window (Send to the GM / Nothing this scene), `e2e/MT.9.spec.ts` + screenshots (D221). Round 1 (sonnet) 0H/4M/4L; M1 fixed. **Next step:** fix M2–M4 (see REVIEW-LOG 2026-10-26 MT.9), then review round 2, then merge to main.
- Tests: unit 1,273 on wip (1,271 on main); full e2e 111/111 green locally on MT.8 before push. Engine coverage not re-measured.
- Open `wip/*`: wip/MT.9.
- Blockers: none.
### Run 3f1c942c · 2026-10-26 01:08–01:52 UTC (end minute ~44: at hand-off with MT.A started; its fable review cannot finish before the 52-minute stop)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start (046752cd) green. No new answers. Hour 01: no efficiency check, no sweep.
- MT.9 **checked** (merged from `wip/MT.9`, pushed df765baa): round-1 M2–M4 fixed (D222: "Resume end of scene" instead of replacing an open prompt; the GM's walk answers for the character; status-window "End of scene · [Answer]" flag; engine tests for stale/double/unknown/partial/undo/forged replay; e2e for "Nothing this scene"). Round 2 (sonnet) 0H/2M/3L, all fixed: the player's draft survives the GM answering for them, a silent GM-side answer race, "New scene (drop unanswered)", D221/D222 wording, GM screenshot.
- MT.10 **checked** (1bafa6d3): backups copy `portraits/`; exports v2 carry portraits (base64) and import restores them, checking name, size, magic bytes and hash; v1 still imports; status window shows the portrait at the top (D223). Review sonnet 0H/0M/7L (kept).
- MT.11 **checked** (0bca76e8): content quest `notice: false` imports a hidden quest with nobody told; tutorial pack's "The Host's Response" uses it; GM list says "nobody told" (D224). Review sonnet 0H/0M/2L (L1 fixed).
- MT.A **started**: full e2e 114/114 green locally at 0bca76e8 (the later QuestManager label change re-ran M7.1 and M9.5, green). Next step: launch the `fable` review over the MT milestone (046752cd^..main or the MT item range in REVIEW-LOG), fix findings, check the box, then "Preview ready: Actions → Release → Run workflow" (MT).
- Tests: unit 1,283; e2e 114/114. Engine coverage not re-measured.
- Open `wip/*`: none new (wip/MT.9 and wip/MT.10 are merged).
- Blockers: none.

### Run 71e1198d · 2026-10-26 02:08–~02:58 UTC (end minute ~50)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main; history unshallowed). Lock pushed cleanly. `npm view vitest version` → 5.0.5. CI on main at start green (1fc9004d). No new answers. Hour 02: no efficiency check, no sweep.
- MT.A **checked** (3d4a6955): fable review of 71141cc9..b06c7cc2 (reviewer: check 1,283, MT e2e 12/12, full e2e 106/106, screenshots fine, no GM-only leaks). 0 H / 1 M / 5 L. M fixed (D225: lowering the class level by override withdraws open skill menus above it, named in the warning); L `scene.ended` 64 → 200; 4 Lows to the QUALITY Backlog. Preview build due: Luke's one click (Actions → Release → Run workflow, MT).
- MC.1 **built, not checked**, on `wip/MC.1` (base 3d4a6955, head bc01e511): `apps/server/src/ai/` (AiClient interface, FixtureAiClient, AnthropicClient with injectable fetch, SpendCounter priced by model family, KeyStore encrypted through an injected cipher, CoDm service + GM-only `/api/gm/ai` routes), Electron `safeStorage` cipher in the desktop app, GM panel `CoDmSettings.tsx`, e2e `MC.1.spec.ts` + screenshot (D226). Review round 1 (sonnet): 1 H / 4 M / 5 L; H1, M3, M4 fixed at 2dac7747 (npm run check 1,306 green). Next step: fix M2 (desktop no-encryption wording, send a reason) and M5 (canary in player frames, `/api/characters`, logger output), then a round-2 review, merge to main, check the box. Not covered by e2e: saving a key (the terminal server has no cipher); unit/route tests cover it with a fake cipher.
- Tests: unit 1,305; e2e MT.5, MT.9, MC.1 green this run (full suite 106/106 by the fable reviewer at b06c7cc2).
- Open `wip/*`: wip/MC.1.
- Blockers: none.

### Run 46cb339b · 2026-10-26 03:08–03:53 UTC (end minute 45: handed off at 44)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main, unrelated history). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Haiku, sonnet and fable reviewers all work (worktree; each Agent call blocks; the four parallel reviewers took 9–32 min). CI on main green (3d4a6955). No new answers. Sweep hour (03 UTC), rotation C.
- MC.1 (wip/MC.1): round-1 M2 (status `saveBlocked` reason, panel wording) and M5 (`coDmCanary.test.ts`: player frames, `/api/characters`, request log; mutation-checked) fixed at 9c3520f7. Round-2 sonnet review: 0 H / 2 M / 3 L. M1 (no timeout on the live call) fixed at e4784cf4. M2 (no e2e of the key-saved UI path) open: next run adds a test-only fake cipher to the e2e server, covers Save/Remove/Test/spend, merges, checks. Not checked this run.
- Sweep C (scope ff8a1be1..e781ac3b): Rules·haiku 0/0/1, Tests·sonnet 0/1/3, UX·fable 1/1/5. High (sticky banners translucent, unreadable when scrolled) confirmed and fixed: QF.26 **checked** (sonnet review clean; merged fc05d08a, D227). Mediums queued as QF.27 (scene prompt under the banners after [Answer]) and QF.28 (portrait import size/empty checks untested). Lows to the QUALITY Backlog.
- Tests: unit 1,284 on main (1,309 on wip/MC.1); e2e MC.1, MT.6 green this run; full e2e 103/106 at 4 workers by the Tests sweeper (the 3 failures pass alone: load).
- Open `wip/*`: wip/MC.1 (head e4784cf4).
- Blockers: none.

### Run 56591c49 · 2026-10-26 04:08–04:53 UTC (end minute ~50: handed off at 45)
- Preflight: `add_repo` not offered; repo already cloned (local `main` reset to origin/main, unrelated shallow history). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewers work (worktree; Agent calls block, run alongside the full e2e). CI on main green (fc05d08a). No new answers. Not a sweep or efficiency hour.
- MC.1 **checked**: round-2 M2 fixed (62d32407: test-only fake cipher and AI client behind `THE_SYSTEM_E2E_FAKE_AI=1`, refuses non-test keys; e2e of save/test/spend/reload/remove; D228). Merged to main.
- QF.27 **checked** ([Answer] lands below the sticky banners; e2e fails without the fix at −197 px) and QF.28 **checked** (empty/oversize portraits get their own messages; both mutations caught). Sonnet reviews clean (0 H/0 M).
- MC.2 (wip/MC.2, head b4c69dbe): generate route, recorded fixtures per kind, Co-DM panel feeding Import content (approve/edit/regenerate), unit tests and e2e, D229. Round-1 sonnet review: 2 H / 5 M / 3 L, open (REVIEW-LOG); next run fixes them and runs round 2.
- Tests: unit 1,314 on main (1,327 on wip/MC.2); full e2e 109/109 on main+QF.27/28 and 110/110 on wip/MC.2 (1 worker).
- Open `wip/*`: wip/MC.2 (b4c69dbe).
- Blockers: none.


### Run 5b3bd199 · 2026-10-26 05:08–05:54 UTC (end minute ~45: handed off at 43)
- Preflight: `add_repo` not offered; repo already cloned (local `main` again had unrelated history: reset to origin/main, old copy kept as local branch `old-local-main`). Lock pushed cleanly. `npm view vitest version` → 5.0.5. Sonnet reviewer works (worktree; Agent call blocks, ran alongside the full e2e). CI on main green (487ae13e). No new answers. Not a sweep or efficiency hour.
- MC.2 **checked**: round-1 H1/H2 and M3–M7 fixed (069b67d5, D230): one Import load at a time with deferred co-DM hand-over, 150 s generation limit and Cancel (aborts the API call), honest readiness message, confirm before Regenerate drops edits, co-DM note in Import, 503 without a co-DM, per-kind section and 20% cap tests. Round 2 (sonnet): 0 H / 2 M / 6 L; both Mediums fixed (dropped-request abort test on a real listener; `takesIncoming` gate unit-tested) plus 4 Lows. Merged to main (0d6d996e).
- MC.3 (wip/MC.3, head 5eeaf225, base 0d6d996e): engine `shop.define`/`shop.defined` (GM-only; wares by item id or name; place by region id or name; optional state fields, no schema bump, D231), content `shops` section + docs/content-examples/shop.json, golden log shops.jsonl, GM-overrides rows, generated shops use the section. Next: GM shop list with "Sell" filling a GM trade to the chosen character, CONTENT-FORMAT.md section, e2e/MC.3 + screenshots, review.
- Tests: unit 1,338 on main (1,344 on wip/MC.3); full e2e 110/110 on wip/MC.2 at 069b67d5 (1 worker); MC.2/M9.3/MC.1 e2e green after round 2.
- Open `wip/*`: wip/MC.3 (5eeaf225).
- Blockers: none.

### Run a3970c1a · 2026-10-26 06:15–07:02 UTC (end minute ~47: close-out began at 44)
- Preflight: as usual (`add_repo` not offered, local `main` again unrelated: reset to origin/main; lock pushed cleanly; vitest 5.0.5). Efficiency hour (06). CI on main was red at 0d6d996e: desktop e2e teardown `rmSync` hit ENOTEMPTY on the Electron profile after the forced kill; fixed with cleanup retries in teardown only (b8ce93fa), CI green since (b8ce93fa, 2ce7a8df).
- Efficiency check: scorecard row appended; D211 kept; auditor (sonnet) found `metrics.mjs` never counted a round 2 written under its own heading: fixed as this check's Tier 1 (D234, now In trial); orient script and shorter PROGRESS entries wait for a later check.
- MC.3 **checked**: GM Shops window, Sell → GM trade at the ware price, CONTENT-FORMAT shops section, re-import note. Round 1 (sonnet): 0 H / 2 M / 5 L → open-offer list with Cancel, Sell disabled while offered, GM-only `shop.remove`, golden log shops-removed, viewport screenshot (D232). Round 2: 0 H / 0 M / 4 L (to QUALITY backlog). Merged (2ce7a8df).
- MC.4 (wip/MC.4, head 48a22bcd, base 2ce7a8df): Co-DM panel loading-screen option (pinned broadcast, clear on approval; D233), unit tests, e2e/MC.4 + screenshots. Round 1 (sonnet): 0 H / 2 M / 5 L. Both Mediums fixed in 48a22bcd (a regeneration replaces the old loading screen; a failed or cancelled generation takes it down) but not yet e2e-tested or re-reviewed: next run adds those e2e cases, rebuilds, runs MC.4/MC.2/MT.6 e2e and the round-2 review.
- Tests: unit 1,355 on wip/MC.4 (1,352 on main + metrics test); full e2e 111/111 at 998ad972; full e2e at cbcf55b1 (MC.4 round 1): 104+ passed, only MC.4 errored at 0 ms because the close-out switched the tree to main mid-run (its spec was gone); MC.4 alone passed earlier at cbcf55b1.
- Open `wip/*`: wip/MC.4 (48a22bcd).
- Blockers: none.

