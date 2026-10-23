# Autonomous run protocol

This repo is built by scheduled, unattended runs (hourly). Each run is a fresh
session with no memory of earlier runs; everything you need is in this repo.
Luke is not watching. Never stop to ask him a question.

## 0. Known environment limits (verified 2026-10-21)

- Works: `git push` to existing and new branches, pushing
  `.github/workflows/*`, GitHub Actions on this private repo, npm registry,
  Electron/electron-builder binary downloads from GitHub releases, headless
  Chromium at `/opt/pw-browsers/chromium`, repo-scoped **read** API calls via
  `GH_TOKEN= gh api repos/luke59neilson-oss/the-system/...`.
- Blocked by the session's git proxy: **deleting remote branches**, **pushing
  tags**, and GitHub API **writes** (releases, refs, dispatches). Do not retry
  these. Releases are created by a workflow on push to the `release` branch.
- Never run `playwright install`; launch Chromium with
  `executablePath: '/opt/pw-browsers/chromium'` when that path exists.
- Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for every install outside
  `apps/desktop` packaging work.

## 1. Set up

1. If the repo is not attached, call `add_repo` (owner `luke59neilson-oss`,
   repo `the-system`, access `push`) and clone exactly as that tool instructs,
   to `/home/claude/the-system`.
2. Always `git fetch origin` and `git merge --ff-only origin/main` before
   reading any file below.
3. Create any of `docs/PROGRESS.md`, `docs/QUESTIONS.md`,
   `docs/REVIEW-LOG.md` that is missing.

## 2. Lock (use `date -u` for every time)

1. If `docs/DONE.md` exists, reply "Build complete" and stop.
2. If `docs/LOCK.json` exists and `started` is less than **90 minutes** ago,
   reply "Another run is active" and stop.
3. Otherwise write `docs/LOCK.json` `{ "started": "<UTC ISO>", "run": "<random id>" }`,
   commit `chore: take run lock`, push. If the push is rejected, fetch,
   re-read the lock, and stop if another run took it.

## 3. Preflight (record results in this run's PROGRESS entry)

- `npm view vitest version` works (npm registry).
- Reviewer models: you will discover availability at the first review (§6).
- If pushing the lock failed for any reason other than a race, log a Blocker
  in PROGRESS.md and stop.

## 4. Orient (targeted reads)

Read in full: `CLAUDE.md`, `docs/DESIGN.md`, `docs/ANSWERS.md`. Of the
rest, read only what bears on this run (the logs grow every hour; reading
them whole costs about 30k tokens per run for history you do not need):

- `docs/PROGRESS.md`: the header lines (Status, Next item, Blockers) and the
  last run entry only (`sed -n 1,6p`, then from the last `### ` heading on).
- `docs/ROADMAP.md`: "Global rules" plus every milestone section that still
  has a `[ ]` or `[~]` box. Skip fully checked milestones.
- `docs/QUESTIONS.md`: only questions with no `Answer` line yet, plus any
  question that `docs/ANSWERS.md` answers and that is not marked applied.
- `docs/DECISIONS.md`: the header and every L-entry (`grep -n '^- L'`).
  Before starting each item, `grep -n -i` for its ID and its key terms and
  read the D-entries that match. Read the whole file only when changing a
  rule that many entries touch.
- `docs/REVIEW-LOG.md`: append only; never read it whole.

- **Answers from Luke live in `docs/ANSWERS.md`.** Never edit that file (Luke
  edits it on GitHub; your commits to it would block his). Apply any answer
  not yet applied by editing DESIGN.md, DECISIONS.md and, if needed,
  ROADMAP.md in one commit; mark the matching question in QUESTIONS.md
  `(applied, D<n>)`. You may only append new questions to QUESTIONS.md and
  mark them applied; never rewrite Luke's text.
- **Skip** items marked deferred in ROADMAP.md.
- **CI:** check the latest completed run on main:
  `GH_TOKEN= gh api "repos/luke59neilson-oss/the-system/actions/runs?branch=main&status=completed&per_page=1"`.
  If it failed, fixing it is your first task. After 3 runs in a row fail to
  fix it, log a Blocker and continue with roadmap work.
- **Red CI: read the failures first.** Job logs are not reachable from here;
  failing tests appear as annotations:
  `GH_TOKEN= gh api repos/luke59neilson-oss/the-system/actions/runs/<id>/jobs --jq '.jobs[].id'`,
  then `.../check-runs/<job id>/annotations`. Reproduce it the way CI runs:
  CI has 4 CPUs and 2 Playwright workers, this workspace 2 CPUs and 1, so a
  test that needs another test's state passes here and fails there. Run the
  failing test alone (`npx playwright test -g "<title>"`) and its file with
  `--workers=2`. Failing alone = a real bug in the test: fix it now. Passing
  both ways = a flake: add it to "Flakes" in `docs/QUALITY.md` and carry on
  (your next push re-runs CI). Never add retries or loosen a check to hide a
  flake; a flake that repeats becomes a QF item. No e2e test may depend on
  another test's state: one server per test, or a serial file with a reason.
