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
