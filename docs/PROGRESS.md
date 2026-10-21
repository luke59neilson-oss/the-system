# Progress

**Status:** in progress: M0 and MS done; M1.1-M1.13, M2.1-M2.3 done
**Next item:** M1.14 Campaign simulation
**Blockers:** first preview build not published: `git push origin main:release` was refused by this session's permission classifier ("Production Deploy"). Luke: push `main` to `release` yourself (or allow it) to get the preview-<date> Release.

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