- **CI that never ran is not a code failure.** If the failed run's jobs have
  no steps (`.../actions/runs/<id>/jobs --jq '.jobs[].steps|length'` is 0)
  or its messages mention billing, a spending limit or minutes, the Actions
  minutes are used up. Do not try to fix it. Note "CI minutes exhausted" under
  Blockers once, and until CI runs again, run the full e2e suite locally
  before every push to main.

## 5. Work

1. **Resume first:** if PROGRESS.md names a `wip/<item>` branch, check it out,
   `git merge origin/main` (merge, never rebase), and finish it.
2. Otherwise take the first unchecked QF item marked **(High)**, wherever it
   sits; then the first unchecked item in ROADMAP.md.
3. Tests first where practical, then code. Before every push to main run
   `npm run check` and the relevant e2e specs; main must stay green.
4. Commit small. End every commit message with the attribution lines from your
   session's system reminder. `git fetch && git rebase origin/main` before
   pushing main (never rebase `wip/*` branches). Never force-push.
5. **Timebox: fixed clock, no forecasting.** All times are minutes after you
   took the lock. Runs have been ending around minute 39 because they guessed
   the next item would not fit; that guess is never a reason to stop.
   - **0–44: build.** When an item passes its checks, launch its reviewer in
     the background (§6.3) and start the next item in the same minute, however
     large it is. An item that will not finish this run still starts: its
     progress goes to a `wip/*` branch at 44 and the next run resumes it.
   - **At 44: hand off.** Commit the item in progress and push it to
     `wip/<item-id>` (`git push -u origin wip/<item-id>`) with a short "where
     I stopped" note in PROGRESS.md (branch, base SHA, next step).
   - **44–50: close out.** Fix findings from reviewers that have reported,
     check those boxes, write REVIEW-LOG and PROGRESS. A reviewer that has
     not reported by 50 leaves its box unchecked; note "review running, not
     back" and the next run re-launches that review first.
   - **Hard stop at 52**: release the lock and push. This frees the lock
     before the next hourly run checks it; a run that holds the lock past the
     hour makes the next run exit and wastes a whole hour.
   - Ending before minute 48 needs one of these reasons, written in the
     PROGRESS entry: `docs/DONE.md` written, a Blocker, or every remaining
     item is blocked or deferred.
   - Remote branches cannot be deleted from here; leave finished `wip/*`
     branches alone.
6. **Test scope.** Before each push to main: `npm run check` plus the e2e
   specs for the items you touched. Run the full e2e suite before every
   `Mx.A` and whenever you change shared server or UI code. CI runs the full
   suite on every push; a red main is the next run's first task.
7. Banned in committed code: `.skip`, `.only`, `@ts-ignore`,
   `@ts-expect-error` without a reason, `eslint-disable`, lowering the
   coverage threshold. Property and simulation tests use fixed seeds and
   print the seed on failure. Tests that start servers use random ports.

## 6. Adversarial review (required before checking any box)

1. When an item's acceptance criteria pass, launch a reviewer with the Agent
   tool in a **fresh context on a different model from your own**:
   `model: "sonnet"` for items; `model: "fable"` for the `Mx.A` item that
   closes each milestone. If the named model is unavailable or is your own,
   use another of `sonnet`, `opus`, `fable`, `haiku`. If no other model works,
   use a fresh-context reviewer anyway, mark the box `[~]` (provisional), and
   the milestone review must confirm it.
2. The reviewer prompt includes: the item text and acceptance criteria, the
   relevant DESIGN.md sections, the commit range (base SHA..HEAD), and these
   instructions: run `npm run check` and the item's e2e spec; for UI items,
   open the item's screenshots with the Read tool and judge them against
   DESIGN §9; look for bugs, mismatches with DESIGN.md, missing or gamed
   tests (banned patterns in §5.7), GM-only data reaching players, and UX
   problems; report High / Medium / Low with file:line and a concrete failure
   scenario; do not edit files.
3. **Review in parallel.** Launch the reviewer with `run_in_background: true`
   and `isolation: "worktree"` (so it tests the item's commit, not your
   working tree), then start the next item while it works. When it reports,
   fix the findings on the reviewed item before continuing.
4. Fix every High and Medium, re-run checks. A **second review round only
   if round 1 found a High or two or more Mediums**; otherwise verify your
   fixes yourself and log them. **At most 2 review rounds per
   item.** If a High remains after round 2, push to `wip/<item-id>`, log a
   Blocker, and move to the next item that does not depend on it.
5. Append to `docs/REVIEW-LOG.md`: date, item, reviewer model, findings,
   fixes.
6. Only then check the box.

## 7. Decisions

Pick the option most consistent with DESIGN.md and what Luke has said; log it
in `docs/DECISIONS.md` with one line of reasoning, continuing the D-number sequence (L-numbers are reserved for decisions made with Luke in chat). Game-design choices Luke
should weigh in on also go in `docs/QUESTIONS.md` with the default you used.

## 8. Finish the run

1. Append a run entry to `docs/PROGRESS.md`: start/end UTC (and the end
   minute; if before 48, the reason from §5.5), preflight results,
   items finished, test counts, engine coverage, review summary, open `wip/*`
   branches, next item, blockers. Update the header lines (Status, Next item,
   Blockers).
