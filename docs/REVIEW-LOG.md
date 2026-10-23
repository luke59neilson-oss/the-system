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

### 2026-10-22 · M3.10 Notes · reviewer: sonnet (fresh context)
- Round 1 (645c108..148d3f4): 0 High, 0 Medium, 8 Low.
  - L fixed: the "Delete for good" confirmation resets when a note is collapsed or another is opened; the title field takes focus when the note form opens; D85 now says plainly that players join by picking a character (no player login), so journal privacy is enforced toward the GM's screens and other characters' views.
  - L accepted: same-second edit conflicts miss the warning (last write wins, D85); full notes resent in every view (no note cap yet; revisit if views grow); inline Markdown regexes not benchmarked on adversarial 20k-character lines; the phone screenshot shows an open note, not the form (the e2e drives the form on the phone).
- No round 2 needed (no High or Medium).

### 2026-10-22 · M3.11 Practice and montage · reviewer: sonnet (fresh context)
- Round 1 (6c3b0c0..04dcba5): 0 High, 1 Medium, 5 Low.
  - M fixed: the montage focus form demanded a skill or stat; a focus is now just a line (skills and stat optional), as DESIGN §7 says. Practice entries still need one (engine rule).
  - L fixed: a montage offered without a label shows "Montage", not the GM-only clock's name.
  - L accepted: skills lost to an evolution drop silently from a half-filled form; a closed montage leaves without a notice; the window lists the 8 newest entries only; the e2e already asserts the clock name and id never reach player frames.
- No round 2 needed (no High; the Medium was a one-line rule change, covered by unit and e2e tests).

### 2026-10-22 · M3.12 Party view · reviewer: sonnet (fresh context)
- Round 1 (1268f08..b17e8bb): 0 High, 0 Medium, 7 Low.
  - L fixed: member heading ids are `party-member-<id>` (cannot collide with `party-heading`); pool names wrap instead of truncating behind a hover-only tooltip.
  - L accepted: the 25% "low" colour is a display threshold, not a rule (D87); no glow assertion, pane-mode screenshot or 1920×1080 check in the spec (the M3.2 spec covers pane width; M3.A runs both viewports); the M3.2 no-flash check is scoped to the Status window because the party view now follows Sultan; the window sits under Status on laptops by design (D87); bars do not animate, labels glow.
- No round 2 needed (no High or Medium).

### 2026-10-22 · M3.13 Table extras (evolution screen; D88) · reviewer: sonnet (fresh context)
- Round 1 (a1f5d7f..8f71d59): 0 High, 3 Medium, 6 Low. Scoping (contest pop-up to M7.3, hunger to M7.4) judged sound and honestly recorded.
  - M fixed: focus returns to [Evolve] after Close; Back refocuses the picked path; a replaced release closes the dialog with a notice instead of silently swapping the options.
  - L fixed: a settled or withdrawn release also closes with a notice; the free-points warning (evolving does not touch free points) is gone; a phone screenshot of the review step was added.
  - L accepted: options without transforms look sparse; no component-level unit test or View-as assertion (the pane has no client, so no button).
- Round 2 (8f71d59..8afc40b): 0 High, 0 Medium, 2 new Low, accepted for now: an old evolution notice lingers until [Evolve] is clicked again; if a confirm is saved but its result is lost to a dropped connection, the player sees the "settled by the GM" notice instead of the connection message.

### 2026-10-22 · M3.A Milestone acceptance and review · reviewer: fable (fresh context)
- Scope: whole M3 milestone (3151482..1b74d2d) plus the new `e2e/M3.A.spec.ts`. The reviewer ran `npm run check` (610 tests), the build and all 18 M3 e2e tests (pass), judged screenshots at all three sizes against DESIGN §9 (holds), and ran its own leak probe on Jake's phone: player view keys exactly the allowlist, no GM-only clock, rule tags, tiers or `knownBy` in any frame.
- Round 1: 0 High, 1 Medium, 8 Low.
  - M fixed (a57d6bf): the practice forms labelled nicknamed skills by nickname only; they now show the official name with the nickname beside it (D78), asserted in M3.A.
  - L fixed: the practice placeholder no longer copies the demo's real entry; history and DING text wrap long words; the canary also covers the GM-only clock name/id and the `pale hunter` rule tag.
  - L accepted: the sweep opens only the detail, selection and Identify interactions (each M3.x spec covers its own forms at 390×844); bracket buttons are ~22 px tall and the DING toast sits over the bottom of phone forms (M8 look and feel); the Assign panel shows base stats while the Stats block shows effective ones; item definitions from closed trades stay visible (D89); the race DING reads "- +6 free points".
- No round 2 (no High; the one Medium was a label fix, re-checked with `npm run check` and the M3.A and M3.11 specs).


