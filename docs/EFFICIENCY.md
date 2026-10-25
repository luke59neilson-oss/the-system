# Efficiency

Ongoing checks that the build gets more finished, verified work per hour and
per token without lowering any quality gate. How it runs: `docs/LOOP.md` §9.
Decisions: L9–L12 in `docs/DECISIONS.md`.

## Metrics (`npm run metrics`; `-- --append` adds a row to the scorecard)

- **End minute:** minutes from lock to the end of the run (target 48–52).
- **Items per run:** roadmap boxes checked per run (from the box count at
  each `chore: take run lock`).
- **Round-2 share:** of the last 10 reviewed items, how many needed a second
  review round. **Highs:** High findings in those 10. Guard metrics: if they
  rise after a change, the change is suspect.
- **Main CI runs/day, red/day, minutes:** the last 24 hours on main; minutes
  are the mean of green runs.
- **Orient words:** what LOOP §4 has a run read before building.

## In trial

| Change | Since (UTC) | Target | Baseline | Guards | Judge at |
|---|---|---|---|---|---|
| D206 blocking reviews never idle: commit, open `wip/<next>`, send the review call together with independent work (full e2e, next item's tests); no blocking review that cannot return by 50 | 2026-10-25 00:52 | items/run ↑, end minute ↑ | 1.8, 44.2 | Highs 3/10, round-2 share 7/10, red/day 3 | 2026-10-25 06:00 + 6 runs |

## Kept

- D170 close-out gate (2026-10-24 00:08, D178): end minute 43.7 → 46.2,
  items/run 1.3 → 1.5, guards flat (Highs 4/10, round-2 share 5/10, red/day 8).
- D162 one push to main per item (2026-10-23 18:08, D170): main CI runs/day
  66 → 48 and red/day 12 → 8 (both ≈ −30%), guards flat (Highs 4/10,
  round-2 share 5/10, items/run 1.3).
- L9 fixed-clock timebox, L9 targeted orient reads, L9 CI wip-skip and
  Chromium cache (2026-10-23 00:08, D131).

## Reverted

- D195 `npm run clock` + §5.5 wording (2026-10-24 18:07, D205): target
  barely moved (end minute 44.0 → 44.2, items/run 1.6 → 1.8) and two guards
  rose (Highs 0 → 3, red/day 2 → 3), so §9.2 reverts the protocol wording.
  The auditor judged both guard moves unrelated (M11.2's typecheck High,
  sweep QF items; two one-off CI flakes), another case for Q71. The
  read-only `scripts/clock.mjs` stays as a helper; LOOP no longer requires it.

- D183 blocking Agent calls in one message (2026-10-24 18:07, D194): target
  improved (sweep-run end minute 42 → 52) but guards worsened (round-2 share
  5/10 → 7/10, red/day 1 → 2), so §9.2 reverts it. The auditor judged both
  guard moves unrelated (M8.2/M8.3's four-Medium round 1s; a staged-rename
  slip and a shared test-results dir) and suggests Luke override it (Q71).
  Kept: telling a worktree reviewer its SHA (an ambiguity fix, not the trial).

- D119 pre-review sibling self-check and D132 no main e2e re-run on an
  identical tree (2026-10-23 06:10, D150): targets improved (round-2 share
  7/10 → 5/10; items/run 1.3 → 2.0) but the Highs guard rose (1 → 4; 0 → 4),
  and D132's CI red/day guard too (7 → 10), so §9.2 reverts both.

## Proposals for Luke (Tier 2)

- 2026-10-25 00:08 auditor (sonnet): no Tier 2 proposals. Applied its
  Tier 1 "never idle on a blocking review" ordering (D206). Its other Tier 1
  idea, making the M8.3 Tab sweep wait for focus to settle after each press,
  is a test change: it becomes a QF item if that flake repeats (QUALITY.md
  Flakes). It again supports Q71 (judge guards against a noise band).

- 2026-10-24 18:07 auditor (sonnet): Tier 1 applied: `npm run clock` and
  the §5.5 wording (D195). Waits for a later check (Tier 1): `npm run
  presubmit` refusing a commit that carries files outside the item's paths,
  and Playwright runs refusing to share a test-results dir (target: red/day
  2 → 1). Tier 2 (Q71): judge each trial strictly only on the guards it can
  plausibly move, others against a noise band (round-2 share ±2/10, red/day
  ±1) unless the move persists at the next check; and override the D183
  revert. Default: no change.

- 2026-10-24 12:08 auditor (sonnet): two Tier 1 proposals. Applied (2):
  launch blocking agents together, worktree reviewers told their SHA (D183).
  Waits for a later check (1): an `npm run clock` helper that prints the phase
  and a reworded §5.5 so a run under 44 always opens `wip/<next>`.

- 2026-10-23 18:08 auditor (sonnet): no Tier 2 proposals. Applied its Tier 1
  close-out gate (D170). Its `--only-changed` re-evaluation: not worth it
  yet (risk of skipping a coupled spec). Note: `desktop-smoke` re-installs
  Playwright deps uncached; small wall-time gain, not taken.

- 2026-10-23 12:18 auditor (sonnet): no Tier 2 proposals. Its second Tier 1
  idea, `npx playwright test --only-changed=origin/main` before each push,
  waits for a later check (one Tier 1 change per check).

- 2026-10-23 06:10 auditor (sonnet), Q57: (1) hand the reviewer the
  builder's `npm run check`/e2e output and SHA so it re-runs only what it
  doubts (est. 2–4 min per review round); (2) one reviewer for two small,
  independent non-engine items launched together (fewer blocking stalls).
  Both change what §6 reviews do, so Tier 2. Default: no change.
- 2026-10-23 06:10, Q58: the Highs guard counts sweep-found QF items, which
  no protocol change can cause; judge trials on non-QF items only? Default:
  no change.

Older: Not applied (2026-10-23 auditor, Tier 1, may come later): run
the full e2e in the background while a blocking reviewer works (risk: load
flakes on 2 CPUs, QF.8). Declined 2026-10-22 (chat): a narrower "Medium" review severity,
screenshot changes, in-run builder subagents. Second lane: not yet (L11);
§9 proposes it when the queue splits cleanly.

## Scorecard

Rows are appended at the bottom by `npm run metrics -- --append`; keep this
table last in the file.

| Date (UTC) | Runs | End minute (mean) | Items per run | Round-2 share | Highs | Main CI runs/day | Main CI red/day | Main CI minutes (mean) | Orient words |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-22 16:53 | 6 | 39.8 | 1.3 | 7/10 | 1 | 97 | 5 | 4.3 | 8110 |
| 2026-10-22 18:07 | 6 | 41.3 | 1.7 | 7/10 | 1 | 95 | 8 | 4.6 | 9665 |
| 2026-10-23 00:08 | 6 | 45.8 | 1.3 | 4/10 | 0 | 75 | 7 | 6.0 | 9919 |
| 2026-10-23 06:10 | 6 | 42.7 | 2.0 | 5/10 | 4 | 73 | 10 | 7.2 | 9320 |
| 2026-10-23 12:18 | 6 | 45.5 | 1.3 | 5/10 | 4 | 66 | 12 | 8.0 | 8839 |
| 2026-10-23 18:08 | 6 | 43.7 | 1.3 | 5/10 | 4 | 48 | 8 | 6.6 | 8510 |
| 2026-10-24 00:08 | 6 | 46.2 | 1.5 | 5/10 | 4 | 47 | 8 | 6.7 | 8491 |
| 2026-10-24 12:08 | 6 | 44.8 | 1.7 | 5/10 | 4 | 20 | 1 | 6.6 | 10248 |
| 2026-10-24 18:07 | 6 | 44.0 | 1.6 | 7/10 | 0 | 24 | 2 | 5.9 | 8240 |
| 2026-10-25 00:48 | 6 | 44.2 | 1.8 | 7/10 | 3 | 24 | 3 | 6.4 | 8172 |