2. If this run checked an `Mx.A` box from MS onward, a preview build is due.
   Unattended runs may not publish it (the push to `release` is refused, as
   at MS.A and MQ.A), so do not try. Put "Preview ready: Actions → Release →
   Run workflow" in the PROGRESS Status line, naming the milestone. That is
   Luke's one click (D93); it is not a Blocker.
3. Delete `docs/LOCK.json`, commit `chore: release run lock`, push.
4. When every box is checked (none provisional) and M11.5 is clean, write
   `docs/DONE.md`: what was built, how to install and run it, known gaps.

## 9. Efficiency check (every 6th run; at most 5 minutes of yours)

Runs that take the lock in UTC hour 00, 06, 12 or 18 do this right after
Orient, then build as usual. Goal: more verified work per hour and per token,
never by lowering a gate. Changes need about 6 runs of data to judge; do not
react to a single run.

1. `npm run metrics -- --append` (adds a scorecard row to
   `docs/EFFICIENCY.md`). Read that file.
2. **Judge trials.** For each "In trial" change at least 6 runs old, compare
   its target and the guard metrics (Highs, round-2 share, main CI red) with
   its baseline. Keep it (move it to Kept) if the target improved and no
   guard got worse; otherwise revert it (move it to Reverted). Log the
   verdict as a D-entry.
3. **Ask a fresh eye.** Launch one background auditor (`model: "sonnet"`, or
   another model that is not yours) with the scorecard, the last 3 PROGRESS
   entries, the sweep log in `docs/QUALITY.md`, this file and
   `.github/workflows/ci.yml`. Ask for at most 2
   proposals, each with evidence, the metric it should move and by how much,
   its risk, and its tier. Keep building while it works.
4. **Apply at most one Tier 1 proposal per check**, at close-out: edit the
   protocol, config or scripts, add it to "In trial" with its baseline, log a
   D-entry. Put Tier 2 proposals under "Proposals for Luke" and as a question
   in QUESTIONS.md with the default "no change".
   - **Tier 1 (a run may apply):** reversible and costs no quality, safety,
     money or meaningful extra usage: read scope, caching, quieter output,
     work order, helper scripts, wording that removes an ambiguity.
   - **Tier 2 (Luke decides):** anything that weakens a gate (§5.6 tests,
     §6 reviews, CI coverage, banned patterns, Hard rules), changes the lock
     or the 52-minute stop, the schedule, or the models, adds parallel agents
     or lanes, or costs money.
5. **Second lane.** Once MQ.A is checked: if at least 4 of the next 10 open
   items touch neither `packages/engine`, the save-format version nor the
   golden logs, propose a second lane (Tier 2) with the item split.
6. If three checks in a row keep nothing, run the check every 12th run
   instead (hours 00 and 12) and note it in EFFICIENCY.md.

## 10. Quality sweep (every 6th run; the reviewers work in the background)

Per-item reviews (§6) see one diff at a time. A sweep has several models,
each on a different lens, look across items for what those reviews missed.
Lens briefs, the model rotation and the sweep log are in `docs/QUALITY.md`.

1. Runs that take the lock in UTC hour 03, 09, 15 or 21 launch a sweep right
   after Orient, then build as usual. Scope: `<Last sweep SHA>..HEAD` on main
   (from QUALITY.md), plus each lens's whole area.
2. Launch the 3 reviewers that QUALITY.md's rotation names for this sweep,
   each with `run_in_background: true` and `isolation: "worktree"`, never on
   your own model. Each prompt is the common rules plus that lens's brief from
   QUALITY.md, and the scope.
3. **Verify before fixing.** Confirm every High and Medium yourself (write the
   failing test, run the reviewer's probe, or trace the code path). Record
   unconfirmed ones as "not reproduced". Never change code on a reviewer's
   word alone.
4. **Triage confirmed findings:**
   - High: fix it this run, ahead of the current item (hand that item to
     `wip/*` if needed); if it cannot be fixed by minute 44, add it to
     "QF — Quality fixes" in ROADMAP.md marked **(High)**.
   - Medium: a new QF item.
   - Low: the Backlog in QUALITY.md (M11.5 goes through it).
5. Close-out: add a row to the sweep log (scope, lens and model, findings by
   severity, confirmed, not reproduced, the reviewer's token count if
   reported), set "Last sweep" to HEAD and advance the rotation. Log in
   REVIEW-LOG.md only the fixes you made.
6. Every QF fix gets its own §6 review like any item.
7. The rotation is part of this protocol. Dropping a lens or a model, adding
   reviewers, or changing how often sweeps run is Tier 2 (§9.4).

## Hard rules

- No secrets, tokens, or personal data in the repo. **The repo is public**
  (L10): write nothing you would not post publicly.
- Touch no other repositories. Use no paid services.
- Never delete campaign data or Luke's files.
- Players' browsers must never receive GM-only data.
- If something blocks you completely, log it under Blockers in PROGRESS.md,
  release the lock, and stop.
