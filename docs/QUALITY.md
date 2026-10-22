# Quality sweeps

Per-item reviews (LOOP §6) see one diff at a time. Sweeps (LOOP §10) look
across items, with several models on different lenses, for what those
reviews miss. Decisions: L13 in `docs/DECISIONS.md`. Fixes are queued as QF items in
`docs/ROADMAP.md`.

**Last sweep:** 5e72abe (2026-10-22, pilot) · **Next rotation:** B

## Lenses and rotation

Each sweep runs 3 of the 4 lenses, each on a different model, never your
own. The skipped lens runs first next time. Rotate the pairing each sweep
so no model always reviews the same thing:

| Sweep | Rules | Boundaries | Tests | UX |
|---|---|---|---|---|
| A | fable | sonnet | haiku | (skip) |
| B | (skip) | haiku | fable | sonnet |
| C | haiku | (skip) | sonnet | fable |
| D | sonnet | fable | (skip) | haiku |

Then A again. Over four sweeps every model reviews every lens once. If a model is unavailable or is your own, use another of
`fable`, `sonnet`, `haiku`, `opus` that is neither.

### Common rules for every sweep reviewer

Scope: commits `<last sweep SHA>..HEAD` on main, plus the lens's whole area
when the diff is small. Only `[x]` roadmap items are claimed done; a DESIGN
rule whose item is unchecked is a known gap, not a finding. Skip findings
`docs/REVIEW-LOG.md` records as accepted, and anything in the Backlog below.
Review main only. Do not edit, commit or push. To run tests:
`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`, then vitest; never
`playwright install`. Report at most 10 findings, most severe first, fewer if
fewer are real: severity, file:line, what is wrong, a concrete failure
scenario, how to confirm (a test or command), confidence (certain / likely /
guess). Then the areas checked and found clean.

### Rules (packages/engine against DESIGN.md)
Feature interactions across items (evolution + pools + bonuses; selections +
passed-over + professions; XP splits + thresholds; quests + undo/replay);
replay of stored logs with versioned events, upcasters and rules flags;
goldens that really pin behaviour; determinism; rounding and boundary
levels; rule numbers hard-coded instead of from the rules config.
High = wrong outcome in normal play, data loss, crash, a stored campaign
that no longer replays.

### Boundaries (GM-only data, GM authority, input, Electron)
Every path to a player: projections, WebSocket broadcasts, REST endpoints,
error messages, session logs, file/portrait endpoints, the web bundle,
resync paths. GM authority: loopback and GM-key checks, header spoofing, key
leaks. LAN web risks: CORS, WebSocket Origin, CSRF, DNS rebinding. Input:
validation gaps, payload size, path traversal. Electron hardening.
Players picking a character without a password is by design (D3).
High = GM-only data reaches a player in normal use, a player runs GM
commands, remote code execution.

### Tests (can the tests catch bugs?)
Least-covered logic files in server and web; assertions that cannot fail;
missing rejected-input cases; un-awaited async; order-dependent tests;
fixed sleeps in e2e; fixed ports; unseeded property tests; goldens that can
silently regenerate; one or more concrete mutations that no test would
catch. High = a test guarding a hard rule (no GM data to players,
determinism, replay) cannot actually fail.

### UX (player and GM screens against DESIGN §9)
Open the newest screenshots in `docs/screens/` with the Read tool (1366×768
and 390×844 for player screens) and run the e2e specs if needed. Look for
unreadable text, overflow and clipping on phones, wrong or missing
information against DESIGN §9, metallic grade themes applied wrongly,
missing empty/error/loading states, keyboard and contrast problems,
confusing wording at the table. High = a player or the GM cannot do a core
table action, or the screen shows wrong game data.

## Triage

- Verify every High and Medium yourself before acting (write the failing
  test or trace the code path). Not reproduced → note it below; never fix on
  a reviewer's word alone.
- Confirmed High → fix this run (it outranks the current item), or make it
  the first unchecked item under "QF — Quality fixes" in ROADMAP.md.
- Confirmed Medium → a QF item. Low → Backlog below (M11 hardening sweeps it).

## Sweep log

| Date (UTC) | Scope | Lens · model | High | Medium | Low | Confirmed | Not reproduced | Tokens |
|---|---|---|---|---|---|---|---|---|
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Rules · fable | 1 | 0 | 1 | 1 H (QF.1) | 0 | 381k |
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Boundaries · sonnet | 0 | 2 | 3 | 2 M, one raised to High as a hard-rule leak (QF.2, QF.3) | 0 | 327k |
| 2026-10-22 17:30 | pilot A, whole repo @ 5e72abe | Tests · haiku | 0 | 5 | 4 | 4 M (QF.4–QF.7); 1 M lowered to Low (latency checks are acceptance criteria, now QF.8) | 0 | 343k |

Pilot notes: every confirmed finding was missed by the per-item reviews
(QF.1 is in MQ.3, reviewed twice the run before). No false alarms. The
reviewers ran 15–20 minutes each in the background.

## Flakes

- 2026-10-22 16:55 · CI on 5e72abe red in E2E; the same commit passed the
  full suite locally (35/35). Failing test unknown (job logs are not
  reachable from runs; CI now reports failures as annotations). See QF.8.

## Backlog (Lows; M11.5 goes through these)

- Rules: `offerSelection` (`evolution/model.ts` ~214) lets the GM offer a
  name the character already chose (and an evolution renamed) as a fresh
  option, so the character can end up with both forms (QF.1 review).
- Rules: `mergeSkills` (`skills/model.ts` ~219) does not refuse a retired
  skill name, unlike selections and transforms (D63).
- Boundaries: accepting a stale trade reveals the proposer's exact holdings
  ("has 7"); trade ids are client-chosen; some errors name party ids
  (`economy/model.ts` ~114, ~124; `commands.ts` trade.propose).
- Boundaries: no CSP, `frame-ancestors`, nosniff or Referrer-Policy on the
  app shell, and static serving allows dotfiles (`server.ts` ~61).
- Boundaries: `isAllowedHost` ignores text after `]`; `isLoopback` is unused
  while D3 still says "loopback or GM key"; a hand-set `GM_KEY` needs only 16
  characters and bad GM keys are not throttled (`security.ts`, `config.ts`).
- Tests: exact-limit cases are untested (nickname 60, note 2000, flavour
  1000, join name 200, portrait 2 MB), and some rejections are asserted with
  `toBeTruthy()`.
- Tests: web logic covered only by e2e (`live.ts`, `gmKey.ts`,
  `player/chime.ts`, `player/changeCount.ts`, `gm/portraitUpload.ts`).
- Tests: `e2e/M3.1.spec.ts` test 2 depends on test 1's end state.
- Tests: `apps/server/test/sessionLog.test.ts` ~437 waits up to 5 s with no
  assertion, so a failure shows up later as a length mismatch.
