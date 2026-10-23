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

None in trial (D150).

## Kept

- L9 fixed-clock timebox, L9 targeted orient reads, L9 CI wip-skip and
  Chromium cache (2026-10-23 00:08, D131).

## Reverted

- D119 pre-review sibling self-check and D132 no main e2e re-run on an
  identical tree (2026-10-23 06:10, D150): targets improved (round-2 share
  7/10 → 5/10; items/run 1.3 → 2.0) but the Highs guard rose (1 → 4; 0 → 4),
  and D132's CI red/day guard too (7 → 10), so §9.2 reverts both.

## Proposals for Luke (Tier 2)

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
