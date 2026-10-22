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

## 2026-10-21 · M1.2 Character model · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 7 · L 5.
  - M fixed: raceLevel ignored rules (now takes rules, switches on rounding); state too thin (added schemaVersion, xp, free-point batches, titles); grade stored by index (now id); no immutability (readonly types, no shared nested state); hard-coded "Human" (now `rules.character.defaultRace`); starting skills not checked against the G ceiling, duplicates or blanks; poolMax silently 0 on missing stats (now throws, floors; clampPools added).
  - L fixed: formatStat rejects NaN/Infinity; tests for mutated rules, JSON round trip, aliasing, profession > class.
- Round 2: H 0 · M 0 · L 6. Fixed: float noise before flooring pools, non-finite pools treated as full, defensive rounding switch, unreachable fallback removed. Accepted: immutability enforced by types only; toPrecision(12) limit far above the 7,324 cap.

## 2026-10-21 · M1.3 Event-sourced core · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 5 · L 8.
  - M fixed: non-latest undo silently re-clamped a later pool set (pool sets now reject out-of-range values, so the undo is refused; D31); `execute` threw on malformed commands (shape check returns an error); no authority gate (`authorize`, GM/system only until player commands land; D32); upcasters only 1:1 payload maps (log-level raw upcasters; D33).
  - M kept by design: create events store inputs and re-derive with the log's rules (D34: rules live in the log; behaviour changes need a schemaVersion bump + upcaster; golden logs catch drift).
  - L fixed: replay/undo edge case pinned (D28), events JSON-cloned at parse, golden test checks undo map, property test compares on every step, id reuse after undone creation tested. L accepted: O(n) append/undo scans (fine at table scale; revisit in M11.3), structured undo error codes left for M4.8, state frozen by types only, timestamps not monotonic-checked.
- Round 2: H 0 · M 2 · L 5.
  - M fixed: raw-upcaster contract enforced (input copied, first piece keeps the original id so undo targets resolve, never drops; undo-through-split and idempotence tested); player branch of `authorize` tested via an injectable command set, with string-only id comparison.
  - L fixed: `__proto__` keys rejected at parse; stale pool comment; D28 text widened; golden logs checked by append as well as replay; property test now requires accepted non-latest undos and dependency refusals; latest-first undo lookup. L accepted: `execute` trusts its context (doc updated); `appendEvent` stays exported for the server's persistence layer (M2.1) and takes parsed events.

## 2026-10-21 · M1.4 XP and leveling · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 2 · L 6. Check values independently re-derived; basic.state.json regeneration confirmed additive.
  - M resolved: class spread uses a cumulative highest-deficit rule, not per-level largest remainder; kept as a documented departure (D35; per-level LR biases equal weights to the first stats), the differing case is pinned in tests, and the choice is raised as Q10. M fixed: spread totals now reset when weights are reshaped (`reshapeClassWeights`, for M1.10).
  - L fixed: split weights capped at 1000 (exact doubles); `shareBonus` shared by reducer and `splitXp`; share+weight rejected; campaign state bumped to v2; per-stat diverging-tracks spread, mixed-profession award rejection tests. L accepted: bonus measured at race level before the award (D36); golden xp state pins behaviour (values hand-checked).
- Round 2: H 0 · M 0 · L 2. Fixed: "within one point" wording softened to "about one point" (worst seen 1.04); DESIGN §4 left to Luke via Q10 rather than edited by a run.

## 2026-10-21 · M1.5 Free points · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 3 · L 4.
  - M fixed: player authority now enforced on every event entering the log (`checkEventAuthority` in append and replay), not only in `execute`; override-after-undone-assignment documented as intended (D38) and tested; property test now fuzzes player actors and requires accepted assign/override/award/undo, locked-batch rejections and accepted player assignments.
  - L fixed: no-op unassign rejected; delta accounting after `setStats` documented (D38); tests for player undo, empty allocation, replay of override-after-undo. L accepted: command schema leaves raceLevel/characterId checks to the payload schema.
- Round 2: H 0 · M 0 · L 3. Fixed: misplaced doc comment; D38 notes that a GM stat edit below a batch blocks overriding it until undone. Accepted: `fail()` relies on returning `never` (typed, so a change would not compile silently).

## 2026-10-21 · M1.13 Player projection · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 2 · L 6. No path found for GM-only or other players' data into a projection; canary seeding judged thorough.
  - M fixed: canary test now requires every one of the viewer's own sentinels to arrive (not just one stat); doc comment corrected: visibility tables force classification at compile time, while tests (key equality + canary) tie them to emitted keys (mutation-checked: a `leak: c.xp` party field fails 3 tests).
  - L fixed: own-property lookups for stat/pool ids and `defineProperty` writes (no `constructor`/`__proto__` surprises); pool-bar side channel documented (D39). L accepted: owner sees class weights/spread totals (DESIGN "own sheet in full"); no `projectAll`/diffing yet (M2.2 decides); duplicate-Identify tiebreak (first wins) left until skills can duplicate (M1.9). Noted for M2.2: raw domain events carry the same data as state and must never reach players unprojected.
- Round 2: H 0 · M 0 · L 1. Fixed: local `own` shadowed the `own()` helper (renamed `viewer`).

