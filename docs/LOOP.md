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

## 4. Orient

Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/QUESTIONS.md`,
`docs/DECISIONS.md`, `docs/DESIGN.md`, `docs/ROADMAP.md`.

- **Answers from Luke in QUESTIONS.md:** apply them by editing DESIGN.md (and
  DECISIONS.md) in the same commit, then build to DESIGN.md.
- **CI:** check the latest completed run on main:
  `GH_TOKEN= gh api "repos/luke59neilson-oss/the-system/actions/runs?branch=main&status=completed&per_page=1"`.
  If it failed, fixing it is your first task. After 3 runs in a row fail to
  fix it, log a Blocker and continue with roadmap work.

## 5. Work

1. **Resume first:** if PROGRESS.md names a `wip/<item>` branch, check it out,
   `git merge origin/main` (merge, never rebase), and finish it.
2. Otherwise take the first unchecked item in ROADMAP.md.
3. Tests first where practical, then code. Before every push to main run
   `npm run check` and the relevant e2e specs; main must stay green.
4. Commit small. End every commit message with the attribution lines from your
   session's system reminder. `git fetch && git rebase origin/main` before
   pushing main (never rebase `wip/*` branches). Never force-push.
5. **Timebox:** start no new item after **35 minutes**; hard stop at **60
   minutes** whatever the state. Unfinished work: push it to
   `wip/<item-id>` (`git push -u origin wip/<item-id>`) and record the branch
   and its base SHA in PROGRESS.md. Remote branches cannot be deleted from
   here; leave finished `wip/*` branches alone.
6. Banned in committed code: `.skip`, `.only`, `@ts-ignore`,
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
   tests (banned patterns in §5.6), GM-only data reaching players, and UX
   problems; report High / Medium / Low with file:line and a concrete failure
   scenario; do not edit files.
3. Fix every High and Medium, re-run checks. **At most 2 review rounds per
   item.** If a High remains after round 2, push to `wip/<item-id>`, log a
   Blocker, and move to the next item that does not depend on it.
4. Append to `docs/REVIEW-LOG.md`: date, item, reviewer model, findings,
   fixes.
5. Only then check the box.

## 7. Decisions

Pick the option most consistent with DESIGN.md and what Luke has said; log it
in `docs/DECISIONS.md` with one line of reasoning. Game-design choices Luke
should weigh in on also go in `docs/QUESTIONS.md` with the default you used.

## 8. Finish the run

1. Append a run entry to `docs/PROGRESS.md`: start/end UTC, preflight results,
   items finished, test counts, engine coverage, review summary, open `wip/*`
   branches, next item, blockers. Update the header lines (Status, Next item,
   Blockers).
2. If this run checked an `Mx.A` box from MS onward, publish a preview build:
   `git push origin main:release` (the release workflow does the rest).
3. Delete `docs/LOCK.json`, commit `chore: release run lock`, push.
4. When every box is checked (none provisional) and M11.5 is clean, write
   `docs/DONE.md`: what was built, how to install and run it, known gaps.

## Hard rules

- No secrets, tokens, or personal data in the repo.
- Touch no other repositories. Use no paid services.
- Never delete campaign data or Luke's files.
- Players' browsers must never receive GM-only data.
- If something blocks you completely, log it under Blockers in PROGRESS.md,
  release the lock, and stop.
