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
| D119 pre-review sibling self-check (§6.2) | 2026-10-22 18:35 | Round-2 share down (to ~4/10) | 7/10 | Highs, items/run | next check (5 runs old at 00:08) |
| D132 no main e2e re-run on an identical tree (§5.6) | 2026-10-23 00:45 | End minute / items per run up | 45.8; 1.3 | Main CI red/day, Highs | first check after 6 runs |

## Kept

- L9 fixed-clock timebox, L9 targeted orient reads, L9 CI wip-skip and
  Chromium cache (2026-10-23 00:08, D131).

## Reverted

(none yet)

## Proposals for Luke (Tier 2)

None open. Not applied (2026-10-23 auditor, Tier 1, may come later): run
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