## 2026-10-21 · M2.1 Persistence · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 5 · L 6.
  - M fixed: short writes (`writeAll` loop; failed append cut back to the last whole line, store poisoned if that fails); multi-event appends now atomic (check all, one write, one fsync, then swap); torn-tail offsets computed at byte level from a Buffer (invalid UTF-8, BOM); torn bytes copied to `events.jsonl.torn-<stamp>` before truncation and repair only after the log validates ("never delete campaign data"); single-writer `LOCK` with stale takeover.
  - L fixed: malformed snapshot shapes fall back to replay; snapshot records the log-upcaster count; a refused tail append falls back to full replay; backups staged, fsynced, renamed; structural secret-key check instead of a content regex; Windows reserved ids rejected.
- Round 2: H 0 · M 3 · L 7.
  - M fixed: lock records host + boot minute (a pid reused after power loss no longer blocks reopening; another host's lock is refused with a hint); a failed snapshot write never fails a committed append or `close()`.
  - M accepted (D44): a power cut mid-write of a multi-event command could keep a prefix of its events; every command produces exactly one event today, and a group marker is required before any command emits several.
  - L fixed: fsync failure poisons the store; lock re-read before stale unlink; `backup()` allowed on a poisoned store; any throw in the snapshot path replays. L accepted: a snapshot whose envelope matches but whose state body was hand-edited is trusted (delete snapshot.json to force replay); reducer changes must bump event schema versions (D34), which invalidates snapshots; upcaster identity tracked by count only; ownership not rechecked per append.

## 2026-10-21 · M2.2 Live protocol and authority · sonnet (fresh context, 2 rounds)
- Round 1: H 1 · M 4 · L 4.
  - H fixed: GM HTTP gate checked the raw URL string, so `/%61pi/gm/export` and absolute-form requests reached the export without a key (reviewer confirmed live). Now authorized on a decoded, dot-resolved, lowercased path (`authPath`, 400 when unparseable or absolute-form) and on the matched route; raw-HTTP tests cover encoded, HEAD, absolute-form, `//` and trailing-slash variants.
  - M fixed: Host allowlist (localhost, IP literals, `*.local`) against DNS rebinding, 421 otherwise; notifications sent before the view and a `gap` flag when history can't cover `lastSeq`; only level gains notify and undone events' notifications leave the history.
  - M accepted (D46): GM key travels in cleartext if the GM uses a non-local client; no failure throttle (256-bit default key, GM window on the host via localhost).
  - L fixed: failed re-join resets the role; command exceptions answer with the requestId and one bad socket can't stop a broadcast; key length limits aligned (GM_KEY 16–1000).
- Round 2: H 0 · M 0 · L 4. Fixed: exact gap tracking after cap trims. Accepted: full snapshot per broadcast (fine at 5 clients; M11.1 soak will measure); join as any character with no password (by design, D3).

## 2026-10-21 · M2.3 Join helper · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 2 · L 4.
  - M fixed: the GM could only get a QR for the top-ranked address → `/api/join` now returns `options` (every URL with its own QR); the decode test now requires exactly one full-size white background rect and one black module path before decoding with jsQR.
  - L fixed: ranking no longer matches URL strings (ranks interfaces, formats via `joinUrls`, explicit `isWildcardHost`). L accepted: CGNAT/link-local ranked below public addresses; GM key printed to the local terminal only when generated (pre-existing, D46).
- Round 2: H 0 · M 0 · L 4. Accepted: offline fallback to 127.0.0.1 has no "unreachable" flag (the GM UI in MS.5 can show the list; noted for MS.5); QR capacity overflow on an absurd `--host`; a bare-hostname `--host` is refused by the Host check (pre-existing, D46); main.ts wiring covered only by a manual bundle smoke test (MS.5 desktop e2e will exercise it).

## 2026-10-21 · MS.1 Minimal GM screen · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 2 · L 7.
  - M fixed: broadcasts lived only in the hub's in-memory notifications, so a player asleep or a server restart lost them → campaign state v3 keeps `broadcasts`, the player view carries `messages` addressed to the viewer (no recipient list), projection canary seeds owner-only whispers and GM-only keys; e2e now checks a whisper reaches Jake's view and not Miranda's over real sockets.
  - L fixed: GM feed folds one broadcast to many into one row ("Everyone"); XP amount must be > 0; `commandSchema` declares `characterIds`; engine event ids stripped from error text; viewport screenshot without a stale error, plus a full-page one; 3-column layout at 1366.
  - L accepted: client keeps all notifications (table scale); key stays in sessionStorage for the tab (Forget key button); starter class keyed by default stat ids (test checks they match the default stat list).
- Round 2: H 0 · M 0 · L 4. Accepted: no test with a realistic v2 snapshot (any version mismatch replays; existing stale-snapshot tests cover the rule); GM feed starts empty after a GM reconnect (past broadcasts are in state; M4.7 will list them); `messages` unbounded per view (cap by M4.7); feed grouping relies on one event per command (D44).

## 2026-10-21 · MS.2 Minimal player screen · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 3 · L 4.
  - M fixed: DINGs lost on reload or late join → client joins with `lastSeq: 0` so the hub resends this run's notifications for that character (e2e checks after reload and for a late joiner); `gap` was ignored → shown as a notice; `lastSeq` now also advances from notification seqs.
  - L accepted: server error matched by its text ("Your character no longer exists"; an error code can come with M3.1); no [Assign] button (M3.4); stat grid is 4 columns at 1366 rather than the 5+4 lines of §9; brackets wrap at 390 (M3.2 polishes the sheet); no 1920 screenshot (ROADMAP asks for two viewports).
- Round 2: H 0 · M 1 · L 4.
  - M fixed after round 2 (small, re-checked with check + e2e): a server restarted with an existing campaign flagged a gap on every first join → the notice now shows only after a reconnect on the same page, worded as "missed while you were disconnected".
  - L accepted: gap flag is sticky for the page; an undone DING stays in an open page until reload; GM first load asks for the full in-memory history (≤ 5000); identical notifications from one event collapse in the client dedupe.

## 2026-10-21 · MS.3 Perspective switcher · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 3 · L 8.
  - M fixed: quarter-screen panes showed only ~3 sheet rows → compact pane-mode styling plus the newest DING and System message pinned above the sheet (e2e checks both are in view); switching perspectives tore down every pane → Table panes stay mounted (hidden) once opened; the 1 s DING check now starts before the click (≤ 1000 ms) and also asserts the Race DING; added an HTTP canary over every response a pane frame loads.
  - L fixed: fixed `calc(100vh - 80px)` heights broke when the header wrapped → flex column filling the window; comment on the same-origin frame (it shares the tab's sessionStorage; only our player bundle runs there; never render unsanitised HTML).
  - L accepted: no notice when a viewed character disappears (falls back to GM); stale ids in the pane pick list are ignored; host-only GM link checks `[::1]` (Chromium form); redundant "Player view · Name" title and a small left inset in the single-character view; pane mode has no 390 screenshot (GM screen).
- Round 2: H 1 · M 1 · L 4.
  - H fixed after round 2 (the round-1 "keep panes mounted" change had not applied — a scripted replace missed after formatting): Table panes are now really kept mounted inside a hidden `.table-side`; the e2e sets a marker in each pane frame, switches Table → Jake → Table and checks the same frames survive (the old test passed on server replay alone). Re-checked with `npm run check` + full e2e; the unpick check still proves an unpicked pane is removed, not hidden.
  - M fixed: `iframe:visible` counts could mask a leak → the unpicked-pane check counts all iframes.
  - L fixed: party table scrolls inside the narrow Table-view GM column; Table screenshot taken with the GM column scrolled to the top.
  - L accepted: two sockets for one character while a character view and the hidden Table pane coexist (both player clients); phone-width GM window may double-scroll in character view.
- Process slip: 63823e9 was pushed with a typecheck error in the e2e spec (`window` in a tools-tsconfig file) because the push chain checked `echo`'s status, not `npm run check`'s; fixed in the next commit three minutes later. Pushes after that gate on the check's exit code.

## 2026-10-21 · MS.4 Demo campaign · sonnet (fresh context, 2 rounds)
- Split judged reasonable (D53): titles, items, quests/stability and grades above G wait for M1.6/M1.7/M1.10/M1.12 → new item M1.15.
- Round 1: H 0 · M 4 · L 7.
  - M fixed: phones were stranded "refused" after a switch → a player whose character is in the other campaign sees "The GM has switched to another campaign…" and retries every 3 s, rejoining when the GM switches back (e2e); no confirm and no demo marker → confirm before loading the demo, demo badge on player screens; each switch built a fresh hub and lost notification history → one hub per campaign for the server's life (e2e: GM feed and Ada's DINGs survive); a client offline during the switch kept the other campaign's state → `hello` names the campaign and the client resets whenever it differs.
  - L fixed: open failure → 409, seed failure closes the store and answers 500 (the seed is one write); onClose closes extra stores in try/catch; tests for the hello campaign and the 404 without an opener.
  - L accepted: export follows the active campaign; stale GM form state after a switch; a command racing the switch lands in the campaign it was sent to.
- Round 2: H 0 · M 1 · L 5.
  - M fixed after round 2 (small; re-checked with check + full e2e): a page loaded while the other campaign was open got the plain refusal → the client also treats "built-in demo character on the real campaign, or real character on the demo" as switched (e2e: a late-loaded Ada page waits, then rejoins).
  - L fixed: retries stop when a refusal is not a campaign switch; the 409 body no longer carries server paths.
  - L accepted: player home `/` list is fetched once and carries no demo marker (M3.1 rebuilds the join screen); `window.confirm` in the desktop wrapper to verify at MS.5; MS.3 table screenshot differs run to run (pixel noise).

## 2026-10-21 · MS.5 Desktop wrapper (preview) · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 4 · L 6.
  - M fixed: no quit timeout → 5 s `app.exit` guard; closing the GM window silently dropped the table → "Quit The System?" question; no tests for `startApp` → `apps/server/test/app.test.ts` (listen, given/generated key, idempotent close, busy port and missing web build both release the campaign lock); CI never bundled the desktop main → CI step `npm run build -w @the-system/desktop` (no Electron binary needed).
  - L fixed: window URL uses 127.0.0.1 (Windows may try ::1 first); release builds get no DevTools and no View menu; permission requests denied; redirects blocked like navigations.
  - L accepted (M10.1/MS.6): crash handlers; `THE_SYSTEM_DATA_DIR` honoured in release builds; `resources/web` must come from packaging; smoke test is environment-coupled and not in CI by design.
- Round 2: H 0 · M 2 · L 5.
  - M fixed after round 2 (small; re-checked with check, full e2e and the desktop smoke): the quit question was a sync dialog that froze the in-process server → async dialog; `Menu.setApplicationMenu(null)` would remove Cmd+C/V on macOS → app + Edit menus on macOS.
  - L fixed: no window reopen (second instance, Dock) while quitting; Windows session end skips the question; a quit during start closes what started.
  - L accepted: no permission *check* handler; release-only settings are not covered by the unpackaged smoke test (MS.6 packaging will).

## 2026-10-21 · MS.6 Preview release · sonnet (fresh context, 2 rounds)
- Round 1: H 0 · M 4 · L 7.
  - M fixed: unsigned universal mac app may be "damaged" on Apple Silicon → ad-hoc signing (`identity: '-'`), `codesign --verify` and a launch smoke on the mac runner, `xattr -cr` note in the release text; publish not rerun-safe and could leave a half-filled public release → tag `preview-<date>-<run>.<attempt>`, draft first, publish after upload; only Linux was launch-tested → Playwright packaged smoke on Windows and macOS too; `*.exe` glob could publish stray exes → explicit `*-setup.exe`/`*-portable.exe` globs and an exact four-file check.
  - L accepted: smoke uses a temp data dir, so the real userData path is not exercised (M10.1); no Electron fuses (local user is the GM; noted for M10.2); `sourceMappingURL` comment in main.cjs (map not shipped); AppImage step's pkill is broad (CI only).
- Round 2: H 0 · M 2 · L 5.
  - M resolved by evidence: ad-hoc signature with hardened runtime might fail to launch → the dry run's mac job (macos-15-intel) passed `codesign --verify` and launched the packaged app with Playwright; Windows exe path under Git Bash → the Windows packaged smoke passed (runs 7c469f2 and b88418e).
  - L accepted: a failed `edit --draft=false` leaves a draft (rerun gets a new tag); a rerun after success makes a second release with the same title; `collect` has `contents: write` on the dry-run branch (publish guarded by `if`); pkill pattern tied to the artifact name; smoke assumes `<div id="root"`.
- macOS arm64 runners never picked up the job (capacity notice); the mac build moved to `macos-15-intel` (D55).
- Acceptance: Release workflow run 39663632813 on `release-dry-run` (b88418e = main) green: Windows setup + portable, macOS universal dmg, Linux AppImage, all launch-tested; `collect` found exactly the four files. Publishing to Luke happens at MS.A (push `main` to `release`).

## 2026-10-21 · MS.A Milestone acceptance and review · fable (fresh context, 2 rounds)
- Scope: whole MS milestone (b7ab8e0..13c255d) plus the new acceptance spec `e2e/MS.A.spec.ts`. Reviewer ran `npm run check`, all 11 e2e specs and `npm run desktop:smoke` (all exit 0), viewed every MS screenshot, audited player data isolation (projection allowlist, hub notification filter, `/api/*` deny-by-default, 1012 close on campaign switch: no leak) and ran the release workflow's publish script against a stubbed `gh`.
- Round 1: H 0 · M 1 · L 7.
  - M fixed: from the desktop build there was no way to open the GM console in an ordinary browser on the host (key never printed, "GM key needed" page pointed at a terminal) → GM link section in the GM-only Players join box, updated help text, spec opens the link in a second page (D56).
  - L accepted: Table view clips the GM party table and pane stats need scrolling at 1366×768 (M8 look and feel); no "connect to wifi" hint when only 127.0.0.1 is found (M3/M10); DING wording split into Class and Race lines (matches DESIGN §2); hard 1 s DING timeouts could flake on slow CI (it is the acceptance criterion); Stamina not refilled on level-up (deliberate clamp; noted for DESIGN); release runs cost ~30 Actions minutes (macOS ×10); MS.A checks WS frames only, HTTP canary lives in MS.3.
- Round 2: H 0 · M 0 · L 4.
  - L fixed: Copy button threw outside a secure context (`navigator.clipboard` missing at a LAN-IP origin) → falls back to selecting the field.
  - L accepted: link carries the page's origin (LAN origin = key over wifi, already D46); screenshot shows the fixed e2e test key; the phone text check is weaker than the frame canary that already covers the key.
- Note: running e2e rewrites tracked screenshots (the join URL port changes); discard re-renders not tied to the item.

## 2026-10-21 · M1.6 Titles and bonuses · sonnet (fresh context, 1 round)
- Round 1: H 0 · M 0 · L 8. Reviewer ran `npm run check` (exit 0) and coverage (99.19% lines).
  - L fixed: net-sum cap documented and tested (+40% −20% → +20%); duplicate source ids rejected; per-source `contributions` in the breakdown for the player's System text; base stats must be whole numbers; summed penalties ≤ −100% floor at 0 tested.
  - L accepted: `kind` is a closed union and `stat` a runtime-checked string (fine until M1.7); sub-0.0001% bonuses snap to 0; the fixed-seed LCG overflows 2^53 but stays deterministic, and the brute-force reference mirrors the formula (hand-computed cases cover the values).

## 2026-10-21 · M1.7 Items and economy · sonnet (fresh context, 1 round)
- Round 1: H 0 · M 0 · L 6. Reviewer ran `npm run check` (exit 0) and coverage (99.35% lines).
  - L fixed: trade accept settled sequentially, so a side could pay with what it was receiving in the same trade → both sides are now checked against their pre-trade holdings first (test added); an `item.edit` that changes nothing is rejected.
  - L accepted: trades are never pruned and have no per-proposer cap (M3.7/M6 can add limits or archiving); the GM must unequip before taking an equipped item (UI to explain, M3.7/M6.1); item rarity reuses the skill rarity ladder and slot `kind` is unused (no two-handed rule in DESIGN); equipped keys for slots missing from the rules are ignored (rules are fixed per campaign, unreachable).

## 2026-10-21 · M1.8 Practice log and notes · sonnet (fresh context, 1 round)
- Round 1: H 0 · M 0 · L 7. Reviewer ran `npm run check` (exit 0) and coverage; traced every GM-bound path (state frames, notifications, error strings, HTTP) for unshared journal text.
  - L fixed: repeat detection was O(n²) per character → one keyed pass; entries logged outside a session (null session) were all treated as one session → never repeats.
  - L accepted / carried forward: the backup export and files on disk hold journal text (D62, Q17); differing error texts reveal whether a guessed note id exists (M3.10 uses server ids, noted on the roadmap); pairs keyed by skill name are lost on rename/evolution (M1.9/M1.10 transforms); practice entries need edit/remove and a reviewed flag (added to M5.5); selection alert does not know whether a selection was taken (M1.10); player-side note projection and canary (added to M3.10).

## 2026-10-21 · M1.9 Skills · sonnet (fresh context, 1 round)
- Round 1: H 0 · M 0 · L 6. Reviewer ran `npm run check` (exit 0) and coverage; judged the property test's explicit unreachable set (`character.professionGranted`, `skill.merged`) stricter than the old count check, not gamed.
  - L fixed: command-level paths for "no mark upgrade" / "cannot upgrade past Mythical" now tested; the per-grade merge limit tested across a grade change; a merged skill may no longer reuse an original's name (it would inherit the original's practice-log pair counts), with a test; merge result's lost nickname/Unique documented in D63.
  - L accepted: mark session ids are not checked against known sessions (sessions arrive in M4.3); nickname payload allows 200 chars while the rule caps at 60 (the reducer enforces 60). Carry-over for M1.10: skill transforms must rewrite or alias practice-log names.

