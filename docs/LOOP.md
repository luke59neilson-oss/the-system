# Autonomous run protocol

This repo is built by scheduled, unattended runs. Each run is a fresh session
with no memory of earlier runs. Everything you need is in this repo. Luke is
not watching; never stop to ask him a question.

## 1. Set up

1. If the repo is not attached, call `add_repo` (owner `luke59neilson-oss`,
   repo `the-system`, access `push`), then clone it exactly as that tool
   instructs (one clone, generous timeout). Work in `/home/claude/the-system`.
2. `git fetch origin main && git reset --hard origin/main` only on a fresh
   clone. Never discard someone else's pushed work.
3. GitHub API calls: use `GH_TOKEN= gh api repos/luke59neilson-oss/the-system/...`
   (repo-scoped endpoints only).

## 2. Lock

1. If `docs/DONE.md` exists, the build is finished. Reply "Build complete"
   and stop.
2. If `docs/LOCK.json` exists and its `started` time is less than 75 minutes
   ago, another run is active. Reply "Another run is active" and stop.
3. Otherwise write `docs/LOCK.json` `{ "started": <UTC ISO>, "run": <random id> }`,
   commit `chore: take run lock`, push. If the push is rejected, fetch,
   re-check the lock, and stop if someone else holds it.

## 3. Orient

Read, in order: `CLAUDE.md`, `docs/PROGRESS.md`, `docs/QUESTIONS.md` (any
answer from Luke there overrides the default), `docs/DECISIONS.md`,
`docs/DESIGN.md`, `docs/ROADMAP.md`. Check CI on `main`; if it is red,
fixing it is your first task.

## 4. Work

1. Take the first unchecked roadmap item. Big items may take several runs;
   PROGRESS.md says where the last run stopped.
2. Write tests from the acceptance criteria first where practical, then the
   code. Keep `main` green: run `npm run check` (and relevant e2e) before
   every push.
3. Commit small with clear messages. End each commit message with the
   attribution lines from your session's system reminder. Fetch and rebase
   before pushing. Never force-push.
4. **Timebox:** stop starting new work about 45 minutes into the run.
   Unfinished work goes to a branch `wip/<item-id>` with a note in
   PROGRESS.md; `main` must stay green.

## 5. Adversarial review (required before checking any box)

1. When an item's acceptance criteria pass, launch a reviewer with the Agent
   tool, **using a different model from your own**: `model: "sonnet"` for
   item reviews, `model: "fable"` for the review that closes a milestone.
   The reviewer gets a fresh context.
2. Reviewer prompt must include: the item text and acceptance criteria, the
   relevant DESIGN.md section, the commit range (`git log`/`git diff`), and
   these instructions: run `npm run check` and the relevant e2e; look for bugs,
   rule mismatches with DESIGN.md, missing tests, data leaks to players,
   and UX problems; report findings as High / Medium / Low with file:line and
   a concrete failure scenario; do not edit files.
3. Fix every High and Medium finding, re-run checks, and re-review if a
   High was found. Lows may be fixed or logged.
4. Append to `docs/REVIEW-LOG.md`: date, item, reviewer model, findings,
   what was fixed.
5. Only then check the box in ROADMAP.md.

## 6. Decisions

Never wait for Luke. Pick the option most consistent with DESIGN.md and
what Luke has said, then log it in `docs/DECISIONS.md` (one line of
reasoning). If it is a game-design choice he should weigh in on, also add it
to `docs/QUESTIONS.md` with the default you used.

## 7. Finish the run

1. Append a run entry to `docs/PROGRESS.md`: start/end UTC, items finished,
   test counts, engine coverage, review summary, next item, blockers.
2. Delete `docs/LOCK.json`, commit `chore: release run lock`, push.
3. When every roadmap box is checked and the final review is clean, write
   `docs/DONE.md` (what was built, how to run it, known gaps).

## Hard rules

- No secrets, tokens, or personal data in the repo.
- Touch no other repositories. Use no paid services.
- Never delete campaign data or Luke's files.
- Players' browsers must never receive GM-only data.
- If something blocks you completely (tool failure, missing access), log it
  in PROGRESS.md under Blockers, release the lock, and stop.
