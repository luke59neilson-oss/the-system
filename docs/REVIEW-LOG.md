# Review log

<!-- Newest at the bottom: date · item · reviewer model · findings (H/M/L) · fixes. -->

## 2026-10-21 · M0.1 Monorepo scaffold · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 3 · L 7.
  - M: skip/only bans bypassable (computed access, chained modifiers, x-aliases, helper files) → ESLint selectors on any dotted/computed modifier in test files + repo-wide regex scanner + lint-rule test suite.
  - M: engine purity gaps (node globals leaked in, performance/crypto/timers/process, Date(), dynamic import, non-allowlisted imports) → engine-only globals ban, syntax bans, import allowlist (relative + zod).
  - M: dev.mjs broken on Windows and orphaned children → runs tsx/vite via node directly, checks build result.
  - L fixed: SPA fallback for /api, /health, /ws, dotted routes and HEAD; server now imports the engine; scanner covers .mts/.cts and whole repo; 90% engine line threshold. L deferred: CI Chromium install (M0.2), type-checking JS config files, server coverage.
- Round 2: H 0 · M 2 · L 3.
  - M: test bans skipped helper files under test/ → bans apply to test/, tests/, e2e/, __tests__/.
  - M: engine purity alias bypasses → ban aliasing/dynamic access of Date/Math/Reflect, spread new Date, eval, Function, self, Intl. Accepted residual: deliberate evasions (e.g. destructuring a test modifier) remain possible.

## 2026-10-21 · M0.3 LAN server skeleton · sonnet (fresh context, 1 round)
- H 0 · M 0 · L 6. Fixed: upgrade-refusal test now asserts a real 404 and server health; plain GET /ws pinned to 404; 5 s shutdown timeout. Deferred to M2.2: Origin/GM-key hook shape, per-connection registry, resume token in hello.

## 2026-10-21 · M0.2 CI · sonnet (fresh context, 1 round)
- H 0 · M 3 · L 8.
  - M: cancel-in-progress cancelled main runs (breaks LOOP's "latest completed run" check) → never cancel on main.
  - M: every-branch push + PR duplicate runs → push on main and wip/** only, PRs into main only.
  - M: release pushes re-run CI → release not in push branches.
  - L fixed: unit tests ran twice (now once with coverage); build and e2e split; if-no-files-found. L deferred: Playwright browser cache, action major bumps, step summary.

## 2026-10-21 · M1.1 Rules config · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 6 · L 7. All DESIGN defaults verified against the config.
  - M fixed: reserved rarity usable as ceiling/race skill/merge min; ceilings could decrease; levelCap unbounded (now must equal a grade top); unknown keys silently stripped (now strict, reported); migrations could throw or mutate input; index-only error paths (now id-qualified).
  - M deferred by design: M4.9 config-edit events address array entries by id (D22).
  - L fixed: reserved-last rule, hasOwn mark lookup, deduped errors, "is required", pace and starting-stat ranges, profession unlock not first grade, exported selectionLevels/gradeIndexForLevel.
- Round 2: H 0 · M 1 · L 6.
  - M fixed: JSON clone could throw on cycles/BigInt → returns an error.
  - L fixed: missing literal settings read "is required". L accepted: merge step, slot count, multiplier monotonicity left unbounded (engine items clamp); parsed config not frozen (M4.9 replaces immutably); strict keys mean new settings need a version bump + migration (D23).