## 2026-10-21 · M1.10 Selections and evolutions · sonnet (fresh context, 2 rounds)
- Round 1 (fb2588c..e069e39): 0 High, 3 Medium, 4 Low. `npm run check` green; golden state diffs purely additive; authority and projection canary OK.
  - M fixed: undoing an already-answered re-release/re-offer silently re-aimed the choice (positional option ids). Choices now carry the `releaseId`/`offerId` they answer; stale ids are refused, so such an undo is refused (D65).
  - M fixed: banked profession XP and lagging-profession paths untested → full release→choose tests under both gates (repricing documented in D65).
  - M fixed: selection pending across an evolution untested → test (keeps its own grade's ceiling, Q21); transforms may not take a name on a pending menu.
  - L accepted: evolution option count reuses `menuSize.max` (D64); reshape validated pre-grade (not grade-dependent); case-only renames; `selectionSlots` recomputed per call (cheap).
- Round 2 (e069e39..d409f6b): 0 High, 0 Medium, 5 Low.
  - L fixed: a menu could offer a name a pending release transforms into; a rarity-only transform was refused when its own name was on a pending menu.
  - L accepted: hand-edited logs may omit the optional ids (old "answer what is pending" behaviour); default id parameters used only by direct callers; v7 amended in place before the item was checked (nothing shipped).

## 2026-10-21 · M1.11 Resolution and clocks · sonnet (fresh context, 2 rounds)
- Round 1 (d8368fc..3767a2d): 0 High, 2 Medium, 4 Low. `npm run check` green; goldens additive (v8); clocks GM-only and canary-checked; property test reaches every clock command.
  - M fixed: the ±2% test ran 1:1 and 2:1 only on equal grades and both cross-grade cases in one direction → 36 cases (3 modes × 4 ratios × E/E, F/D, D/F).
  - M fixed: the test compared rolls with `contestChance` itself and a loose tolerance → odds written out independently, tolerance 0.015, plain ratios pinned as literals.
  - L fixed: clamped success ticks let a non-latest undo change what a later tick filled → overfilling ticks are refused; a failure tick must have amount 1.
  - L accepted: flat ⅓ whatever the grade gap (DESIGN wording; raised as Q22); `newClock` trims an already-trimmed name.
- Round 2 (3767a2d..33da202): 0 High, 0 Medium, 4 Low (accepted: the stricter tick rule ships with the clocks themselves, so no stored log predates it; random generator now proposes more rejected ticks; Q22 open; the test's odds helper restates the spec).

## 2026-10-21 · M1.12 Quests and World Stability · sonnet (fresh context, 1 round)
- Round 1 (d550b0f..b939248): 0 High, 0 Medium, 5 Low. `npm run check` green; hidden quests, hidden gauges and tag rules never projected (canary extended); authority whitelist unchanged; engine pure.
  - L fixed: action tags typed with capitals or spaces missed their rule → the command lower-cases and trims; nudging a closed quest (GM override) is now pinned by a test.
  - L accepted: a quest's start day follows undone day advances (only days left change); `quests` labelled `owner` though it is projected through `PlayerQuest`; timers never auto-fail a quest (GM-driven, DESIGN §7).

## 2026-10-21 · M1.14 Campaign simulation · sonnet (fresh context, 2 rounds)
- Round 1 (e0ead5f..6b330d5): 3 High, 4 Medium, 5 Low. `npm run check` green, coverage 99.14%, no banned patterns, no engine bug found.
  - H fixed: pacing came from a catch-up controller and the session-40 top-up, so "mean 6" was a tautology → each character gets a random per-session plan (4–8 each, summing to 240, built by random ±1 transfers with no catch-up). Gains must equal the plan, and each evolution must land in the session where the plan reaches its threshold. DESIGN "Reached by session" is checked as ceil(threshold / 6).
  - H fixed: the pending-evolution leak check never ran (release and choose in one step) → `checkLeaks` runs while each release is pending, after each deferred menu, and at every session end. Names are unique and delimited.
  - H fixed (partly accepted): leak coverage was narrow → mid-session checks added. Item fields are not checked here (economy isn't projected; the projection canary covers it).
  - M fixed: XP was never banked while held → about half of evolutions bank 1–2 levels of XP first (levels unchanged, XP grows), then the test asserts the exact levels gained after the choice.
  - M fixed: the profession track was always the lower one → the track is picked at random; the budget invariant still runs after every command.
  - M fixed: some assertions had no seed, and a crash inside the run had no test attribution → the seed is in every message; the run is lazy and cached.
  - M fixed: the budget invariant reads the same config as the engine → a test pins the config to the DESIGN §3–§5 tables.
  - L fixed: thresholds tightened. L accepted: no undo or rejections in "valid play" (the M1.3 property test covers those).
- Round 2 (6b330d5..f7fa131): 0 High, 1 Medium, 5 Low.
  - M fixed: banking was class-only → profession XP is banked too once a profession exists, and the test asserts the other track is unchanged.
  - L fixed: a simulation error is cached, so the remaining tests don't re-run it; the DESIGN pin covers selection interval and rarity ceiling; the montage now happens deterministically in session 2.
  - L accepted: releases are never left pending across a session boundary (M1.10 tests cover pending states); with random pacing, "Reached by session" is checked arithmetically rather than through the run.

## 2026-10-21 · M1.15 Demo campaign content · sonnet (fresh context, 2 rounds)
- Round 1 (c213ecf..148ec52): 0 High, 1 Medium, 6 Low. `npm run check` and e2e MS.4 green. Players can't append or replay the title event; the golden log covers award and undo; no leaks (award reasons, tag rules, other players' menus, others' titles); the real campaign is untouched.
  - M fixed (documented deferral): the player screen doesn't draw quests, items or menus yet → ROADMAP M3.6–M3.8 now require their e2e to show the demo's open menu, gear and stability gauge (D70).
  - L fixed: a non-string title threw instead of being refused (trimming moved to the payload schema, with a test); the quest broadcast said 30 days at day 5; budget and pool checks now cover every demo character.
  - L accepted: filler skill names and arbitrary picks until the M4 content library; Q23 (party sees titles?) open with an owner-only default.
- Round 2 (148ec52..df5724a): 0 High, 0 Medium, 0 Low.

## 2026-10-21 · M1.A Milestone acceptance and review · fable (fresh context, 2 rounds)
- Acceptance: `npm run check` green (494 tests), engine line coverage 99.19%, all 11 e2e specs pass, golden logs cover all 44 event types, no host globals in the engine, authority and projection allowlist hold under probes.
- Round 1 (main c065d6e): 0 High, 1 Medium, 6 Low.
  - M fixed: the snapshot cache ignored the rules config version, so after a rules migration a stale `state.rules` would be trusted → snapshot format v2 records `rulesConfigVersion` (D71), with a test.
  - L fixed: a rarity-keeping evolution transform wiped banked marks (it now keeps them, tested both ways); `localeCompare` in derived lists replaced by code-unit order.
  - L logged: a non-latest XP undo re-prices a later above-level bonus (D71a; M7.3 note); class-gate free-point pricing (D71b); profession start vs banked XP (Q24); declining an offered profession (Q25).
- Round 2 (c065d6e..56b2db6): 0 High, 0 Medium, 1 Low (`evolution.chosen` meaning changed without a version bump; no released log can contain it → stated in D71).
- Not done: pushing `main` to `release` (the global rule for Mx.A). The session's permission classifier refused it at MS.A as a production deploy, so it was not retried (see PROGRESS blocker).

## 2026-10-22 · M2.4 Session log autosave · sonnet (fresh context, 2 rounds)
- Round 1 (d95c360..be60158): 0 High, 2 Medium, 5 Low.
  - M decided: hidden quest titles and GM reasons reach the log. Kept on purpose, because the log is GM-only prep for Claude. The file header now says so, with a test (D72, Q27).
  - M fixed: each write refolded the whole campaign on the event loop. It now caches the pre-sitting fold (`sessionLogBase`) and refolds only after an undo reaches back before the sitting. Tested in the engine for equivalence and staleness, and in the writer.
  - L fixed: a failed write left a temp file behind. It is now removed, with a test that forces the rename to fail.
  - L accepted:
    - Timeline lines are computed from the final undone set.
    - The final write depends on `app.close()` within the 5 s exit guard.
    - A crash loses up to 5 minutes of log.
    - Demo logs go to `exports/demo/`.
- Round 2 (be60158..9bf0d6d): 0 High, 0 Medium, 5 Low.
  - L fixed (test gaps): temp-file cleanup, and the writer reusing its base across a pre-sitting undo.
  - L accepted: the cached state relies on reducer immutability (true today); the validity check costs O(sitting) per write; the `closeSync` EIO edge.

## 2026-10-22 · M2.A Milestone acceptance and review · fable (fresh context, 2 rounds)
- Acceptance: `npm run check` green; engine line coverage 99.34%; all 12 e2e specs pass, including the new `e2e/M2.A.spec.ts`. That spec runs a GM and 2 browser players through a torn write and a restart on the same port. Both phones reconnect, the session log is written on a real SIGTERM, the export is checked, and a canary is run. Every M2.1–M2.4 criterion was traced to a non-gamed test.
- Round 1 (main 9818e4f): 1 High, 1 Medium, 7 Low.
  - H fixed: when a socket never answered the close handshake (a sleeping phone), shutdown went past the 5 s exit guard. No session log was written, no snapshot was taken, and LOCK was left behind. A `preClose` hook now writes the logs and terminates the sockets (D73a), with a raw zombie-socket test that fails without the fix.
  - M fixed: a host name that changed with the network made a crash-left lock look foreign. Locks now carry a machine id, kept by the desktop in `<userData>/machine-id` (D73b), with tests.
  - L noted:
    - (1) The boot-minute tolerance can be fooled by a large clock step.
    - (2) `normalizeAddress`/`isLoopback` are tested but unused.
    - (3) Windows log-off skips the close steps.
    - (4) `backup()` and `importCampaign` have no callers yet; M4.3 and M10.1 wire them.
    - (5) A new campaign's files are not directory-fsynced.
    - (6) A poisoned store is invisible to the GM.
    - (7) `/api/gm/export` with no campaign answers 200 `{error}`.
- Round 2 (9818e4f..bb892f4): 0 High, 0 Medium, 3 Low.
  - The legacy no-machine lock path is not tested since the test edit: fixed by adding a case.
  - `machine-id` is written non-atomically: accepted.
  - Terminal and desktop ids differ on a shared data dir: accepted, dev-only.

## 2026-10-22 · M3.1 Join screen · reviewer: sonnet (fresh context)
- Round 1 (2bd81f3..de5a067): 1 High, 0 Medium, 4 Low.
  - H: `npm run check` failed at typecheck: the e2e init script used `window`, but the tools tsconfig has no DOM lib. Fixed with `globalThis`, plus an in-page assertion that storage access really throws.
  - L accepted: placeholder metal colours in CSS until M8.1; the portrait image branch is untested until M4.4 sends portraits; overlapping Refresh clicks can resolve out of order; no fresh-state 1366×768 shot (the 390×844 one covers it).
- Round 2: 0 High, 0 Medium; check and spec green.

## 2026-10-22 · M3.2 Status screen · reviewer: sonnet (fresh context)
- Round 1 (b0e1210..eeed569): 0 High, 3 Medium, 6 Low.
  - M: live updates were tested only for levels. Fixed: the e2e now checks a stat, a pool maximum and its bar width, and free points, each with the glow.
  - M: the compact View-as pane was not checked with the new skill lists. Fixed: compact pane CSS, plus a 340×600 `?pane=1` check with no sideways scroll and a screenshot.
  - M: the glow compared against the first value, so a change back to it did not glow. Fixed: a change counter (adjust state during render) keys the remount.
  - L fixed: pool bars clamped to 0–100 (`poolPercent`, unit-tested); track rows pass unbreakable parts instead of splitting on " – ".
  - L accepted: rarity colours are CSS placeholders keyed by config ids (M8.1); no `aria-live` on status values (the feed announces changes); pool labels wrap at 390; duplicate skill names cannot occur (D63).
- Round 2 (eeed569..351c49a): 0 High, 0 Medium. Lows: the change counter does not reset if a pane reuses its instance for another character (panes are keyed per character), labels wrap, no 1920×1080 shot.

## 2026-10-22 · M3.3 Notifications and history · reviewer: sonnet (fresh context)
- Round 1 (18b39ff..ccd68ac): 0 High, 3 Medium, 6 Low. No GM-only leak found.
  - M: the DING queue counted positions, so an undo could make it skip or swallow a later DING. Fixed: the queue tracks what was shown by identity (`nextArrival`/`notificationKey`, unit-tested).
  - M: an undo while a player was offline left the undone DINGs on their screen after a reconnect. Fixed: a rejoin whose `lastSeq` predates an undo gets the whole history with `reset: true` (hub and sync tests).
  - M: an undo refolds the whole log. Measured about 20 ms for 3,000 events. Kept and documented in D76, since undo is rare.
  - L fixed: the toast covered the header and Sound button, so it now sits at the bottom of the screen (phone check and a 390×844 screenshot added). The nested `role="status"` was replaced by an always-mounted `aria-live` wrapper.
  - L accepted: missed DINGs queue after a reconnect (click through them); search covers the book text and day only; protocol v3 drops `gap`.
- Round 2 (ccd68ac..1d400d3): 0 High, 0 Medium.
  - Lows: a DING whose numbers change after an undo can pop again with corrected text, which is accepted as right.
  - The shown-key set is never pruned, which is negligible.

## 2026-10-22 · M3.4 Free points · reviewer: sonnet (fresh context)
- Round 1 (d39e723..4ce5cb8): 0 High, 4 Medium, 5 Low.
  - M: an open panel switched to another batch silently after a GM override or undo. Fixed: the panel is pinned to the batch it opened and closes with a notice if that batch is no longer open.
  - M: focus was lost at every step. Fixed: focus moves to the heading, then Confirm or Review, then back to [Assign]. The live glow no longer remounts the row, so [Assign] keeps focus.
  - M: tests covered only the happy path. The e2e now covers the keyboard, a GM override while the panel is open, and no [Assign] in the GM pane.
  - M: the 1366 screenshot was cut off. There is now a full-page assign shot and a review-step shot.
  - L fixed: steppers are 40px tall; a lost connection says "check your sheet".
  - L accepted: the stepper value change is not announced per stat ("Points left" is live); `Batch.locked` is unused by the UI (D38 locks every assigned batch).
- Round 2 (4ce5cb8..9b98ced): 0 High, 2 Medium, 5 Low.
  - M: a refusal that raced a GM override, arriving after the panel closed, was dropped. Fixed: the result is reported to Status, which shows a notice when the panel is already gone.
  - M: a stale focus-return flag could steal focus later. Fixed: a close bumps a counter and its effect focuses [Assign] once.
  - The GM-forced close now returns focus too.
  - Lows accepted: the notice stays until the next [Assign]; no e2e for the confirm-versus-override race (timing-dependent).
- LOOP §6.3 allows 2 rounds and no High remained, so the round-2 Mediums were fixed without a third review.

## 2026-10-22 · M3.5 Skill detail · reviewer: sonnet (fresh context)
- Round 1 (67d7cee..f6f895e): 0 High, 2 Medium, 5 Low.
  - M: the GM had no way to write skill text (only a raw command). Fixed: a "Skill text" form in the GM console (D79); the e2e uses it.
  - M: a renaming evolution transform kept the old skill's text. Fixed: a renamed skill's text clears; a same-name transform keeps it (unit test and e2e).
  - L fixed: when an open skill disappears, focus goes to the Status heading and the notice clears after 8 s.
  - L accepted: DING pop-ups sit under the open modal (they stay in the history); the dialog's `100vh` max height on mobile toolbars; page scroll behind the modal; colour checked for one rarity only (the others are CSS placeholders until M8.1); a live nickname change while editing keeps the draft.
- Round 2 (f6f895e..329c3f7): 0 High, 0 Medium, 4 Low.
  - L fixed: the Skill text draft is tied to one character's skill and resets after a save; Save is disabled while the text is unchanged.
  - L accepted: a draft does not follow an outside change to the same skill while it is being edited; an identical notice twice within 8 s does not restart its timer.

## 2026-10-22 · M3.6 Skill selection · reviewer: sonnet (fresh context)
- Round 1 (a250b31..078936c): 0 High, 3 Medium, 6 Low.
  - M: Escape during an in-flight confirm closed the dialog, and a later refusal was always reported as a GM change. Fixed: the dialog's cancel is blocked while busy. A refusal after close names the real reason, or for a lost connection says "may already be saved" (`settleNotice`, unit tested).
  - M: focus after a successful choice could fall to `<body>` when the result arrived before the new view. Fixed: `justChose` keeps [Choose] hidden and holds focus until the sheet shows the new skill.
  - M: the in-flight races had no tests. Partly fixed: the notice logic is unit tested. The timing-dependent races have no e2e (accepted, as for M3.4).
  - L fixed: the selection notice fades after 10 s.
  - L accepted: the review step hides the other cards; there is no hint that Escape defers the choice; the demo uses placeholder text; the e2e is one long test; aria-labels use the plain name.
- Round 2 (078936c..167999d): 0 High, 0 Medium, 4 Low.
  - L fixed: the connection-lost notice no longer fades.
  - L accepted: [Choose] stays hidden until the reconnect snapshot if the view frame is lost after an ok; `isConnectionError` matches the two `live.ts` strings; the in-flight race is still untested.

## 2026-10-22 · M3.7 Inventory, gifts, trades · reviewer: sonnet (fresh context)
- Round 1 (af88ab6..ef2d567): 0 High, 4 Medium, 6 Low.
  - M: the reviewer reported that self-gifts and self-trades were accepted. Not a bug: the envelope schemas already reject them (`distinctParties`), and tests cover this. The reviewer withdrew it in round 2.
  - M: some clamp paths were untested. Fixed: an engine test with level-ups and gifts while gear is equipped. The e2e now checks that equipping does not heal and that unequipping clamps HP (470/480 → 380/380).
  - M: the post-event clamp could fill a missing pool key. Fixed: it only lowers pools that exist.
  - M: focus dropped to `<body>` when the clicked [Equip]/[Unequip] or a closing form disappeared. Fixed: focus moves to the Inventory heading (asserted in the e2e).
  - L fixed: the done notice fades after 8 s; duplicate `.items` CSS removed.
  - L accepted:
    - [Equip] swaps slot 1 when every slot is full (D82).
    - The gift notice omits rarity.
    - Past trades are unbounded and undated.
    - No warning that unequipping lowers HP (Q32).
- Round 2 (ef2d567..42624e2): 0 High, 0 Medium, 4 Low.
  - L fixed: the focus rescue runs once per action and uses `preventScroll`, so a later live update cannot pull focus or scroll the page.
  - L accepted:
    - A DING toast can cover part of an open form on a 390 px phone. This is the existing toast position; M8 theming can move it.
    - Focus is not rescued after Cancel or a refused command (the button stays in those cases).

## 2026-10-22 · M3.8 Quest log · reviewer: sonnet (fresh context)
- Round 1 (1ac9417..23e69c2): 0 High, 1 Medium, 4 Low.
  - M: on phones the Quests window came after Status and the whole Inventory, so deadlines were buried. Fixed: in one column the order is Status, Quests, Inventory, then the feeds (`display: contents` plus `order`). The e2e asserts the order.
  - L fixed:
    - The gauge label shows the percent (DESIGN "World Stability %"), so it agrees with the bar on any configured range.
    - `aria-valuetext` is set and checked after a live change.
    - The `.quest` border selectors are scoped.
  - L accepted:
    - Failed and expired quests are covered by helper unit tests only.
    - The e2e drives the GM over a raw WebSocket, as in earlier specs.
- Round 2 (23e69c2..6bf8fdf): 0 High, 0 Medium, 3 Low, all accepted. The order is measured once; the label can show one decimal; the failed-quest rendering gap stands.

### 2026-10-22 · M3.9 Identify · reviewer: sonnet (fresh context)
- Round 1 (631f6f3..0ae144d): 0 High, 1 Medium, 3 Low.
  - M fixed: the 1000-state canary sat near the 5 s default limit and timed out once under full-suite load. It now has a 60 s limit; STATES is unchanged.
  - L fixed: revealing to "everyone" when everyone already knows the entity now says so, instead of a generic schema error.
  - L accepted: `identifyRarity` matches the race skill by the configured name (D40, pre-existing); the "gone" notice uses the label as chosen (correct, untested).
- Round 2 (0ae144d..98b5742): 0 High, 0 Medium, 0 Low.