### 2026-10-22 · M4.1 Skill library (D90) · reviewer: sonnet (fresh context)
- Round 1 (80aac0a..1defc7e): 0 High, 3 Medium, 4 Low. Check, build, M4.1 e2e and screenshots pass; no GM-only leak (canary in frames and page).
  - M fixed: no test of undoing a library event (engine test added; semantics in D90); the form kept a stale draft when its entry was undone, and did not follow edits made elsewhere, so a save could revert another tab's change (the form now diffs against the entry as loaded, adopts outside changes when untouched, warns with Reload otherwise; e2e covers a second GM tab).
  - L fixed: stronger selected-entry outline; focus moves to the form on open. L recorded: name-only matching ignores the entry's rarity (Q37).
- Round 2 (1defc7e..cb5f823): 0 High, 0 Medium, 4 Low. Fixed: an entry removed elsewhere keeps the GM's draft as a new skill instead of blanking it. Accepted: render-time state adoption (terminates; conventional in this codebase), focus on open for pointer users, last-writer-wins when both sides change the same field.

### 2026-10-22 · M4.2 Class, race and profession libraries (D91) · reviewer: sonnet (fresh context)
- Round 1 (952741a..3bf0cef): 0 High, 3 Medium, 6 Low. Check, build, M4.2/M4.1/MS.1 e2e pass; golden diffs additive; no GM-only leak; the M4.1 (opt out of defaults) and MS.1 (selected option text instead of the old `archer` value) spec edits judged legitimate.
  - M fixed: a failed seed after New campaign was silent (an empty class library now says new characters fall back to the built-in Archer, next to "Add the default set"); clicking another entry, tab or New silently discarded a draft (first click now warns, second discards); screenshots clipped the list and hid the status rows (taller list, status shot without the dialog, full-page console).
  - L fixed: visible "Skill N rarity" labels; the profession skill limit comes from the engine; the no-change check ignores key order (unit test).
  - L accepted: race is a free-text name on the character (the library is a picker; Q38); no delete/archive for entries (as M4.1); the property stream does not create characters (example tests cover creation from every default class).
- Round 2 (3bf0cef..cf102fd): 0 High, 0 Medium, 3 Low, accepted: the stricter no-change check only affects logs written by this item's first commit; the M4.1 skill list in the full-page console shot still scrolls; the discard warning stays armed for the same target after further edits.

### 2026-10-22 · M4.3 Campaign and sessions (D92) · reviewer: sonnet (fresh context)
- Round 1 (2499214..b5a7d9e): 0 High, 3 Medium, 6 Low. Check, build, M4.3 and M2.A e2e pass; golden logs replay; no session data or GM reasons reach players (engine test and e2e frame canary).
  - M fixed: undoing a session end left the file saying "report" until the next tick (the server now rewrites the file at once after an undo of a session start or end); undoing a running session's start left a stale "(running)" file (it is rewritten as "Session N: undone").
  - M recorded, not changed: nothing is written between sessions (by design; QUESTIONS Q39 with the default, D92).
  - L fixed: Session window messages clear when the session changes; past-sessions cells no longer wrap mid-value at 390 px; duplicate `node:fs` import merged.
  - L accepted: any undo rewrites an ended session's report once (harmless churn); button size and window position; a GM may choose a session id (validated, duplicates refused).
- Round 2 (b5a7d9e..1351fca): 0 High, 0 Medium, 2 Low, accepted: an undo of a start right after a restart, before any write by the new process, leaves the old file saying "(running)" until the number is reused; the keep-message flag relies on the result frame arriving before the state frame (the hub's order).

### 2026-10-22 · M4.4 Character creation (D95) · reviewer: sonnet (fresh context, background worktree)
- Round 1 (c1d2115..e5d4e74): 0 High, 2 Medium, 6 Low. Check, build, M4.4 and M3.1 e2e pass; upload is GM-gated before the body is read; no path traversal; served files are image-typed with nosniff and a `default-src 'none'` CSP; undo/replay sound; no GM-only data reaches players.
  - M fixed: screenshots lacked a player's status window at 390 px and the GM console at 390 px (both added; party shot full page); D95/Q40 now say removing a portrait does not unpublish its file.
  - L fixed: portrait changes appear in the session log (unit test); only the latest pick counts in the new-character picker, which is disabled while reading; the picker's Remove has an aria-label.
  - L accepted: a well-formed but missing file name is accepted (the badge falls back to the monogram); orphan files after a failed create (files are never deleted); `readFileSync` per request with an immutable cache; server 400/413 paths covered by unit tests only; portraits not on the own status window (Q40).
- Round 2 (e5d4e74..18cefa8, required by two Mediums): 0 High, 0 Medium, 2 Low. Accepted: a decode that never settles leaves the picker on "Reading…". Fixed: the reviewer worktree pointer committed by mistake in 18cefa8 was removed and `.claude/worktrees/` ignored (03fbbd8).

## 2026-10-22 · MS.7 Launch polish · sonnet
- Round 1 (935d7e8..b868d1e): 0 High, 3 Medium, 6 Low. Check and all 4 desktop specs pass; splash screenshot clear.
  - M fixed: a quit or splash close while starting exited without closing the server and campaign lock (before-quit now holds the exit and start() closes what it opened; test proves the LOCK file is gone). Tests now check focus, a second launch during start (splash comes forward) and closing the splash while starting.
  - M resolved: the workflow was unverified; both release-dry-run runs were green (39794644988 with the four new names, 39796128748 after MQ.9 with three).
  - M accepted: the "within 1 s" figure is measured from process start (325 ms locally); the portable exe's own unpack time is outside Electron's control (D96).
  - L accepted: a re-run picks the previous attempt as the "previous preview"; a program bound only to 127.0.0.1:30333 on Windows does not trigger the fallback; `did-fail-load` can reveal early; the port+1 assertion can race; desktop specs re-render screenshots; packaged smoke shares the real profile.
- Round 2 (c841cba, required by three Mediums): 0 High, 0 Medium, 3 Low, accepted for now: a second quit while the server is closing can exit before the lock is released; no exit timeout while a start hangs; the test hold sets `running` only after the delay.

## 2026-10-22 · MQ.9 Windows-first releases · sonnet
- Round 1 (835717c): 0 High, 0 Medium, 3 Low (D55 and older ROADMAP lines still mention macOS as history; header wrap; mac section kept for local builds). Accepted. Dry run 39796128748 green: meta, build (linux), build (win), collect with exactly three files.

## 2026-10-22 · MQ.1 Evolution rules · sonnet
- Round 1 (835717c..fefa7d7): 0 High, 3 Medium, 4 Low.
  - M fixed (b3c1f84): the refill used base stats; it now fills to the effective maximum (items and titles count; unit test).
  - M open for round 2: no GM UI sets the stat bonus (there is no GM evolution builder until M5.2; D110 says so); the pending-selection gate re-runs on replay, so a later rules edit that adds a selection slot could make a stored v2 release fail to replay.
  - L open: `statValues` accepts unknown stat ids at the schema (the reducer rejects them); `legacy: true` is accepted on hand-written v2 events; the refill sentence hard-codes pool names; `bonusText` edge cases fine.
- Round 2 required (3 Mediums); not run this run (timebox). The box stays unchecked.
- Round 2 (2026-10-22, run 451e9851, 835717c..e5ba69f), sonnet: 0 High, 1 Medium, 3 Low. `npm run check` green (691); M3.13 e2e green; evolution screenshots judged fine against DESIGN §9.
  - Round-1 replay Medium confirmed as no defect: replay folds in log order and an undo that breaks a later release is refused. Caveat for M4.9: test that undoing a rules edit cannot re-gate a stored release.
  - Round-1 "no GM UI for the bonus" stays accepted by design (M5.2 evolution builder; D110).
  - M fixed (66033ea): the evolution screen called waiting selections a warning, though choosing is refused. The player view now carries `selectionsDue` (earned and unchosen, offered or not), and the screen shows "Choose your waiting skill selection first…" and disables Evolve. There are engine projection and web unit tests.
  - L accepted: `chooseEvolution` refills from base stats when called directly (the reducer refills from effective stats; only unit tests call it directly); `bonusText` edge cases are fine; `legacy: true` on a hand-written v2 event also skips the bonus (commands never set it).

## 2026-10-22 · MQ.2 Pools follow maxima · sonnet
- Round 1 (5619f9b..717e33c): 0 High, 0 Medium, 4 Low. `npm run check` green (701); M3.2 and M3.7 e2e green. Full e2e suite (35) run by the builder before the e2e updates: 3 failures, all expected under D100 (M3.2 stamina, M3.7 amulet, and a cascade from it), fixed in 717e33c.
  - L accepted (Q41): the literal reading lets a clamped pool count as full, so swapping gear can top up a pool. It is documented and pinned by a test.
  - L fixed: the comment now explains why "the event did not set the pool" is detected by value.
  - L accepted: two effective-stat computations per changed character (bounded, LAN scale).
  - L fixed: a test for item edits that raise an equipped bonus (full stays full; 90 stays 90). Evolution's interplay is covered by the MQ.1 refill tests.
- No round 2 (no High, fewer than two Mediums).

## 2026-10-22 · MQ.3 Passed-over options · sonnet
- Round 1 (origin/main...64a5968): 0 High, 4 Medium, 5 Low. `npm run check` green (708); M3.6 e2e green. No GM-only data reaches players (`withdrawn` is not projected).
  - M fixed (22a9d0c): the eligibility rules (ceiling at the selection's grade, profession options, retired names, unknown rarity, case-insensitive dedupe) had no tests; a new describe covers each.
  - M fixed: choosing matched names case-sensitively while withdraw did not; both are case-insensitive now.
  - M fixed: loosened e2e text checks are exact again (3 + passed-over count), and the spec now asserts the new menu precedes the passed-over list, the dialog scrolls with Close in view, and a GM withdraw mid-review.
  - M fixed: long lists: sticky dialog header (title and Close), compact rows.
  - L fixed: withdrawing a skill the character already owns is refused; a notice says when the option under review was withdrawn.
  - L accepted: a pending lower menu does not feed a later pending menu ("passed over" means a chosen menu's leftovers); the GM button waits for M5.1 (D112); the D-number churn was undone after Luke's L-numbering (D110/D111 keep their numbers; MQ.3 is D112).
- Round 2 (64a5968..22a9d0c), sonnet: 0 High, 0 Medium, 3 Low, all accepted: the sticky header hard-codes the dialog background and padding; withdrawing a retired name succeeds with no visible effect; the withdrawn notice stays until the player picks again or closes.
- Builder ran the full e2e suite (35) green after merging into main.

## 2026-10-22 · MQ.4 Marks carry over · sonnet
- Round 1 (835e3f5..1bc57bf): 1 High, 2 Medium, 3 Low. `npm run check` green (715); no banned patterns; golden logs untouched; state changes additive.
  - H open: an evolution transform that raises a skill's rarity still zeroes its marks (`evolution/model.ts` ~546), so banked marks are not carried after an evolution.
  - M open: the "banked marks apply after an evolution" test calls `upgradeSkill` on a hand-made E-grade character instead of running an evolution.
  - M open: the evolution screen warns "N mastery marks reset to 0" for every transformed skill (`apps/web/src/player/evolution.ts:77`), which is wrong when the rarity is kept and after the fix.
  - L: "5 / 4 marks" can show after a carry (the bar clamps); a double carry through two upgrades is not tested; the schema comment cites D101 rather than D113. The flag has no settings UI (as with `fullPoolsStayFull`, D111), so stored campaigns keep the reset rule until M4.9.
- Round 2 required (a High). Not run this run (timebox); the box stays unchecked.

- Round 2 (c81a313, fixes on top of 1bc57bf + merge of origin/main): 0 High, 0 Medium, 3 Low. `npm run check` green (731); M3.13 e2e green; full e2e (35) green locally.
  - Round-1 H and both M verified fixed: transforms now go through `marksAfterRarityChange` (D114), tests run `evolution.choose` including banked marks applied after G→F→E, and the evolution screen says what marks spend, carry or reset.
  - L accepted: "reset to 0" wording when a rarity gain spends every mark (it reads the same to a player); `marksAfterRarityChange` ignores the reserved flag (transforms cannot target reserved rarities in practice); D114 is an interpretation, asked as Q43.

## 2026-10-22 · MQ.5 Grade walls · sonnet
- Round 1 (d244b21..bc3fb97): 0 High, 3 Medium, 5 Low. `npm run check` green (738).
  - M fixed: `planGroup` left pooled mixed grades and several opponents unspecified → `pooledSide` (values summed at the lowest pooled grade), "one plan per opponent" in the docstring and D115.
  - M fixed: `roll: null` on walled contests undocumented for M7.3 → D115 says the roll log must allow a null roll.
  - M fixed: no explicit flag for a walled result → `ContestResult.walled`.
  - L fixed: the bad-input test now runs every mode. L accepted: the 24% test's constants come from DESIGN §4 check values typed in; one sign convention repeated across helpers; D66/Q3 still mention the old default (history).
- Round 2 (fc84bf9): 0 High, 0 Medium, 5 Low, accepted (opponent value unchecked in `planGroup`, `walled` name used for a function and a field, adjusted 0 for the walled side, no replay test of a stored pre-MQ.5 mode, box unchecked at the reviewed commit).

## 2026-10-22 · QF.1 Chosen options never return as passed-over · sonnet
- Round 1 (fc84bf9..6ca3e7e): 0 High, 0 Medium, 2 Low. `npm run check` green (739); the reviewer confirmed the new test fails without the fix.
  - L accepted for now: the GM can still offer a chosen-then-renamed name fresh on a later menu (`offerSelection`/`checkFreeName` ~214); a GM action, not a leak; noted for the QUALITY backlog.
  - L accepted: no test pins `withdrawPassedOver` on the old name or a case variant.

## 2026-10-22 · QF.2 Item definitions reach players only for items they can see · sonnet
- Round 1 (6ca3e7e..bc6ff15): 0 High, 1 Medium, 3 Low. `npm run check` green (739); `e2e/M3.7` green. The reviewer judged the two-seed property test (D118) robust, not weaker.
  - M fixed (97d0ff2): a zero, negative or fractional count on a known id reached the payload schema, whose error named the id, so a player could scan for ids that exist. Every bad count now reads `That item is not available`; test over 0, -1, 0.5 × known/unknown ids for trades and gifts, confirmed failing without the fix. No round 2 (one Medium).
  - L to Q45: asking another player for an item they hold shows its definition (a guessed id probes their inventory); by Accept's design.
  - L accepted: a stale trade's accept error names an item both parties already saw. L fixed: canary failure text read inverted.

## 2026-10-22 · MQ.10 Steep XP curve · sonnet
- Round 1 (5d2a6e0..2e433ea): 0 High, 4 Medium, 5 Low. `npm run check` green (743).
  - M deferred to M4.6 (ROADMAP note, D120): the GM award form cannot send a target grade yet; every award is full XP until the dialog item.
  - M resolved: an unknown `enemyGrade` is refused in the reducer and surfaces as a normal command error (tested).
  - M resolved by D120: no upcaster; stored rules get `gradeBelowFactors: []` by default and keep their saved curve (D113 pattern).
  - M fixed (5dbaacf): docs (D120, ROADMAP M4.6). Also fixed from my own full e2e run: `e2e/M3.6.spec.ts` awarded eight D levels at the old 400.
  - L accepted: factor before bonus (D120 says why); unconstrained factor lists; the 0→240 test now chooses due selections before its exit check (the level-240 menu was skipped once awards grew); a bare `award(400)` at G in evolution.test.ts.
- Round 2 (5dbaacf): 0 High, 0 Medium, 1 Low (MS.A's 400 XP → level 4 looked old-curve; it is G at 100, unchanged). `npm run check` and e2e M3.6, MS.4, MS.A, M3.5 green.

## 2026-10-22 · MQ.6 Tailored professions · sonnet
- Round 1 (40c20b1..083d0a4): 0 High, 2 Medium, 5 Low. `npm run check` green (754); e2e MQ.6, M3.13, M4.2 green; screenshots judged fine against §9.
  - M fixed: a profession taken from the tab while a later release waited left the evolution dialog's profession picker stale (any pick failed with a generic error) and merged that release's names into the locked list. `chooseEvolution` now refuses a pick with a clear "already has the profession [X]; evolve with none" and leaves the locked offers alone; the dialog hides the picker once a profession exists. Engine test added.
  - M deferred to M5.2 (ROADMAP note): no GM console UI releases evolutions or offers professions yet (raw commands and the demo only); M5.2 now also lists withdrawing an untaken offer.
  - L accepted: exact-match take vs case-insensitive merge (D121; the UI sends stored names); no "Chosen" badge after a GM grant of an unoffered name (the locked line names it); ~22 px phone tap targets (same as other [Take]/[Choose] buttons; M8.3 accessibility); window vs "tab" naming (D121).
- Round 2: see below (two Mediums in round 1).
- Round 2 (083d0a4..b94eb65): 0 High, 0 Medium, 2 Low. Vitest (engine evolution + web) and typecheck green.
  - L fixed: a picker value chosen before a profession arrived live was still sent after the picker hid; the dialog now sends none once a profession exists.
  - L accepted: states saved on the unreleased branch before the fix keep merged names (nothing shipped).

## 2026-10-22 · MQ.7 Hidden quest notice · reviewer: sonnet (round 1)
- Findings: 0 High, 1 Medium, 4 Low.
- Medium: a character created after a hidden quest meant for everyone got the count but no notice. Fixed: `character.created` now notifies the newcomer once per such quest (test in `quests.test.ts`; D122 updated).
- Low fixed: the "Every id must be a character" comment sat above the new `checkNoticeTo`; moved back.
- Low accepted: no character removal exists, so no other event changes who is told; DESIGN §7 left as Luke's text (model in D122/Q47); toast overlap is existing behaviour; GM control for `noticeTo` comes with M7.1.
- One Medium only, so no round 2 (LOOP §6.4); fix verified by the new test, `npm run check` and the MQ.7 e2e.

## 2026-10-22 · MQ.8 Identify range · reviewer: sonnet (round 1)
- Findings: 0 High, 0 Medium, 4 Low.
- Low accepted: an out-of-range target keeps its player-facing label (D123; the label is separate from the GM name, and M7.2 now notes a warning when a label gives too much away); "Identify: <label>" repeats the label above the rank line (cosmetic); no GM UI for grade/level until M7.2 (roadmap note added); no per-grade level range check (the GM may set it freely).
- Clean round 1, so no round 2.

## 2026-10-22 · MQ.11 XP overflow, no banking · reviewer: sonnet (round 1)
- Findings: 0 High, 1 Medium, 4 Low.
- Medium: the rules flag replaces the roadmap's "schema bump + upcaster" without saying so, and switching an old campaign later leaves its banks unhandled. Fixed in docs: the MQ.11 accept line records the replacement (D124); M4.9 now owns moving banked XP when the flag is turned on; Q49 asks Luke whether old campaigns should switch automatically.
- Low fixed: a comment at the post-evolution `gainXp(…, 0)` calls says they are no-ops under overflow.
- Low accepted: `previewXpAward` throws for a profession award to a character without a profession, like the award itself (M4.6 filters participants); the extra edge cases the reviewer traced (lagging profession batches, partial XP, bonuses) were found correct; the `overflow` golden covers the lost path, the overflow path is in progression tests; older banking comments describe `gainXp`, still the banking primitive.
- One Medium only, so no round 2.

## 2026-10-22 · MQ.12 Skill library rules · reviewer: sonnet (rounds 1 and 2)
- Round 1: 0 High, 2 Medium, 6 Low.
- Medium fixed: "Add the default set" (`library.seeded`) did not sync copies that already existed; it now counts every seeded skill entry as just defined (D126). Medium fixed: the default seed matched skills by name only, so an existing other-rarity entry blocked a default one; under `libraryByRarity` it matches name and rarity, stored rules keep name-only. Two engine tests, both seen failing before the fix.
- Low fixed: the GM "Skill text" form says a hand edit stops later library edits reaching that copy.
- Low to the QUALITY backlog: hand-edited copies keep their text through upgrades and the mark cannot be cleared; renaming an entry or changing its rarity orphans copies silently; switching the flag on for a stored campaign (M4.9) would overwrite earlier hand edits. Low accepted: a copy upgraded to a rarity with no entry keeps its old text (D125 says so); grant-with-explicit-text overwrite is moot (no grant path carries text).
- Round 2 (6bf36a5): 0 High, 0 Medium, 0 Low.

## 2026-10-22 · MQ.13 The books' starting classes · sonnet (round 1)

- Range 2676e61..7e00755 (`wip/MQ.13`). Reviewer ran `npm run check` (790 unit) and MQ.13, M4.2, M4.4, MS.4 e2e: green.
- Findings: 0 High, 0 Medium, 5 Low.
  - L fixed: Mana Bolt's text named a stat ("damage grows with Intelligence"), a rules claim in content text; now "hits harder as your magic grows".
  - L to Backlog: campaigns seeded before MQ.13 keep the old classes and "Add the default set" cannot replace a same-named stale entry (old Healer, old Common Mana Bolt under name-only rules); Identify has no default library text.
  - L no change: Basic Heavy Weapons mentions weapon-and-shield (DESIGN §10 says exactly that); an empty class library shows the six only in the character form (D91 fallback, by design).
- Also: the full local e2e run hit the 30 s timeout on the MQ.13 spec while the reviewer loaded the 2 CPUs; it passed alone and with `--workers=2`. Split the demo check into its own test with its own server so each test is well inside the budget.

## 2026-10-22 · MQ.14 Bonus rules · sonnet (round 1)

- Range 83ef5b8..86e29a8 (`wip/MQ.14`). Reviewer ran the engine tests (544) and engine/web typechecks: green.
- Findings: 0 High, 0 Medium, 5 Low.
  - L to Backlog: a base under 5 stat units gives an item cap of 0, so the screen reads "(+0.0, capped)" (consistent with D128's round-down).
  - L no change: the `1e-9` guard in the cap; M3.7 now exercises the exact cap (MQ.14 covers over-cap); `LEGACY_BONUSES` repeated in bonuses.test.ts; "upcaster" read as stored rules keeping the legacy bonus defaults (D128).

## 2026-10-23 · QF.10 e2e pages close with their test · sonnet
- Commit 732c85d. Reviewer ran `npm run check` (790) and MQ.6, M3.1, M3.7 on one worker (6/6).
- Findings: 0 High, 0 Medium, 4 Low (a throwing `close()` adds a teardown error beside the real one; afterEach stops servers before the fixture closes pages, a one-test window; traces unaffected; per-worker browsers). No change.

## 2026-10-23 · MQ.15 No healing by gear swap · sonnet (2 rounds)
- Round 1, 00a1de4..4f39f22: 1 High, 1 Medium, 2 Low.
  - H fixed (df508ab): 100/120 unequipped to exactly 100/100 was not clamped, so not marked, and re-equipping healed to 120/120. A drop that leaves a not-full pool at its new maximum now marks it; new test.
  - M fixed: the property test judged fullness from the post-drop state; it now tracks fullness outside the engine (fails on the old code).
  - L fixed: marks drop while the rule is off. L partly: added tests for a set of another pool and undo; rest to no change.
- Round 2, df508ab: 0 High, 0 Medium, 2 Low (property test covers only equip/unequip/set; `writesPool` is an allowlist a new pool-writing event must join). No change.

## 2026-10-23 · MQ.A Batch acceptance and review · fable (fresh context, 2 rounds)
- Acceptance: `npm run check` (809 → 811 unit) and the full e2e suite (43/43 on main 567d841; 44/44 with the new `e2e/MQ.A.spec.ts`), both exit 0.
- Round 1 (06151e3..567d841, whole MQ batch plus QF.1/QF.2/QF.10): 0 High, 2 Medium, 6 Low. Reviewer re-ran check and the MQ e2e specs, viewed every MQ screenshot, probed through `execute` (evolution chain, overflow, marks banking, professions, canary).
  - M fixed (c3a35be, D133): a hand-edited skill copy kept its old-rarity text through a mark upgrade; it now takes the new rarity's library text.
  - M fixed (c3a35be, D134): the GM's XP form now shows overflow and loss per character, and a total warning, before the award (enemy grade/level inputs stay with M4.6).
  - L fixed (D135): stored item percentages hidden under flat-only items; evolution dialog lists the rules' pool names.
  - L to question: Identify at race level 0 sees nothing of its grade above level 0 (Q52).
  - L to QUALITY backlog: titles engine-only until M6.4; GM same-value pool set ends the no-heal mark (D129); MQ GM commands without UI yet.
- Round 2 (567d841..3baa565): 0 High, 0 Medium, 4 Low. Fixed: a blank library entry no longer strips the hand-edit mark (test added); D133 wording on replay. Accepted: silent catch around the preview (no throw path); `poolList` covered by e2e only.

## 2026-10-23 · QF.3 Limits on player-made data · sonnet (2 rounds)

- Round 1 (02e4cc5..490c4c3): 0 H, 2 M, 4 L. M1 player `practice.log` uncapped: partly not reproduced (every `nonBlank` field is already ≤ 200 characters in the event schema), but the entry count was unbounded; fixed with `practiceEntriesPerCharacter` 5,000 and `practiceEntryChars` 500 (players only). M2 log growth through create/delete churn and a fresh bucket per socket: default refill lowered 10/s → 5/s, residual documented in D136. Lows fixed: `rateLimit` validated (burst ≥ 2, rate > 0), unparseable frames charged, hub-level tests for note-edit growth and practice caps. Left: no usage readout in NotesPanel (error text only).
- Round 2 (490c4c3..4d993b7): 0 H, 1 M, 4 L. M `montage.focus` size uncapped: not reproduced (action ≤ 200 by the event schema, skills must be owned, one focus per montage). Lows left as is (client-side 200-char practice hint ignores skill names; GM entries count toward the 5,000; "1 entries" wording only at cap 1; garbage frames past the budget get a parse error, still charged).
- Own find while starting QF.4: a snapshot saved before QF.3 has no `rules.limits` yet would be trusted, so every note command would throw. Fixed by bumping the state schema to v21 (snapshot mismatch → replay), with a regression test (6a72739).

## 2026-10-23 · QF.4 Golden logs are pinned · sonnet (2 rounds)

- Round 1 (4aa5864): 0 H, 2 M, 5 L. M1 `golden:record` silently dropped pins of deleted or renamed goldens: fixed (structured problem codes; a missing pin is refused). M2 a bump with no state change left pins stale, licensing later unbumped edits: fixed (states pinned at an older version must be re-recorded; record re-pins every state at the current version). Lows fixed: hash raw bytes, version regex anchored to a real declaration. Left: CLI main block untested (manually checked), case-sensitive non-recursive file scan, manifest hand edits are only visible in review.
- Round 2 (d775162): 0 H, 0 M, 3 L. Left for the QUALITY backlog: a schema downgrade (revert) re-pins states at the lower version; a new unpinned state needs no bump (by design); the "without a bump" message also covers a downgrade.

## 2026-10-23 · QF.5 Engine purity lint has no bypasses · sonnet
- Round 1: 0 High. 1 Medium (pre-existing, outside the item's list): `Date.call(null)`, `Date.bind(null)()` and `new Date(0).constructor.now()` reach the clock through a member. Fixed in 31cf4ec (ban `Date`/`Math` `.call/.apply/.bind/.constructor` and any non-computed `.constructor`; four lint tests). Lows (own `Date`/`Math` declarations flagged; `toContain` slightly loose) accepted, to Backlog. Verified myself: lint test 42/42, engine lint clean. No round 2 (one Medium). Box checked.

## 2026-10-23 · QF.6 Desktop smoke specs run in CI · sonnet
- Round 1: 0 High, 1 Medium (no `apt-get update` before installing xvfb), fixed in a021c50. Lows: listeners attach after launch (Backlog); key check covers the happy path only (accepted, matches the acceptance). Local `npm run desktop:smoke` 6/6.
- The job's first CI run (31cf4ec) failed at "Desktop smoke" with no readable log (artifact downloads are refused from here). 5bca523 makes it report failures as annotations with `continue-on-error` so main stays green. Box stays open until the job passes once and the gate is restored.

## 2026-10-23 · QF.11 (High) A partial download cannot hang · sonnet (on wip/QF.11)
- Round 1: 0 High. Mediums: a stale "installer + portable" header comment (already replaced on the branch; M10.2 text fixed on main); the truncated-installer step's behaviour is unverified (NSIS may show a modal box in `/S` mode); a missing `ExitCode` would pass silently, fixed (54544b3..). Lows: half-length truncation tests the early-fail path, not a mid-file CRC flip; message not asserted.
- Verification needs a release build: the branch's tree is pushed to `release-dry-run` (7446f46). Box stays open until that run is green.

## 2026-10-23 · QF.6 Desktop smoke specs run in CI (close)
- The job passed on 5bca523 (6 passed); `continue-on-error` removed (D141). Gate-only change, verified by `npm run check`; no new review. Box checked.

## 2026-10-23 · QF.11 (High) A partial download cannot hang (close)
- `release-dry-run` run 7446f46 green, including "A partial installer refuses to start". `wip/QF.11` merged into main. Box checked.

## 2026-10-23 · QF.7 Store failure paths are tested · sonnet
- Round 1 (8d7fe97): 0 High, 0 Medium, 6 Low (weaker fsync-test assertions, undo-fsync path untested, Windows partial-write semantics not modelled by a fake; seam unreachable in production confirmed). Lows to the QUALITY backlog. Box checked.

## 2026-10-23 · QF.9 Trade proposals reveal nothing · sonnet (2 rounds)
- Round 1 (017fbb7): 1 High, 0 Medium, 2 Low. H fixed (90d9971, D145): accepting a trade whose proposer had spent their currency returned the reducer's "Not enough Credits (has 45)", showing the proposer's balance; accept now checks items and currency for both sides at command level with `TRADE_NOT_POSSIBLE`. Lows (non-party message, accept tells the counterparty the offer is gone) to backlog.
- Round 2 (90d9971): 0 High, 0 Medium, 2 Low (bare `get` ids reach the counterparty; declined offers stay seen), to backlog. Box checked.

## 2026-10-23 · QF.12 A golden log under today's default rules · sonnet (2 rounds)
- Round 1 (0b417f0): 2 High, 1 Medium, 3 Low. The item cap and the library edit were only nominally pinned (replays with the cap or flat-only off matched; no unedited copy existed at the edit), and the clamp mark had cleared by the end. Fixed (90d9971, D144) by re-recording `defaults.jsonl` with Lee (unedited copy, capped charm at full HP → 120) and ending with Kim clamped and marked.
- Round 2 (90d9971): 0 High, 0 Medium, 2 Low; reviewer confirmed each rule flip changes the replayed state. Box checked.

## 2026-10-23 · QF.8 Latency checks that don't flake (and the red desktop-smoke CI) · sonnet (2 rounds)
- Round 1 (9ad606e..d2badbf): 0 High, 3 Medium, 3 Low. M: `dependencies: ['e2e']` skipped the latency specs whenever any other spec failed; CLI file filters pulled in the whole e2e project; M2.A and M4.3 2 s delivery bounds left in the parallel project. Fixed in d3175c7 (D148): no dependency, CI runs the latency project as its own step (also after a failed e2e step, own report dirs); M2.A and M4.3 tagged. Lows: desktop app-ready bound measures window creation not paint (comment reworded); zombie-close bound now guards only the 30 s handshake (noted in D148); long scenarios hold the bound mid-test (accepted).
- Round 2 (d3175c7): 0 High, 0 Medium, 2 Low: `npm run e2e` still skips latency locally when e2e fails (`&&`; CI unaffected; Backlog); stale `--no-deps` note (already removed). Box checked.

## 2026-10-23 · MR.1 Evolutions re-rate skills · sonnet (1 round)
- Round 1 (6baf6ff..bc42279): 0 High, 2 Medium, 5 Low. M: docs not updated (done at close-out, as LOOP §8 orders); a skill gained between release and choose (a merge) kept its rarity: fixed, any skill missing from the release's list takes the default drop (test through `execute` with a merge). Lows: overrides validated for skills every option transforms (accepted: harmless refusal); exact-case skill names (accepted: matches transforms); the re-rating list is per release, not per path (help text says a transformed skill follows its path; accepted); list spacing on phones (fixed); demo GM keeps every rarity (intended, D149); `textRarity` must be cleared by any future rarity-changing path (noted in D149). One Medium needing code, so no round 2 (LOOP §6.4); fix verified by the new test and `npm run check` (869), e2e MR.1 and M3.13 green. Box checked.

## 2026-10-23 · MR.2 Every upgrade starts at 0 marks · reviewer: sonnet (1 round)

- Range f4d07d9..76fcf7e. `npm run check` and e2e MR.2, M3.13, MR.1, M3.5 green; screenshots judged fine.
- High: none. Medium: none.
- Low (fixed): no test pinned reset winning over carry-over (added in `marksReset.test.ts`, incl. a lower-rarity transform); the re-rate note did not say the next upgrade starts at 0 (wording added, e2e updated); D152 understated the golden changes (corrected).
- Low (kept): a transform to a lower rarity resets marks (a transform is a new skill; D152 says a GM wanting a lower label re-rates instead); the skill detail names the rule only when an upgrade is ready; no e2e for banked-at-ceiling notes (not in acceptance).
