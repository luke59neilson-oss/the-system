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

## 2026-10-23 · MR.3 XP overflow for every campaign · reviewer: sonnet (2 rounds)

- Round 1 (738d8be..f20c43d): 0 H, 3 M. Fixed: banked XP on capped tracks is re-applied under overflow (other track takes what it can, rest lost) instead of cleared; `rules.migrated` cannot be undone (it would re-run on load). Kept: the GM sees the migration in the session log only until M4.8's change log (no GM UI for it yet). Lows kept: `importCampaign` has no route yet; demo-switch path untested (same `open` wrapper as main); no HTTP-path test.
- Round 2 (f20c43d..ea946ad): 0 H, 0 M; both fixes confirmed. Lows: a stale variable name (kept), payload renamed without an event version bump (never on main, so harmless), a comment on per-track independence (kept).

## 2026-10-23 · MR.4 · sonnet (round 1, 54f0dd0..9bf8bd2)
- 0 High, 1 Medium, 4 Low. M fixed (15bf8ae, wip): the Skill text form's "Follows the library entry" line now uses `entryForSkill` (a re-rated copy follows its old text rarity); the button keeps the current-rarity lookup. L fixed: an all-blank entry is refused (engine and button); tests for undo of `skill.libraryTextUsed` and a same-name transform keeping hand text; 8px gap between the buttons. L kept: no confirm on Use library text (undo exists); legacy (`libraryByRarity` false) campaigns get no button, consistent since hand text only exists under it. Box not checked yet (property test unfinished, see PROGRESS).

- Close-out (run a6822bf5): round 2 not required (0 H, 1 M). Verified the round-1 fixes myself in 9bf8bd2..15bf8ae (form status line uses `entryForSkill`; button needs an entry with text; engine refuses an all-blank entry; undo and same-name transform tests present). The property walk now reaches an accepted `skill.useLibraryText` (the library stream sometimes gives a hand-written copy an entry with text at its name and rarity: 2 + 1 accepted over the two seeds). `npm run check` green (896 tests). Box checked.

## 2026-10-23 · MR.A Batch acceptance and review · reviewer: fable (2 rounds)

- Full e2e suite green locally at 34f6f14 (45 e2e + 5 latency); reviewer's `npm run check` (896) and MR.1–MR.4 specs green.
- Round 1 (6baf6ff..34f6f14): 0 H, 4 M, 5 L. Fixed in e453b15: M1 a release's absolute re-ratings went stale when a skill's rarity changed before the choice (two-step drop) → `dropStaleRerates` after every event, default drop from the new rarity (D155); M2 Use library text could not move a re-rated, library-linked copy to its current rarity's entry → allowed, GM form says which entry it follows (D156); M4 no golden pinned MR.1/MR.2 under default rules → new `rerate.jsonl` golden. M3 (Identify's tier follows the lowered label) kept: the open Identify question's default (D149). L2 fixed (player list shows the default drop for unlisted skills). Lows kept: L1 migration blocks undo of earlier XP awards with a generic message; L3 `rerate: []` vs undefined (now pinned by the web test); L4 stale variable name; L5 MR.4 e2e relies on G-grade ceilings.
- Round 2 (e453b15): 0 H, 0 M. Lows kept: a snapshot from the preview build taken mid-evolution resumes with the old result (accepted in D155); GM status says "No library entry for this rarity." for a re-rated copy whose old entry is missing while the button is enabled (Backlog).

## 2026-10-23 · M4.5 Party dashboard · reviewer: sonnet (2 rounds)

- Full e2e suite green locally at d32bd05 (46 e2e; the party table became cards, so 20 specs now find members by heading).
- Round 1 (229219a..d32bd05): 0 H, 3 M, 6 L. Fixed in ab3f114: M1 a released evolution showed "player choosing" with a selection due → blocked; M2 typing a pool back to its opening value after a live change sent nothing → touched fields are sent when they differ from live; M3 a retry after a partial save resent landed stats → only fields differing from live are sent. Lows kept: pool "max" hint uses saved stats, not the draft; whole-number regex duplicated in the view; narrow cards at 1366 (cards now min 360 px); Return to player acts at once without confirm (it is an undoable event); player screenshot cropped.
- Round 2 (ab3f114): 0 H, 0 M. Fixed: L1 regression test for a released evolution blocked by a due selection. Lows kept: name/nickname/Unique still compare with the opening value (only a second GM tab can move them), touched bookkeeping tested only through `sheetPlan`.

## 2026-10-23 · M4.6 XP award dialog · reviewer: sonnet (round 1 of 2)

- Full e2e suite green locally at 21f6506 (47 e2e).
- Round 1 (9e0e5d2..21f6506): 0 H, 3 M, 6 L. Preview matches the reducer (same `shareXp`/`awardXp`). Fixed in the next commit: M1 grade-gap ⅓/0 untested → unit test in xpShares.test.ts (e2e comment corrected: G target = own grade); M2 profession track untested → unit test (refused without a profession, levels with one) and e2e checks the refusal; M3 typical-session helper silent about loss past the grade top → helper says XP past the top overflows or is lost. Lows fixed: messages for a bad amount or target level; "XP awarded" clears on edit. Lows kept: `bonus` math duplicated from `shareXp`; form-only screenshot named 1366x768 (a full-page one exists); typed shares and by-hand mode persist after an award.
- Round 2 required (3 Mediums), not run: no time before the hard stop. Next run launches it first.
- Round 2 (sonnet, run ff3fd214, 9e0e5d2..f5cfa3a): 0 H, 2 M, 8 L; round-1 fixes confirmed. Fixed: M1 the typical-session button suggested 6 levels' XP even when the grade's top is closer (fresh G characters lost 200 each) → new engine `xpRoom` and `typicalSessionAward`: per head the typical amount or the least room left among chosen characters who can still level, so the suggestion loses nothing (unit tests; e2e now expects 1,200 and no loss); M2 "Use for 0" set the amount to 0 → button disabled with a reason in its title when nobody of that grade is chosen or all are at the top. Lows fixed: no level alert before the GM types a target level; the by-hand toggle stays visible while by-hand is on. Lows kept: no-participant state has only a disabled button; a blank non-last share splits the rest with the other blanks (legend names the balancing share only); overflow to the other track and the ⅓ target factor are unit-tested, not shown in e2e; element-crop screenshot name; e2e needs `npm run build` first (as every spec); screenshot churn from re-running the suite. Fixes verified myself (`npm run check` 925 green, M4.6 spec green). Box checked.

## 2026-10-23 · M4.7 System broadcast · reviewer: sonnet (2 rounds)

- Full e2e suite green locally at b3b663e (53 incl. latency).
- Round 1 (2d5e5ab..b3b663e): 0 H, 2 M, 4 L; no GM-only data reaches players (projection `gm`, hub filters by character, GM-only HTTP routes). Fixed in 7c7523e: M1 advancing the day sent scheduled messages silently → the day form says how many it will send and the success text how many were sent; M2 no hub-level test → `LiveHub scheduled broadcasts (M4.7)` (nothing before the day, live to the addressee only, catch-up on rejoin, undo takes it back). L fixed: send disabled on blank text. Lows kept: stale success line until the next result (shared `useCommand`); "everyone" resolves at send time (D159 says so); cancelled schedules leave only a session-log line (M4.8 change log will show events); element-crop screenshot and a toast in the player shot.
- Round 2 (b3b663e..7c7523e): 0 H, 0 M; both fixes confirmed. Lows kept: the day-form warning gives a count, not which messages; the hub test undoes the last event by position.

## 2026-10-23 · run eed2b7e8

- **M4.8 Change log and undo** · sonnet · round 1 (8dae824): 0 H, 3 M (whole-log refetch on every state change; raw undo errors with ids and event types; fetch failures shown as an empty list), Lows (fallback could show a raw type; Undo alignment; no redo; layout). Fixed in 8a1bdf7: plain-words `undoError`, load-error alert, 250 ms debounced refetch, `humanize` fallback, aligned Undo column, error cleared on filter change. Not changed: no redo (M1.3 has none; the GM repeats the action), notes stay title-less (safe). Round 2 (8a1bdf7): 0 H, 0 M, 3 L, all fixed (row shows undone at once, text filter matches only visible words, honest reload note). Full e2e then found the Kind select's options joining the "Message" label in older specs; filters now labelled by id (7aa651b). Full e2e 56/56 green.
- **M4.9 Rules settings** (on `wip/M4.9`, not checked) · sonnet · round 1 (d293b62, static read): 1 H (an edit or reset could turn XP overflow on without moving banked XP), 3 M (no check of the new rules against existing characters/skills/items; undo of a rules edit that later events relied on untested; replay re-parses with today's schema), Lows (non-finite numbers; sticky save bar; thin id-list tests). Fixed in 5d4ec19: overflow can only change through `rules.migrate`; Save disabled while a number field is empty/non-finite. Open: the Mediums, then round 2 (required: round 1 had a High).

## 2026-10-23 · run c1c64270

- **M4.9 Rules settings** · round-1 Mediums fixed in 3b88a11: edits the campaign does not fit are refused, naming who (`rulesStateProblems`/`rulesEditStateProblem`: level above the cap or the grade's top, skill above the grade's ceiling, item worn in a slot that would vanish; only misfits the edit introduces count); unit test that undoing a loosening edit (a second necklace slot, then worn) is refused; D161 replay note. Round 2 (sonnet, worktree, 3b88a11): 0 H, 0 M, 6 L. Fixed in the next commit: `xp.overflow` shown read-only (engine refuses changes), refusal texts in plain words (no "Luke, L16"; the migration runs when the campaign opens). Lows kept: stale draft can overwrite a concurrent rules change or undo (single GM, one tab in practice); refusal sits just above the Save buttons, not scrolled into view; undoing a loosening edit re-folds later events under the old rules (M1.3 behaviour, D161 says so); enum-like fields are free text with server validation. Checks: `npm run check` 950 green; M4.9 spec green; full e2e suite run before merging to main.
- **M4.A GM console acceptance** (on `wip/M4.A`, not checked) · fable · round 1 (bc38a69; full suite 57/57 green, check green): 0 H, 3 M, 5 L. No GM-only data found reaching players. Fixed in a8dd8f3: M1 nullable rules numbers (`selectionInterval`, `percentCapPerStat`, `itemCapOfBase`) rendered as text and could not be set or cleared → number inputs, blank saves null; M2 change-log Undo was one irreversible click on a live-reordering list → a Confirm undo / Keep step on the row (keyed by event id). Open: M3 change-log cost (full replay and full render per state change) → QF.13, needed before M4.A is checked. Lows kept for now: stale rules draft; enum fields free text; "G-grade 600 XP each" helper text vs the capped button; long single-page GM console; stale GmScreen doc comment; M4.A does not pin the toast/history reset after undo and M4.9 never edits a nullable field (add with round 2). Round 2 required (two or more Mediums).
- **QF.13 Change log stays cheap** (on `wip/M4.A`) · 2026-10-23 · sonnet · round 1 (79c68a5): 0 H, 2 M, 4 L. M1 after loading older pages, an undo of a row below the newest page left it stale (Undo button back, then "already undone"); M2 the optimistic pending marker skipped `shownRef`. Fixed in a92f252: pages carry the log-wide `undone` count and the console starts over from the newest page when it changes; pending marker through `show()`; restart epoch drops a late Load older; rows stay visible while a filter loads; footer gap. New web unit test and an e2e step (undo on a loaded older page). Lows kept: `changeLogPage` still scans all cached rows per request (O(n) filter, no replay); an undo or the first request after start still rebuilds once. Round 2 (a92f252): 0 H, 0 M, 2 L (old rows stay under a new filter if its fetch fails; dropped Load older page is silent). **Checked.**
- **M4.A GM console acceptance** · 2026-10-23 · fable · round 2 (18f746c; full suite 58/58, check green): 0 H, 1 M, 6 L. All round-1 Mediums confirmed fixed. M1 was the same stale-older-row undo bug as QF.13 M1, fixed in a92f252. Lows kept: `NULLABLE_NUMBER_KEYS` is by key name, not derived from the schema; M4.9 e2e's second "Rules saved." assert is satisfied by the first; M4.A e2e picks the XP row by /XP/; the change-log list is a 420 px scroll box with Load older outside it; stale "XP awarded" line after undo; QF.13 fixture dates. **Checked** (QF.13 checked; full e2e re-run on a92f252 before merging).
- **QF.14 Splash test does not race the hand-over** · 2026-10-23 · sonnet · round 1 (356da2f; splash spec --repeat-each=20 under xvfb 20/20): 0 H, 0 M, 5 L. Fixed L3 (release poll gets a 30 s timeout) and L4 (lint/format skip narrowed to `.claude/worktrees/`, D166). Accepted: L1 hold is unpackaged-only like the existing start-delay hold; L2 slow-start hand-over still covered by the START_DELAY tests; L5 screenshot noise.
- **QF.15 Pin grade-gap floor and scheduled broadcasts in the leak property** · 2026-10-23 · sonnet · round 1 (1e067cc): 0 H, 0 M, 0 L. All four mutations (floor→round at xp.ts 175/274/496; scheduledBroadcasts into player messages) now fail a test.
- **M5.1 Offer builder** (on `wip/M5.1`, not checked) · 2026-10-23 · sonnet · round 1 (402f59b; check green, M5.1 spec 2/2): 0 H, 4 M, 6 L. M1 draft rows (incl. profession Kind) persist across character switch and get stuck when the Kind select hides; M2 no capstone case in the e2e; M3 practice log sits below the form, not beside it, and lacks counts/dates; M4 the dashboard selection chip does not link to the builder. Lows: passed-over name reuse not flagged; form clears after send; Withdraw only while a selection is due, no confirm; pending menu shows no kind; ~90 unrelated screenshots re-committed; one e2e assertion accepts either state. Fixes due next run, then round 2.
- **M5.1 Offer builder** · 2026-10-23 · round-1 fixes in be2d267: keyed per character+level draft, Kind forced to class without a profession (M1); capstone e2e via the dashboard chip (M2); practice log as an aside beside the menu with counts and dates (M3); dashboard selection chip opens the builder (M4); Withdraw confirm, profession marker (Lows). Sonnet round 2 (be2d267; check green, M5.1+M4.5 e2e 4/4): 0 H, 0 M, 7 L. Fixed Low 3 (practice list labelled latest-N vs whole-log counts). Lows left to Backlog: stale result banner after live updates; draft dropped silently when the edited slot is chosen; UTC date; native confirm dialog; no e2e for a repeat chip click or declined confirm. Full e2e 55/55. **Checked.**

## 2026-10-23 · M5.2 Evolution builder · sonnet (2 rounds)
- Round 1 (119bf58): 0 H, 4 M, 8 L. M1 merge transform kept the first skill's nickname/Unique/mark sessions → now `newSkill` like `skill.merge`. M2 merge rarity not forced → exactly `rarityStepsAboveHigher` above the higher. M3 merge prompts came from the dashboard flags (old ceiling) → judged at the new ceiling. M4 a pending release made unchoosable went unnoticed → `plan.stale` warning. Lows fixed: live re-rate list, transform rarity floor, merge button respects merges left, extra screenshots; practice-log/retired-name assertions added. Left: e2e of the merge button (unit-covered), Q61 (which grade a merge counts against).
- Round 2 (24692a5): 0 H, 1 M, 5 L. M: stale check flagged every option when a selection is waiting → it skips the pending-selection check. Lows fixed: reserved merge rarity refused; consumed skills labelled in the re-rating; fresh-skill test seeds Unique and mark sessions. Lows to Backlog: no e2e of the merge UI; stale check does not re-check stored professions/rerate (choose re-defaults them).

## 2026-10-23 · M5.3 Marks review · reviewer: sonnet (2 rounds)

- Round 1 (cfa0258): 0 H / 3 M / 7 L. M1 skill pairs not counted in the review → `marksReview` returns session and whole-log pair counts vs the merge joint-use rule. M2 montage focus not treated as that mark → per-candidate `montage` flag with a hint; D169 says the review is where it is confirmed. M3 screenshot did not show the review → scrolled into view. L4 merged-away skills silent → `lost` list shown. Other Lows (stale success text after undo, `busy` on a thrown command, long window with many characters, screenshot churn) → QUALITY Backlog.
- Round 2 (ad0d288): 0 H / 0 M / 3 L. L1 "merge alert" ignored the merge rarity → `rarityOk` on each pair, wording changed (fixed). L2 dead `?? p.count` fallback, L3 no UI assertion for the lost/montage lines → Backlog.
- Full e2e: MQ.12 and MR.4 hit a strict-mode clash with the new skill-upgrade DING toast; their Identify locators are now scoped to the race skills.

## 2026-10-23 · M5.4 Merges · reviewer: sonnet (2 rounds)

- Round 1 (ed2d957): 0 H / 2 M / 5 L. M1 tests missed the ceiling and one-per-grade refusals, the name-clash refusal and a consumed skill dropping its other alerts → engine test for all three refusals and the dropped alert; e2e for the clash warning. M2 evolution merges (D168) send no merge DING → documented in D171 (the player picks that option themselves). Lows fixed: per-grade text reads `merge.maxPerCharacterPerGrade`; pair keys use a NUL separator; Send held while the name clashes; GM 390×844 overflow check and screenshot. Left: two-command send has no retry for a failed text save (reported in the banner).
- Round 2 (5d96bce): 0 H / 0 M / 4 L. Fixed: the 390×844 check and screenshot now show the filled form before sending; name/text fields reset on a character switch. Left to Backlog: no engine-level clash test inside the builder (covered by `mergeSkills` and the e2e); screenshot churn.
- CI fix this run (fdedc32): M4.3 latency red on main from the M5.3 "Mark another skill" select widening the 390px console; select and label capped at 100%.

## 2026-10-23 · M5.5 Practice capture · reviewer: sonnet (2 rounds)

- Round 1 (086a56d): 0 H / 3 M / 5 L. M1 Edit could only change the action → the edit form now corrects skills (the character's skills plus any the entry already names) and the stat. M2 Alt+P matched `e.key`, so Option+P on macOS never fired → matches `e.code === 'KeyP'`. M3 an action-only edit failed when the entry's stat had left the rules → an unchanged stat is exempt from the stat check. Lows to Backlog: edits of a deleted character's entries refused; review list unbounded and not per session (Mark all caps at 500); end-of-scene order desyncs if the GM changes the character mid-scene, no cancel; e2e mostly happy path; seed moved in the property test (explained in its comment).
- Round 2 (9006f69): 0 H / 0 M / 4 L (stale stat shows as "None" in the edit select; the form always sends skills and stat; e2e does not assert the edited fields; Alt+P by key position on non-QWERTY). All to Backlog.


## 2026-10-23 · M5.A Milestone acceptance and review · reviewer: fable (2 rounds)

- Round 1 (d3781e1, milestone range e77690d^..d3781e1): 0 H / 2 M / 6 L. M1 the acceptance spec asserted upgrade/merge DINGs on the queued toast (2.6 s each), flaky on a fast machine → asserts on the notification history. M2 unreviewed player/montage entries drove merge alerts with no flag → `mergeCandidates` returns `unreviewed` (same counting as the alert, repeats excluded) and the Merges window says "N of these M uses not reviewed yet"; unit test and e2e. L3 the evolution builder lost a draft when another character became ready earlier in the party order → the shown character is pinned (M5.2 e2e covers it; failed before the fix). Other Lows (merge transform half-renames the practice log, merged skill kind by name order, two-command Send merge vs undo, Identify dropped by the default re-rating (Q64), Remove without confirm) → QUALITY Backlog.
- Round 2 (89e660b): 0 H / 0 M / 1 L (Merges window default character unpinned, like the evolution builder was) → Backlog. Fixes verified; M5.A + M5.2 + M5.4 passed twice each.

## 2026-10-23 · M6.1 Item library · reviewer: sonnet (2 rounds)

- Round 1 (5c93e4a): 0 H / 5 M / 4 L. M1 a stale form overwrote another GM's edit → saves diff against the copy the form opened (`loaded`, `savedDef`) with a "Changed elsewhere" note and Reload. M2 a slot change on a worn item hit a raw engine error naming a character id → "Worn by <name>: unequip it before changing its slot." and Save disabled. M3 equipped copies were invisible → "holds N (+M equipped; unequip to take)". M4 bonus units unclear → per-stat live sheet-value preview from `rules.stats`. M5 test gaps → e2e asserts the preview, the player's "Vitality +0.5", the worn-slot block, count validation and a canary (an unheld library item never reaches the player's frames or page); unit tests for the new helpers and the stale diff. L: Give/Take disabled for a bad count; rest to Backlog.
- Round 2 (62a2f74): 0 H / 1 M / 3 L. M the slot block compared with the live slot, falsely blocking a worn item whose slot changed elsewhere → blocks only when the save would send a slot (5e4a34e). Legend now says "before the item cap". Lows to Backlog.

## 2026-10-23 · QF.16 Pin the merge rarity and a partial practice review · reviewer: sonnet (1 round)

- Round 1 (20bfadb): 0 H / 0 M / 2 L. Re-ran all four mutations (Math.min in `checkOption` and `mergePrompts`, dropping `ids.has` in `practice.reviewed`, dropping `|| rb < min`); each fails a QF.16 test. L1 pin that Epic is refused by the F ceiling for the same pair → added. L2 no mixed-rarity pair that does get a builder prompt under default rules → Backlog.

## 2026-10-23 · Quality sweep B (41be1ee..d6fedf8) · haiku / fable / sonnet

- No fixes made in code from the sweep beyond QF.16 (above); QF.17 queued. Rows in QUALITY.md.

## 2026-10-23 · QF.17 Table-view panes show every DING · sonnet
- Round 1 (5ce7bbd..e05d943): 0 H / 0 M / 3 L. Lows: e2e covers only the skill-upgrade kind (profession and merge rely on the `isDing` unit test); legibility checked at one pane only; re-captured screenshots changed byte-wise. No fixes needed; Lows noted, not queued.

## 2026-10-23 · M6.2 Loot tables · sonnet
- Round 1 (52a1b57..03acc45): 0 H / 2 M / 6 L. M: `loot.rolled` stored only picks, so undoing an earlier table edit silently reinterpreted a later roll → the event now carries `bundle` and the reducer refuses picks that no longer give it (test: such an undo is refused; a forged bundle is refused). M: the edit form never reconciled with live state → diffs against the table as opened, "Changed elsewhere… Reload" note. Lows: Roll enabled with unsaved edits (fixed: disabled with a note); `__proto__` item id in `lootBundle` (fixed: Map); status line does not name the drop; uncapped total currency per roll (schema rejects the event); redundant labels; no delete/reorder.
- Round 2 (03acc45..aa4085d): both Mediums fixed, 0 H / 0 M; Low: the stale check compares JSON key order (cosmetic; Reload clears it).

## 2026-10-23 · M6.3 Currency · sonnet
- Round 1 (6ac64b2..772e02c): 0 H / 2 M / 6 L. M: a grant or fine to several characters could half-succeed and a retry re-applied it to those already done → `sendOutcome` names who it reached and each refusal, only the refused stay chosen, amount/reason clear only on full success (unit test). M: stale "Not enough…" / "Granted…" messages lingered → cleared on amount or selection change. Lows fixed: Enter no longer sends (Grant/Fine are explicit), success text uses the parsed amount. Lows kept: a mixed items+currency adjust notifies only the currency (the UI never sends one); a two-way currency trade shows the net per party; the GM frame carries up to 300 ledger rows; frame grep is by key name.
- Round 2 (772e02c..680c6ad): both Mediums fixed, 0 H / 0 M; Low: inputs stayed editable mid-send → fixed (fieldsets disabled while sending); Low kept: a transport error is treated as a refusal (the ledger shows the truth).
- Full e2e then caught two label clashes with the XP award (`Amount`, character checkboxes) in M3.2/M3.4/MR.3/MS.4 → the field is labelled "<currency> each" and characters are toggle buttons; those specs and M6.3 re-run green.

## 2026-10-24 · M6.4 Titles · sonnet (2 rounds)
- Round 1 (b1a723d..b470fd1): 1 H / 3 M / 3 L. H: renaming a library title stranded holders (held by name) → the `titleDef.edited` reducer rewrites holders' copies (dedupes a holder who had the new name), with engine rename/replay/undo test and an e2e rename step. M: whitespace-only name differences → `titleKey` collapses whitespace, stored names tidied (define, edit, award). M: flat units → column "Flat (stat points)" beside the sheet preview. M: undo/replay of a rename → covered by the new test. L (screenshot framing, JSON-order no-op edits, no re-notify when a title is defined after its award): left.
- Round 2 (b470fd1..d37a4cf): 0 H / 0 M / 5 L. Fixed the misplaced doc comment; noted the replay effect of tidied award names in D177; rest left.

## 2026-10-24 · M6.A milestone (M6.1–M6.4) · fable (round 1)
- Range d9eda43~1..43891b7; check, build and the M6 specs green; full e2e 73/73.
- 0 H / 3 M / 8 L. M1: the sheet's "(+0.3, capped)" lumps a title % into the capped item bonus (PlayerScreen.tsx:360-383). M2: GM item give/take from the library sends the player no notice (history/index.ts:195), unlike loot and gifts. M3: defining or renaming a library title silently grants its bonuses to anyone already holding that name as free text, with no DING or GM warning. Lows: title flats sit inside the % multiplier (Q66); un-rollable huge loot tables; party fine is N events; equipment line shows nominal not capped bonus; M6.A ledger assertion weak; title form keeps un-tidied name; stale history label; legend wrap/empty column/persistent "Trade offered".
- Not fixed this run (back at minute 47); handed to `wip/M6.A`.
- Round 1 fixes (run 27864315, 7e8cb53): M1 sheet splits "(items +x, capped; titles +y)" via owner-view `itemStats`; M2 GM give → gift notice from the GM, take → new `itemsTaken` notice; M3 defining/renaming a library title onto a held name DINGs the newly linked holder and the GM form warns. Ledger assertion strengthened (4 rows, both trade sides with balances).

## 2026-10-24 · M6.A milestone · fable (round 2)

- 0 H / 1 M / 9 L. check green (1,062), M6.A e2e green, full e2e 67/67. M-1: library give/take had no reason input, so the take notice's reason was unreachable. Lows: combined currency+items adjust gives two notices (API-only); link-DING with no text/bonus repeats; warning misfired on a library name clash; long split bonus wraps at 390; stale "Trade offered"; history label "Gifts and trades" stale; one-directional leak check; no D-entry; rename follows holders silently.
- Fixed: M-1 (reason field in the item library, tidied, sent only when non-blank; e2e asserts "The GM took [Hunter Fang]: Evidence for the elders"), L-3 (warning only when no library title has that name), L-6 (label "Items and currency"), L-7 (mirror leak assertions), L-8 (D179). Remaining Lows go to the QUALITY backlog via M11.5. No round 3 (one Medium). Box checked.

## 2026-10-24 · M7.1 Quest manager · sonnet (round 1)

- 0 H / 2 M / 8 L. check green (1,070), M7.1 e2e green. M-1: after a save the form diffed against the live quest with no baseline, so a later edit from another tab was silently reverted. M-2: a pending practice stability offer vanished when the next entry had no quest tag. Lows: vanished quest left a draft that "Add quest" would duplicate; offers kept stale deltas; trimmed vs raw text compare; edit label "(blank: no gauge)" wrong in edit mode; hidden-quest screenshot cut before Add; no nudge-only gauge or start value at creation; datalist only whole-field; e2e gaps (noticeTo edit).
- Fixed: M-1 (`savedQuest` keeps the saved baseline), M-2 (offers queue as `PendingOffer`s, re-read by `liveOffer`; e2e logs an untagged entry in between), vanished-quest reset, live deltas, trimmed compare, edit label, screenshot, e2e now widens `noticeTo` on an existing quest. Left: nudge-only gauge/start value (D180 scope), datalist.

## 2026-10-24 · M7.1 Quest manager · sonnet (round 2)

- 0 H / 0 M / 6 L. check green (1,072), M7.1 e2e green; both Mediums confirmed closed. Lows: no cross-tab e2e for the stale warning; offer key uses Date.now; offers not tied to an undone entry; sticky stale note until Reload; vanished reset left the outcome line; list summary wraps in the narrow column.
- Fixed: the outcome line clears when the open quest vanishes. Others accepted as Lows.

## 2026-10-24 · M7.2 Bestiary and NPCs · sonnet (round 1)

- 0 H / 0 M / 6 L. check green (1,077), M7.2 e2e green; golden diff confirmed additive (v30, `stats: null`, `notes: ""`); no GM-only field in the player projection. Lows: stale "work in progress" comment; grade-hint regex matched "Wolf(s)"; substring name match is noisy for short names; a stat dropped from the rules is discarded on the next stats edit; warning screenshot shows the warning but not the fields above it; tier order compare could send a no-op edit.
- Fixed: comment removed; the grade hint now needs a capital grade letter (unit test for "Pale stalker(s)"). Others accepted as Lows (the warning is advisory, D181).

## 2026-10-24 · QF.19, QF.20, QF.21 (sweep C fixes) · reviewer: sonnet
- Round 1: 0 High / 0 Medium / 6 Low. Fixed: engine test that a blank reason adds no `reason` key; unit test for a mixed in-range/out-of-range reveal line. Kept: a give with both currency and items repeats the reason on both notices (each notice stands alone); the reveal list always comes from state; the QF.21 test checks variety, not uniformity (enough for a constant-source mutation, which fails it at 0, 0.5 and 0.999999).

## 2026-10-24 · M7.3 Encounter panel · sonnet (2 rounds)
- Round 1 (e7e40f3..f519548): 0 H / 2 M / 7 L. M1: the exact chance in the player's contest view let a player solve an NPC's GM-only stat back exactly; fixed: whole-percent chance (1–99% unless certain). M2: the reducer re-derived the outcome under current rules, so a rules change or undo could flip a result players saw; fixed: the outcome is settled at share time and stored in `contest.shared`, the reducer checks consistency only. Lows fixed: no-op damage/heal disabled; shared-roll list reads "won against" with the roll; solid pop-up background. Lows left: 10-contest cap on a player's view, pop-up has no focus move, stale side drafts until re-picked, absolute pool set, evolution-undo re-pricing of the grade-gap XP factor (outside D71).
- Own find in the full e2e: the pool tool's "Amount" label collided with the XP form in 9 specs; renamed "Points".
- Round 2 (f519548..cfdc38b): 0 H / 1 M / 5 L. M: rounding still allows estimating an NPC stat to a few percent; accepted as a design choice (D182) and asked as Q67 with the default kept. Low fixed: stale `SharedContest` doc comment. Lows left: unreachable "<1%"/">99%" branches in `chanceText`, stored odds not tied to the sides (GM-authored log), no end-to-end rules-change test.

## 2026-10-24 · M7.4 Trackers · sonnet (2 rounds)
- Round 1 (a2a36f2..28308e2): 0 High, 2 Medium, 6 Low. M: the e2e leak check searched only "SECRET"/"Ravenous" (region notes, faction standing and head count unchecked) → added each GM-only value to the frame scan. M: the GM screenshot cut off the factions section → new `gm-factions-1366x768.png`. L fixed: stale hunger-steps draft could overwrite steps changed elsewhere (draft now remembers its base); a no-op `hunger.configure` was accepted (refused: "nothing to change"); duplicate region names allowed (refused, case-insensitive). L kept: no tutorial-region seed button (M9.5 content pack), "Party is here"/"Clear" adjacency, the step fraction on the player row.
- Round 2 (28308e2..00ddea1): 0 High, 0 Medium, 6 Low. Fixed: misplaced doc comment above `checkCharacters`; the region-name check now collapses inner whitespace like the UI. Kept: a draft can revive after two external step changes that return to its base (visible, saved only on click); new reducer rejections affect only pre-release dev logs from this run.

## 2026-10-24 · QF.18 M2.A restart flake · sonnet (2 rounds)
- Round 1 (40e99b6..707ca06): 0 High, 2 Medium. M: the final `server.stop()` had the same race (the GM change log refetches after every change) → the test now waits for the award's change-log row before that stop too. M: the `/api/join` 503 theory was unproven → revised: the 503 is Fastify's `return503OnClosing` answering the in-flight change-log refetch while the server closes, the same race as the reset; the `/api/join` port read from the live socket stays as harmless hardening.
- Round 2 (707ca06..1c1aaeb): 0 High, 0 Medium, 2 Low (diagnosis proven by reasoning and 10/10 under load rather than a captured URL; a second debounced refetch could in theory still race). Kept: no second push seen in the code paths. Builder: `--repeat-each=10` of the latency project under a looping vitest load, 10/10 both rounds.

## 2026-10-24 · M7.A Milestone acceptance (M7 Quests, encounters, bestiary) · fable (2 rounds)
- Round 1 (1a96f67..cf5dfa8): 0 High, 2 Medium, 7 Low. M: removing a clock orphaned its open montage (players kept it, the GM could not close it) → `clock.removed` closes the clock's open montages. M: the contest roller kept a character's stat from when the side was picked → `refreshSide` follows state changes, keeping GM-typed fields. Lows fixed: the XP step now proves the +20% above-level bonus (340 split → 204 → level 2); a visible quest edit fences the hide-again frame check; comment fixed; roller screenshot added. Kept: bestiary stat units hint, side B grade default note (UX, to the QUALITY backlog).
- Round 2 (cf5dfa8..1076d59): 0 High, 1 Medium, 3 Low. M: the cascade changed how a stored v1 `clock.removed` folds (D34) → `clock.removed` v2, the v1 upcaster sets `legacy: true` and replays the old meaning; replay test added (D185). Lows fixed: exact-range Agility assertion; a side whose source is gone empties; entity-edit and missing-source refresh tests. Fixes verified by me (unit 1,125, M7.A/M7.3/M3.11 e2e green).

## 2026-10-24 · M8.1 Metallic grade themes · sonnet (2 rounds)
- Round 1 (d828151..b5bb96c): 0 High, 2 Medium, 7 Low. M: platinum read like silver in the screenshots (thin ring, faint streaks, crop hid the glow) → 4px ring, bold streaks, shots keep an 18px margin. M: tests compared only `--metal` tokens → spec checks the masked `::before` ring, every player window's frame, the real grade path (Sultan → aluminum) and reduced motion from page load. Lows to the QUALITY backlog (diamond animates only on the ring; `:not(.skill-detail)` specificity; tall phone shot).
- Round 2 (b5bb96c..5ac828f): 0 High, 1 Medium, 4 Low. M: the new platinum ring rendered darker than silver → bright blue-white streaks and gradient; the spec now decodes the rendered ring and requires platinum about as bright as silver and bluer. Full e2e also caught a regression: the metal heading rule outranked the skill detail's rarity colour (M3.5) → heading colours set at zero specificity (`:where`). Verified by the builder (M8.1, M3.5, M3.2 specs and the full suite); no third round (no High).
- Sweep D the same run (Rules sonnet, Boundaries fable, UX haiku): 0 High, 0 Medium, 6 Low, all to the QUALITY backlog; Q70 asks about PC-vs-PC contest stats.

## 2026-10-24 · M8.2 Evolution transition · sonnet (2 rounds)
- Round 1 (40c79cc..da89c25): 0 High, 4 Medium, 4 Low. M: the reduced-motion test passed with the media block deleted → it asserts `evolving` is on while nothing moves. M: switching character could play a false transition → the hook resets on a character change. M: a reconnect onto a higher grade plays it → accepted (the player did evolve; D187). M: unused `count` → removed; a `started` counter restarts the timer.
- Round 2 (da89c25..3b8881b): 0 High, 0 Medium, 4 Low (hook untested beyond `isEvolution`; an `undefined` grade gap would skip a flash; evolving into diamond briefly swaps `prism` for the sweep; the 2.4s window under CI load) → QUALITY backlog.

## 2026-10-24 · M8.3 Accessibility · reviewer sonnet (worktree)
- Round 1 (16f7677): 0 High, 4 Medium, 6 Low. M1 placeholders unchecked and browser-dim → `::placeholder` uses `--muted`, scanner checks placeholders, planted dim placeholder proves it fails. M2 only default state scanned, rarity colours unchecked → every `<details>` opened and rescanned on GM and both players in all 7 themes; token test checks all 9 rarity colours and `--text/--muted/--ok/--err/--accent`. M3 focus ring accepted any box-shadow → needs a ≥2px opaque outline at 3:1 against the composed background. M4 dialog test used `.focus()` → skill reached by Tab; 8 Tabs stay inside the modal. Low: unparsed colours now fail instead of skipping; others (url() backgrounds, disabled exemption breadth, accent ring not themed, reduced motion drops the flash highlight) noted, no change.
- Round 2 (b50f5ff): 0 High, 0 Medium, 4 Low (ring background ignores gradient layers; trap check treats body as inside; only the skill dialog is Tab-tested; rarity regex covers `.skill-name` only). All four round-1 Mediums confirmed closed. No change.

## 2026-10-24 · M8.4 Sound (wip/M8.4) · reviewer sonnet (worktree), round 1 only
- Round 1 (5c75d84): 0 High, 2 Medium, 6 Low; the reviewer read the diff but did not run the checks (no node_modules, time budget). M1 the volume screenshot clipped the header away → fixed (e977766: scroll to top, 160px clip; slider visible). M2 test gaps: View-as pane and character switch silence untested, quiet-on-load asserted too early → the load check now waits 500ms; pane and switch tests still to add. Lows to weigh next run: selection sound keyed on count not ids; a second evolution within 2.4s does not replay; no preview sound; linear volume curve.
- Box not checked: a round 2 (2 Mediums) runs next run after the pane/switch tests.
- Round 2 (7de3cea, run 88c950af, sonnet worktree; check 1,144 unit green, M8.4 + M3.3 e2e 3/3): 0 High, 0 Medium, 7 Low. Both round-1 Mediums confirmed fixed (the pane test fails if any pane guard is removed; verified locally by deleting the selection guard: 3 notes heard). Fixed Lows: an empty stored volume read as 0 (now the default 70, unit test); no phone screenshot (volume-390x844.png added, slider in viewport). Left as is: the switch test is a full page load (the app has no in-page switch, so the id guard is belt and braces); mute asserted on DING only (playSound returns at volume 0 for every kind); no preview sound on the slider; back-to-back evolutions within 2.4s replay no swell; a +1/−1 selection in one snapshot plays nothing. Box checked.

## 2026-10-24 · M8.A Milestone acceptance (M8 Look and feel) · reviewer fable (worktree), round 1
- Scope c55d91a..cbb2630. Reviewer ran check (1,144 unit) and the five M8 specs (9/9), viewed all 24 PNGs in docs/screens/themes/ (every metal recognisable; silver vs platinum distinct on laptop and phone; dull vs shiny visible; phones single column, no sideways scroll). 0 High, 1 Medium, 8 Low.
- M1 a page reloaded with sound remembered on never resumed its AudioContext (created before any gesture → suspended), so every sound that session was silent; confirmed by reading `playSound` (no `resume`). Fixed: `playSound` resumes a suspended context, and the player page unlocks audio on the first pointerdown/keydown while sound is on; unit test with a suspended context.
- Low 1 fixed: platinum vs diamond ΔE ≥ 10 now asserted in themes.test.ts. Lows 2–8 to the QUALITY backlog (evolve-ring brightness on dull metals, DING over the swell, count-keyed selection cue, second evolution within 2.4s, M8.1 shot names, slider/evolution dialog not in the keyboard sweep, PNG churn).
- One Medium, no High: no round 2 (LOOP §6.4); fix verified locally (check 1,146 unit; M3.3, M8.2–M8.4, M8.A e2e green). Box checked.

## 2026-10-24 · M9.1 Session report · reviewer sonnet (worktree), rounds 1–2
- Round 1 at 5b071c8 (range 3a630aa...5b071c8): 1 High, 2 Medium, 4 Low.
- H1 the new report column made the phone-width GM console scroll sideways (M4.3's 390px check, 1px after three sessions); reproduced. Fixed: length column hidden ≤600px, report buttons stacked.
- M1 the copy ran after `await fetch`, so Safari/Firefox could refuse it (activation spent). Fixed: in a secure context the `ClipboardItem` write starts inside the click, fed by the fetch; otherwise the legacy copy; if that is refused too the report is shown selected in a textarea.
- M2 the fallback e2e did not prove the fallback. Fixed: it removes `navigator.clipboard`, counts `execCommand('copy')` (exactly 1) and reads the clipboard from another page; a new test covers the refused-copy textarea.
- Round 2 at 884f0c5: 0 High, 0 Medium, 4 Low. Low 2 fixed (the textarea is selected once in an effect, not on every render). Lows 1, 3, 4 to the QUALITY backlog. Box checked.

## 2026-10-24 · M9.2 Content format · reviewer sonnet (worktree), rounds 1–2
- Round 1 at cf7d306 (range 5074a8b..cf7d306): 1 High, 3 Medium, 5 Low. The reviewer ran the examples through the real commands.
- H1 title `percent` unit: the engine stores fractions, the doc/example taught whole numbers (5 → +500%). Fixed: files use whole percent (−99..10,000), `contentToCommands` divides by 100; a test runs the library and bestiary examples through `execute` and checks 0.05.
- M1 text limits looser than the event checks (names 80, descriptions 2,000, flavour/tier text 1,000, tags 40). Fixed to match. M2 stat maps allowed negatives. Fixed: 0..1,000,000. M3 doc overstated option counts. Fixed: states the 3–4 default menu size, capstone levels and ceilings, ≤2 transforms, merge rarity rule.
- Lows fixed: no-repeat refinements (bonus stats, option names/ids, transforms, professions); doc says the JSON Schema can't express the refinements; example capstone explained by the doc; mapping tested.
- Round 2 at ae42ff3: 0 High, 0 Medium, 5 Low. Fixed Lows 1–3 (rules ids ≤ 40, character refs ≤ 100, doc: an exact id wins). Low 4 (duplicates across entries) is for M9.3's preview; Low 5 harmless. Box checked.

## 2026-10-24 · M9.3 Import with approval · sonnet
- Round 1 at 91668cc (range ed76378..91668cc, previous run): 1 High, 4 Medium. H1 non-preview error replies crashed the GM window: fixed in cc950a2. Mediums (re-check only ticked entries, drop applied entries after a refusal, say the campaign may have changed, missing tests) and "clear the preview when offline": fixed in ad012dd (engine `only`, route `{ file, only }`, UI re-check on every tick, server tests for wrong key / bad file appends nothing / 404 / character errors, e2e for disabled rows and a stale preview). Also added: duplicate-item note (items may share names), re-picking the same file re-checks it.
- Round 2 at ad012dd: 0 High, 1 Medium, 4 Low. M1 no UI test for error replies or a blocked tick: fixed (e2e routes the preview to 404, 413 and an aborted request, and a re-check error that blocks Apply until unticked). Low 3 stale duplicate notes after a re-check: fixed (re-check refreshes notes). Low 4 test title overclaimed: fixed. Low 1 (`{ file }` wrapper detection) intended per D193; Low 2 (JSON-escaped text can reach the 2 MB limit at ~1.8 MB) left: content files are a few KB. Verified myself: check 1,176 unit, M9.1–M9.3 e2e green with 2 workers. Box checked.

## 2026-10-24 · M9.5 Tutorial content pack · sonnet
- Round 1 at 0e37706 (range f28dec2..0e37706): 0 High, 2 Medium, 8 Low. M1 re-importing silently doubled quests and GM notes: fixed (preview notes a quest or GM note whose title exists). M2 weak secrecy check: fixed (engine test imports the pack, reveals every entity and checks `projectForPlayer` for region names/notes, GM notes, the hidden quest, stability tags, bestiary names/notes; e2e checks more strings). Lows fixed: Stormlung pacing note (fight the F-grade lord before evolving), vacuous Host note, upper-case stability tags refused in the file, Q72 mentions the day-1 hidden-quest notice and stability starting at max. Lows left: two "Pale Hunter" labels (levels differ in the tier text), engine error prefix in the list, no select-all (backlog), GM-note tag case-duplicates.
- Round 2 at 44e4801: 0 High, 0 Medium, 4 Low. Fixed: the secrecy test now checks every Uncommon/Rare tier text, reveals must succeed, upper-case tag test. Low 4 (screens regenerated by the full e2e run) is expected. Full e2e 94/94 at 0e37706; check 1,181 unit at the fix. Box checked.

## 2026-10-24 · M9.A Milestone acceptance and review · fable
- Round 1 at 0c4c6d1 (range 7dddaaa..0c4c6d1): 0 High, 2 Medium, 6 Low. M1 drafted menus and evolutions applied to the player's screen from an anonymous preview row: fixed (preview note names whose screen it goes to, the options with rarities and what it replaces; CONTENT-FORMAT says drafts apply at once and when to import). M2 the report had no party sheet for Claude to draft against: fixed (session log/report `party` section, JSON and markdown). L3 partly fixed (more GM-only strings scanned, preview note and party lines asserted). Other Lows to the QUALITY backlog. D198.
- Round 2 at 407a703: 0 High, 0 Medium, 3 Low. Fixed: skill marks and nickname moved outside the brackets so the bracketed name is exact. Others to the backlog.

## 2026-10-24 · M10.1 Electron wrapper (final) · sonnet
- Round 1 at 7bd4eff (range ee1a405..7bd4eff): 0 High, 2 Medium, 4 Low. M1 Windows log-off (`session-end`) set `quitting`, so before-quit skipped the server close and the quit backup: fixed (a separate `sessionEnding` flag only skips the question). M2 a stuck listener close let the 5 s exit guard fire before the backup: fixed (`close()` waits at most CLOSE_GRACE_MS 3 s, then backs up and closes the campaign anyway). Lows (unpruned quit backups by design D199, same-second quit backup fails silently, Ethernet path missing from the Windows steps, loopback-only join hint) to the QUALITY backlog.
- Round 2 at 2fac8ed: 0 High, 0 Medium, 5 Low (in-flight HTTP after the grace close gets a 500; demo campaign LOCK left on a stuck close; no test for the grace path or session-end; screenshot churn). To the backlog. Box checked.

## 2026-10-24 · QF.22 Pin drafted re-ratings and closed menus · sonnet
- Round 1 at adb3d33: 0 High, 0 Medium, 3 Low (screenshot churn from the concurrent full e2e run, expected; mixed apostrophes match their fixtures; box unchecked in the work commit by design). Both sweep mutations now fail the new tests (confirmed by me and the reviewer). Box checked.

## 2026-10-24 · M10.2 Packaging and releases (final) · sonnet
- Round 1 at f30120d (docs: D200 reads "all three artifacts" per D97, Q73): 0 High, 0 Medium, 4 Low. Evidence: local `--linux` package built the AppImage, packaged smoke passed, the AppImage answered /health under xvfb; Release run 40092258606 green with the installer and the AppImage. Low 4 (packaged smoke did not prove the quit backup) fixed: the packaged smoke now creates a campaign, quits and finds the `-quit` backup (passed locally on linux-unpacked). Low 1 (D200 understated re-adding macOS) fixed in the D-entry. Lows 2 (latest green run was a dispatch, not a `release` push) and 3 (pkill in the AppImage smoke) to the backlog. Box checked.

## 2026-10-24 · M10.A Milestone acceptance and review · fable (2 rounds)

- Acceptance: `npm run check` green (1,190 unit); desktop smoke 7/7 (35/35 at --repeat-each=5); full e2e 90/91 + latency 6/6, the one miss (`M8.A` climb, timeout under reviewer load) passes alone; fable's local `--linux` package + packaged smoke 1/1 and AppImage /health under xvfb; Release dry run 40138628866 on `release-dry-run` (tree = d090bf8) green on Windows and Linux, packaged smokes included.
- Round 1 (4ac401af): 0 H / 2 M / 6 L. M1 release evidence predated the M10 code → dry run pushed, green. M2 an NSIS upgrade's polite close opened the quit question and the forced kill skipped the quit backup → `RunningApp.backup()` taken when the question opens, deduped by event count (D201), with a unit test and an Electron test that closes politely then SIGKILLs (fails with the call removed). Lows to the QUALITY backlog.
- Round 2 (32bb3d3a): 0 H / 1 M / 4 L. M the new Electron test called `app.process()` after the kill (Playwright disposes it) → process captured once; 35/35 runs. L: the "asking twice" comment described the guard, not the dedupe → reworded; Windows log-off now also takes the copy at `session-end`. Remaining Lows (main-thread sync copy; a session-end backup not deduping the quit copy) noted, not fixed.

## 2026-10-24 · M11.1 Soak test · sonnet (run 6cf41e9c)
- Round 1 (63589493): 0 H / 2 M / 5 L. M: commands built from a possibly stale client view (failed at SOAK_STEPS=4000 on a rejected `freePoints.override`); desync checked only once at the end with a 1 s poll. L: error frame thrown inside the WS listener; sockets not closed on failure; no GM-only canary; unused `frames`; seed missing from some messages. Fixed in d58aab77: after every step each player's view and the GM's state must equal the server's projections (10 s bound), so each next command is valid by construction; error frames reject waits; sockets closed in afterAll; a GM-only note's text must never reach a player frame.
- Round 2 (d58aab77): 0 H / 0 M / 5 L. Fixed two: the canary is asserted present in the GM projection (not vacuous) and every client's `serverError` is asserted null at the end; the heap assertion names the seed. Left: generic `waitFor` timeout text, no close listener naming a crash, heap margin ≈ 7 MiB (fine for the < 20% criterion).

## 2026-10-24 · M11.2 Recovery · sonnet (run 6cf41e9c)
- Round 1 (dc4136f2): 1 H / 2 M / 5 L. H: `window` in an e2e `page.evaluate` broke `tsc -p tsconfig.tools.json` (check red). M: a zero-length or short log beside a snapshot that recorded more events opened silently as a short campaign (and the next snapshot would erase the evidence); a client rejoining with `lastSeq` above the log's length kept notifications for events that no longer exist. Fixed in 09913e7c: e2e scrolls with a locator; `lostWrites()` makes the store refuse to load and change nothing, naming backups and the snapshot rename; the hub resets a client's history when it is ahead of the log; tests for both. Lows to the QUALITY backlog (outage display, no heartbeat, same-millisecond torn names, untested NUL/snapshot shapes).
- Round 2 (09913e7c): 0 H / 0 M / 2 L. Fixed: the refusal says to keep the renamed snapshot. Backlog: `lostWrites` compares post-upcast counts with raw lines (latent until a splitting raw upcaster exists).

## 2026-10-25 · M11.3 Performance · reviewer: sonnet (2 rounds)
- Round 1 (8938c94): 0 High, 4 Medium, 6 Low. Mediums: (1) the timing test warmed the server first, so the cold first visit was never timed → fixed: no warm-up; the 1366 test is the first visit after the server starts (1.0–1.1 s cold, 0.4–0.5 s warm); (2) synthetic best-case campaign (four command kinds, no undo, notes or snapshot) → accepted: the 50k load test is already the no-snapshot worst case, and the sheet test's 12,500 broadcasts and 3,125 practice entries per hero are the payloads that grow; (3) the page limit kept its size across filter/search changes → fixed: reset to 50; (4) revealing the last page unmounted the focused button and focus fell to the body → fixed: flushSync, then focus the first newly shown entry (tabindex -1, accent outline). Lows fixed: messages sliced from the end before reversing; the paging test no longer depends on the generator's 4-command cycle. Lows left: the shared id index is never pruned (stale entries from dropped branches; a mismatched hit falls back to the scan); vitest perf bound shares the machine with other files (0.75 s vs 3 s); specs rewrite screenshots (existing convention).
- Round 2 (da89236): 0 High, 0 Medium, 2 Low (ding row keys `${seq}-${rows.length - i}` remount every row when a ding arrives, so focus on a revealed entry is lost; the tabindex -1 stays on revealed entries). Both to the QUALITY backlog.

## 2026-10-25 · M11.4 Guides · reviewer: sonnet (2 rounds, run 7a8361b5)
- Round 1 (fdb84e05): 0 H / 4 M / 5 L. M: (1) the GM guide pointed at `docs/content-packs/tutorial.json`, which the installer does not ship → the guide says the docs and the pack are on GitHub and how to download them; (2) the quickstart sent players to `docs/TROUBLESHOOTING.md` → "tell the GM; the Players join panel has the fixes"; (3) `scripts/guides.test.ts` matched bold labels against all source, comments included → per-surface sources (GM guide vs `gm/` + desktop, quickstart vs `player/` + JoinPanel), comments stripped (it caught "Sound: off" existing only in a comment), port messages from `launch.ts` and the firewall menu paths from `JoinPanel.tsx` asserted, quickstart word cap; (4) macOS steps without saying there is no macOS download → noted. Lows fixed: **Create campaign** named, installer and AppImage `chmod +x` notes, port-fallback message quoted. Left: Linux FUSE, address order wording (accurate).
- Round 2 (ae1df461): 0 H / 0 M / 4 L. Fixed: repo paths and roadmap IDs out of TROUBLESHOOTING; GM guide links are absolute GitHub URLs (work from a downloaded copy); the `stripComments` regex-literal limit is documented. Left: `includes` still passes a partial rename of a long label and short generic labels match anywhere on their surface (stated in the test's header).

## 2026-10-25 · M11.5 Final review · reviewer: fable (whole repo, run 7a8361b5)
- Round 1 (480d613a): 0 H / 0 M / 7 L (two of them guesses). Checked clean: engine rules vs DESIGN (bonuses, pools, XP overflow, grade walls, Identify range, re-rating, merges), every path to a player (projections, hub, routes, Origin and Host checks, portraits, reports), Electron hardening, the projection canary, the GM guide's first-session path and the screens vs §9. Fixed: the hub now logs an engine error inside a command (`hub.ts`). Kept as Known gaps in `docs/DONE.md` (D208): "GM key needed" mentions the server terminal; internal command names in "only the GM can …"; DESIGN §9's one-line DING example; real-campaign portraits not served while the demo is loaded; DESIGN §6 vs L14 on marks after a GM raise. No second round (no High, fewer than two Mediums).

## 2026-10-25 · MT.1 Evolution re-rating is approved, not automatic · reviewer: sonnet (worktree)
- Round 1 (ef6e8611): 0 H / 3 M / 5 L. M1 an evolution merge transform could consume Identify → an approved release refuses merging a race skill away. M2 the old-log replay test was weak → added a full MR.1-style list (Identify lowered, no approval mark) that replays unchanged. M3 content import auto-approves → preview test shows the re-rating note and a lowered Identify as an error before Apply. L1 stale builder picks after a rarity change → picks keyed by the rarity they were made at. L2 race rows unmarked → "(race skill: never drops)". Other Lows (wording, release not resetting approval, no Identify e2e) accepted.
- Round 2 (366ee8d3): 0 H / 1 M / 3 L. M renaming Identify by a transform loses it → an approved release refuses renaming a race skill; the simulation no longer transforms race skills. Lows (an old pick reappearing if a rarity changes back, approval re-required anyway; merged rows still sent, ignored by the engine) accepted. Fixes verified by me (npm run check 1,213 tests; e2e MT.1, M5.2, M5.A, MR.1; full e2e 93 green before round 2).

## 2026-10-25 · MT.2 Players accept or decline merges · reviewer: sonnet (worktree)
- Round 1 (13d242ac): 0 H / 3 M / 4 L. M1 the offer card sat below Notes on phones (CSS order) → `.merge-offer-window` leads the ≤700px column; e2e asserts it is in the viewport. M2 a stale offer kept an enabled Accept → the projection sends rarity null when the merge no longer applies or a skill's rarity changed, and the card disables Accept with a note. M3 the GM's accepted/declined line was React state → `lastMergeAnswer` on the character (GM-only), read by the builder; e2e reloads the GM page. Lows: L4 false "declined" (fixed by M3); L5 offers not auto-cleared (kept: decline clears it); L6 more stale tests (added a practice-removal case); L7 offer text not in the session log (kept).
- Round 2 (aace462f): 0 H / 0 M / 4 L (the answer line persists until the next answer; no UI test of the disabled Accept; the answer stays on the character; no order assertion). Kept as Lows.

## 2026-10-25 · MT.3 No hunger tracker · reviewer: sonnet (worktree, 33df7f78)

- Round 1: 0 High / 0 Medium / 6 Low. No bugs, no leaks; old logs and v1 rules load; goldens legitimately re-recorded.
- Fixed Lows: stale QUALITY.md canary note; M7.4 roadmap line marked retired; import note no longer repeats "Ignored". Kept: tutorial GM note mentions narrated hunger (matches DESIGN §7); engine-level undo of a no-op hunger event is harmless (no UI button); retired `hunger` content section documented on purpose.
- No round 2 (no High, under two Mediums).

## 2026-10-25 · MT.4 Credits history for players · reviewer: sonnet (worktree, 55a3b5ec)

- Round 1: 0 High / 0 Medium / 6 Low. No leaks (own rows only, `characterId` never copied; frame scans clean).
- Lows not fixed this run, added to the QUALITY backlog: shared 300-entry ledger can evict a quiet player's oldest rows with no hint; rows show no date; raw-id fallback for a missing counterparty; test gaps for trade/loot rows in the projection test. No round 2.

## 2026-10-25 · MT.5 GM override for level, XP and grade · reviewer: sonnet (2 rounds)
- Round 1 (0f0df467): 0 H / 2 M / 5 L. M1 lowering levels at the same grade left a released evolution that could no longer be chosen → withdrawn when the grade changes or the new levels leave the gate (`keepsEvolution`), warning names it and lost profession offers; test added. M2 the override form kept a stale draft after an undo or award (two clicks re-applied an undone override) → the form reloads on live grade/level/XP changes and closes the warning; e2e asserts it. Lows fixed: engine refusal shown in the warning with Apply disabled; XP input capped at the schema's 100,000,000; warning says re-earned levels grant spread again. Lows kept: grade below its level floor allowed (GM authority); test gaps for overflow-off and dependent-undo.
- Round 2 (5b597710): 0 H / 0 M / 5 L (render-time preflight is cheap; no-op for logs; cosmetic reload note) → QUALITY backlog, no change.

## 2026-10-25 · MT.6 Broadcast banners · reviewer: sonnet (round 1 of 2; box not checked)
- Round 1 (fdb64713): 0 H / 3 M / 6 L. M1 player banner scrolled away → sticky (wip/MT.6 6d9e9348). M2 live arrival stamped with a possibly stale tick → wall clock (same commit). M3 no GM indicator / bulk remove for stacked banners → open, next run. L4 Show stayed on Pinned after sending → reset. Other Lows (GM/player counting start differ by ≤1 s; pane duplication with PaneLatest; banner not grade-coloured; no state bump for optional fields; command zod shape lacks `display`; test gaps for `activeBanners`) → next run / QUALITY backlog.
- Round 1 M3 fixed on d2a09b57 (header "N banners up" chip with Remove all; stack scrolls past 40vh on phones; `display` in the command zod shape).
- Round 2 (sonnet, d2a09b57): 0 H / 1 M / 4 L. M1 a timed banner first seen after a reconnect or wake ran its full time from the reconnect while the GM list had expired it → `bannerStart`: a live arrival more than 2 minutes after its send time times from send + 2 min (56a26266). Lows fixed: clock-skew limit documented on `bannerStart`; scheduled messages say they are list-only; unit tests for `activeBanners` and `bannerStart`. Low kept: GM list times from the server's clock on the GM laptop (same machine as the server, so no skew). Max rounds reached: fix verified by unit tests, `npm run check` (1,244) and e2e/MT.6 green. Box checked.

## 2026-10-25 · QF.23, QF.24, QF.25 (sweep B Mediums) · reviewer: sonnet (worktree, 272f4471)
- Round 1: 0 H / 0 M. QF.23: mutation of the `race.has(t.skill)` branch fails `rerateApproval.test.ts` (confirmed). QF.24: owner-only (hub filters by `characterId`, offer already owner-only in the projection), every notification-kind switch covered, undone offers replay away. QF.25: keyboard e2e covers Review → warning, Cancel → Review override, Apply → outcome.
- Lows kept (QUALITY backlog): QF.24 e2e's "Amy hears nothing" checks are negative and weakly ordered; the offer notice is not in the 'DING!' voice and plays no chime (by design: it is not a gain); QF.25 focus still drops to the page when a live change closes the warning from elsewhere; Escape does not close the warning. No round 2.

### 2026-10-25 · MT.7 The GM can override any rule · sonnet (2 rounds)
- Round 1 (85b9d6b5): 1 H / 3 M / 3 L. H1 refusal scanner blind to variable/ternary messages (rules.edited, tier/rank problems, contest) → scanner reads ternaries and `…Problem` returns, test guards variable sites, 14 rows added. M2 merge override still refused past the ceiling → override passes it. M3 evolution merge/race-skill rows claimed unusable ways through → rewritten (release without the transform, then merge/grant after). M4 "undo the choice" for a held profession → profession override replaces one. Lows: marks reset on raise is the documented upgrade rule (kept); flag staying on a release is harmless (kept); select truncation (kept).
- Round 2 (84ee98ae): 0 H / 3 M / 1 L. M1 reserved/end-of-ladder merge gave a misleading ceiling message → own message and row. M2 same-name profession re-grant refused under override → allowed (resets level). M3 scanner still missed throw ternaries, BonusRuleError, itemOutOfReach/overLimit returns → all read; 26 rows added. L "undo the choice" rows → point at Replace profession. Verified by `npm run check` (1,267 unit) and MT.7 + touched e2e specs (8/8). Max rounds reached.

## 2026-10-26 · MT.8 Faction reveal toggle · sonnet
- Round 1 (f5009810): 0 High, 2 Medium, 6 Low. M1 a revealed faction's edits reach players with no GM warning → inline "players see the name and standing as soon as you save" note on its edit form (e2e asserts it). M2 `factions: 'party'` is a derived view, not a passthrough → comment and a unit test pinning entries to exactly `name`/`standing`. L1 GM-OVERRIDES.md locations stale → refreshed from `gm-refusals.mjs` (44 rows, locations only). Other Lows (panel placement wording, card/button layout, label-in-name, long comment lines) left as is: cosmetic.
- Round 2 (a4576ff5): 0 High, 0 Medium, 0 Low. Fixes verified; the unrelated screenshot churn from the full e2e run was restored before push.

## 2026-10-26 · MT.9 End-of-scene prompt (round 1, on wip/MT.9) · sonnet
- Round 1 (90d28138): 0 High, 4 Medium, 4 Low. M1 the player's log-then-answer claimed success when the answer failed → fixed on wip (e44483ca): it now says the prompt closed. Open for the next run: M2 the GM's End scene re-click replaces an open prompt, `scene.end` result unchecked, and the GM's own walk-through does not answer the prompt (decide: GM logging for a character sends `scene.answer`); M3 the prompt is easy to miss on a phone (needs a banner/badge near the top); M4 engine tests for stale scene id, double answer, empty/unknown/partial `characterIds`, undo of both events, replayed player `scene.answered` for another character, and e2e for "Nothing this scene". Lows: unknown character reads "already answered"; `sceneId` reuse unchecked; `at` unused; GM-OVERRIDES row order. Round 2 is required (4 Mediums).

## 2026-10-26 · MT.9 End-of-scene prompt (round 2) · sonnet
- Round-1 fixes (eeb287c9): M2 "Resume end of scene" restarts the walk without replacing an open prompt, `scene.end` result checked, the GM's walk answers for the character (D222); M3 status-window flag "End of scene · What did you practise? [Answer]"; M4 engine tests (stale id, double answer, empty/unknown/partial lists, undo of both, forged player answer on replay) and e2e for "Nothing this scene". Lows fixed: unknown character named as unknown; reused scene id refused; GM-OVERRIDES rows moved into line order.
- Round 2 (eeb287c9): 0 High, 2 Medium, 3 Low. M1 the GM's walk unmounted a player's half-typed answer → the prompt now stays with its draft and says "The GM has answered this scene for you"; Send still logs, Close dismisses (e2e covers it). M2 a GM-side answer refused after a successful log overwrote "Logged" with an error → the refusal is silent (the player answered first). L3 an absent player blocked new scenes → "New scene (drop unanswered)" (e2e). L4 D221 vs D222 wording → D222 states which clause still applies. L5 GM screenshot now shows the review queue. Verified myself (no round 3 allowed): `npm run check` 1,277 unit green; MT.9 + M5.5 e2e green; full e2e run before merge.

## 2026-10-26 · MT.10 Portraits in backups, exports and the status window · sonnet
- Round 1 (1bafa6d3): 0 High, 0 Medium, 7 Low. check 1,281 green; MT.10/M4.4/M2.A e2e green; screenshot judged fine against DESIGN §9. Lows kept as is (Backlog-level): a copy failure mid-backup or mid-import leaves a `.tmp-`/`.import-` staging folder (same handling as before; cleared on retry); backups copy every portrait each time (small, capped at 2 MB); exports include orphaned portrait files; restore tested by copying a backup folder (unit), no e2e of import; long doc line; a `portraits` key on a version 1 file is ignored. No round 2 needed.

## 2026-10-26 · MT.11 Tutorial hidden quest imports switched off · sonnet
- Round 1 (0bca76e8): 0 High, 0 Medium, 2 Low. check 1,283 green; M9.5/M9.A/M7.1 e2e green. L1 an imported-off quest looked like any hidden quest in the GM's list → the list line now adds "nobody told" (M7.1 and M9.5 e2e green after). L2 the exported JSON Schema cannot express the "notice only on hidden quests" refine; the app's preview and import enforce it and CONTENT-FORMAT.md says so (kept). No round 2 needed.

## 2026-10-26 · MT.A Batch acceptance and review · fable (worktree, b06c7cc2, run 71e1198d)
- Round 1 (71141cc9..b06c7cc2): 0 High, 1 Medium, 5 Low. Reviewer: check 1,283 green; MT e2e 12/12; full e2e 106/106 (1 worker); screenshots meet DESIGN §9; no GM-only data to players (faction notes/members, other players' scene prompts, merge answers and ledgers probed); hunger upcaster, MR.1 replay and undo dependencies checked.
- M (MT.5 × selections): lowering the class level left an open menu from the lost level choosable → the override now withdraws unchosen menus above the new level and the warning names them (D225); engine test added.
- L `scene.ended` capped at 64 characters → 200 (D225). Other 4 Lows (re-rating list edited after approval, GM-OVERRIDES line drift, setState in render in PracticePanel, merge-offer stale wording) → QUALITY Backlog.
- One Medium, no High: no second round (LOOP §6.4); fix verified by me (npm run check 1,284; e2e MT.5, MT.9 green).

## 2026-10-26 · MC.1 AI connection · sonnet (worktree, bc01e511; round 1, item not yet checked)
- Round 1 (3d4a6955..bc01e511): 1 High, 4 Medium, 5 Low. Reviewer ran the three AI test files (21 green), screenshot reviewed.
- Fixed on wip/MC.1 (2dac7747): H1 Linux `basic_text` safeStorage counts as no encryption; M3 `hasKey` = the key decrypts; M4 the co-DM routes answer a malformed body with a fixed message (canary test added).
- Open for the next run: M2 panel text when the desktop has no OS encryption ("open the desktop app" is wrong there; send a reason); M5 canary in a player frame and `/api/characters` plus a `logger: true` log capture. Lows: spend in memory only (restart zeroes it), non-integer usage throws after a paid call, `ai-settings.json` not written atomically, model fields free text / disabled Test without a reason / message lingers, `startApp` always builds the live client (guard tests). One High → round 2 required after the fixes.

## 2026-10-26 · MC.1 AI connection · sonnet (worktree, 9c3520f7; round 2, run 46cb339b)
- Round 1 M2 fixed (status `saveBlocked` reason; panel wording per reason) and M5 fixed (`coDmCanary.test.ts`: real listener with request logging, player WebSocket, `/api/characters`; mutation that logs the key fails it). Reviewer: check 1,308 green, MC.1 e2e green, round-1 fixes verified.
- Round 2: 0 High, 2 Medium, 3 Low. M1 no timeout on the live call (a stalled network hangs the panel) → fixed on wip/MC.1 (e4784cf4: `AbortSignal.timeout(60 s)`, test with a stalled fake fetch). M2 the key-saved UI path (Save, Remove, Replace, Test success, spend after a test) has no e2e → open; next run adds a test-only fake cipher to the e2e server and covers it, then checks the box (round limit reached; fix verified by the run).
- Lows: keychain decrypted on every status call (macOS prompts), the no-encryption hint names Linux keyrings on every OS, a test call shows "$0.000".

## 2026-10-26 · QF.26 Pinned banners readable when scrolled · sonnet (worktree, 1f8f4b80)
- 0 High, 0 Medium, 2 Low (the flat `--bg` stack is a shade darker than the body's radial gradient at the top; the stack's gap fill is intended). `--bg` defined once, no theme overrides it; banners render only on the player screen. MT.6 e2e green. Checked.

## 2026-10-26 · MC.1 AI connection · round-2 fixes verified (run 56591c49)
- Round 2 M2 (no e2e of the key-saved path) fixed at 62d32407: test-only fake cipher and AI client behind `THE_SYSTEM_E2E_FAKE_AI=1` (D228; the fake cipher refuses non-test keys); e2e covers a refused malformed key, Save, the key never shown or written verbatim, Test connection, spend $0.001 · 1 call, reload, Remove, and no key text in player frames or `/api/` bodies; unit tests for the switch and the fake. Round 2 had no High, so no third round (LOOP §6.4); verified by me: check 1,314 green, MC.1 e2e 2/2. Lows → QUALITY Backlog. Box checked.

## 2026-10-26 · QF.27 [Answer] scrolls the scene prompt clear of the banners · sonnet (worktree, 8f668715)
- 0 High, 0 Medium, 5 Low. check 1,314 green; QF.27/MT.9/MT.6 e2e green; screenshot fine. Lows kept: the inline scroll-margin is never cleared (recomputed per click), the stack is found by test id, one assertion is implied by another, a banner growing after the click can overlap transiently. The e2e fails without the fix (−197 px).

## 2026-10-26 · QF.28 Portrait import size and empty-file checks tested · sonnet (worktree, e63568d2)
- 0 High, 0 Medium, 0 Low. Empty and oversize portraits now have their own messages (the empty check was masked by detectPortrait); both mutations and `>`→`>=` fail a test. Nits: "2 MB" also hard-coded in portraits.ts; `fits.close()` skipped only on failure.

## 2026-10-26 · MC.2 Generate on demand · sonnet (worktree, b4c69dbe; round 1, item not yet checked)
- Round 1 (487ae13e..b4c69dbe): 2 High, 5 Medium, 3 Low. Reviewer: check 1,327 green; MC.2/M9.3/MC.1 e2e green; no GM-only data to players; route behind the GM key.
- Open for the next run (fix on wip/MC.2, then round 2): H1 a generation arriving mid-Apply in ContentImport is wiped by the old apply loop (disable Generate/Preview edits while Import is busy, or make apply honour checkRun); H2 `loadText` ignores checkRun, so a slow file pick and a generation race. M3 no timeout/cancel on a generation (server and panel); M4 no-campaign 404 untested, route absent without coDm; M5 regenerate coverage weak and it overwrites edits without warning; M6 per-kind tests don't check sections, no 20% cap case; M7 a refused generation reads as "ready" in the panel. Lows: Generate/Regenerate buttons touch; no "AI-generated, check it" note in Import; recheck catch skips setChecking(false).

## 2026-10-26 · MC.2 Generate on demand · sonnet (worktree, 069b67d5; round 2)
- Round-1 fixes (069b67d5): H1/H2 Import takes one load at a time and defers a co-DM hand-over while loading or applying, newest load wins; M3 150 s server time limit, Cancel aborts the request and the API call; M4 404 and 503 tested; M5 confirm before Regenerate drops edits, e2e both ways; M6 per-kind section types and a 20% cap test; M7 readiness message only says ready when every entry applies. Lows: button gap, co-DM note in Import. D230.
- Round 2: 0 High, 2 Medium, 6 Low; check 1,335 and MC.2/MC.1/M9.3 e2e green; no GM-only data or key to players; all round-1 findings confirmed fixed.
- Fixes (a8fbedce): M1 the Cancel e2e could not see the server: added a server test on a real listener that drops the request and checks the API call's signal aborted and nothing was counted (fails with the abort removed); M2 the hand-over gate is `takesIncoming` with unit tests (busy defers, each seq once). Lows fixed: "Applied N" stays after a deferred hand-over; checking reset when an incoming preview fails; panel aborts on unmount; spend under-read on cancel noted in D230. Lows kept: a hand-over replacing a just-picked file (newest wins, by design); redundant client timeout (harmless).

## 2026-10-26 · MC.3 Shops · sonnet (worktree; round 1 at 998ad972, round 2 at 0955e3d0)
- Round 1: 0 High, 2 Medium, 5 Low; check 1,349 and MC.3/MC.2/M9.3 e2e green; no shop data reaches players (projection marks shops/shopOrder GM-only; change-log phrase names nothing).
- Fixes (b5503d2a, 0955e3d0, D232): M1 the GM's open offers are listed in the Shops window with Cancel, and Sell is disabled while that ware is offered to that character (e2e covers both); M2 GM-only `shop.remove` (items stay in the library), golden log shops-removed, GM-overrides row; L4 the GM screenshot is a full 1366×768 viewport. Not changed (D232): shop edit (remove and re-import), affordability (checked on accept).
- Round 2: 0 High, 0 Medium, 4 Low; check 1,352 and MC.3/M6.A/MT.4 e2e green; both Mediums confirmed fixed, shop.remove refused for players, undo path sound. Lows to the QUALITY backlog: a ware whose item is missing is dropped without a hint; removing a shop leaves its open offers (cancel by hand); `saleOpen` matches by item, so an unrelated open GM trade of that item also disables Sell; a later status replaces the "Offered" one.

## 2026-10-26 · MC.4 Loading screen · sonnet (worktree; round 1 at cbcf55b1, round 2 at 1b0e7f5b)
- Round 1: 0 High, 2 Medium, 5 Low (logged by run a3970c1a): M1 a regeneration left the old banner up; M2 a failed or cancelled generation left it up.
- Fixes (48a22bcd, 1b0e7f5b): a regeneration ends the old screen; a failure or cancel ends its own. The first fix read the loading state through a stale closure (a failure ended nothing; the new e2e failed on 48a22bcd), so screens to end now go to a pending list settled by `settleEnding` once their banner is in the state (unit test). e2e for regenerate, failure and cancel.
- Round 2: 0 High, 0 Medium, 3 Low; check 1,355 and MC.4/MT.6/MC.2 e2e green; both Mediums confirmed fixed; no GM-only data to players. Fixed L1 (approving a generation sent without a screen cleared an earlier generation's screen) with an e2e. L2 (match by text, a rejected broadcast's entry lingers) and L3 (leaving the console mid-generation leaves the banner for the GM) to the QUALITY backlog. Box checked.

## 2026-10-26 · MC.5 Listening and transcript · round 1 · sonnet (run 5f0b27fe)
- Range 71dabc1b..244665e6 (wip/MC.5). Reviewer ran `npm run check` (1,382 pass), `npm run test:speech` (real engine, pass), MC.5 e2e 2/2, read the screenshots.
- 0 High / 6 Medium / 8 Low. Mediums: (1) a failed transcript write rejected the Listener queue for good (unhandled rejection) → fixed, write errors go to onError and the line still shows (unit test); (2) panel showed "Mic off" while the server listened after a reload/remount → fixed, poll turns a captureless server listen off and unmount posts off; (3) panel said "Mic on" after a 409 (campaign switch/restart) → fixed, message on 409 and the poll stops the mic when the server is off; (4) a stalled download hung forever → fixed, 60 s idle abort and a size cap (unit tests); (5) a load failure read as "download failed" → fixed, `loadFailed` with "Try loading it again" (unit test, no re-download); (6) the packaged native-addon path (electron-builder extraResources, `packagedSpeechLoad` in a real package) is not exercised by CI → **open**, next run.
- Lows (session number fixed at listen start, in-memory `heard` lost on restart and unbounded, unbounded transcription queue, no-audio check only scans the Listener dir, loose CPU bound, extract `next(err)`, Windows rename EPERM, ScriptProcessor/echo-cancel vs VAD threshold, player mark styled like a button) → QUALITY backlog candidates; the ci.yml cache comment was corrected.
- Fixes at 2b525d3a. Round 2 required (≥2 Mediums), not run: time ran out. Box stays unchecked.

## 2026-10-26 · MC.5 Listening and transcript · round 2 · sonnet (worktree, cf1d499d; run c10fb54d)
- Before round 2: review M6 fixed at cf1d499d: `apps/desktop/scripts/check-packaged-speech.ts` checks the unpacked package has `speech/node_modules/sherpa-onnx-node` and this platform's `sherpa-onnx.node`, that it resolves from inside `resources/speech`, and that `packagedSpeechLoad` returns a recognizer; runs in ci.yml desktop-smoke (Linux `--dir` package) and release.yml after packaging (linux and win). `packagedSpeechFiles` unit test.
- Round 2: 0 High, 0 Medium, 4 Low; check 1,387, MC.5 e2e 2/2, `npm run test:speech` pass; real Linux `--dir` package passes the check and fails it with the addon removed; all six round-1 fixes confirmed; transcript text reaches players by no path; no audio on disk.
- Fixed (b9d9a9c0): L1 a poll read before Start could stop the new mic (start counter; the poll ignores replies read before the latest Start); L3 transcript times showed UTC, now local. To the QUALITY backlog: L2 a second GM view (browser /gm beside the desktop) turns listening off within a poll; L4 a campaign switch leaves the old Listener's open segment unflushed until the next POST.
- Box checked.

## 2026-10-26 · QF.29 Shop ware names · QF.30 No loading screen without a key · sonnet (worktree, 4eecff5f; run c10fb54d)
- Found by sweep D (Rules · sonnet; UX · haiku), confirmed in code (commands.ts `use the id` branch; CoDmPanel sent the broadcast before the request).
- Fixes: a90022aa (QF.29, D237: a named ware resolves to the newest item of that name; the region half was not real, region names cannot repeat); 4eecff5f (QF.30: the panel checks `GET /api/gm/ai` on open and before every Generate; no key, no request and no loading screen; MC.4 e2e both ways).
- Review: 0 High, 0 Medium, 4 Low; check 1,357, MC.2/MC.3/MC.4 e2e 5/5; replay unaffected (events store item ids). Lows to the QUALITY backlog (stale "no key" message until the next Generate after saving a key; the pre-check ignores Cancel until it returns; settings label wording unchecked; negative e2e checks right after the message). Boxes checked.

## 2026-10-26 · QF.31 idle Listening panel stops polling (run dae5b6f4)
- Round 1 (sonnet, d3c743c2): 0 H / 2 M / 4 L. M1 poll rule only partly in the pure model (untested at panel level) → whole rule in `listenPollNeeded({on, model, loaded, capturing})` with tests. M2 last line lost on Stop → one read 1.5 s after Stop. L2 (endless 2 s retry before a first read) → backoff 2 s ×3 then 10 s. L1, L3, L4 to the backlog. Fixes in cba56487.
- Round 2 (sonnet, cba56487): 0 H / 0 M / 4 L (backlog). Box checked.

## 2026-10-26 · MC.6 Speaker labels, round 1 (run dae5b6f4; box not checked)
- Reviewer sonnet on 3cd5d281: 1 H / 4 M / 4 L. H: `npm run check` red (GM-GUIDE bolded placeholder labels) → fixed on wip/MC.6 at 5491d311. Open for next run: M2 single enrolment labels on threshold alone, no margin (prefer silence); M3 corrupt speakers.json read as empty, next enrol overwrites others; M4 enrol accepts silence/noise (no energy check); M5 enrol not blocked server-side while listening, and speaker options fixed at Listener start. Lows: stale name after rename, embedding-length mismatch silent, no Delete confirm, weak threshold assertion. Round 2 due after fixes.


## 2026-10-26 · MC.6 Speaker labels, round 1 fixes and round 2 (run 6c4032fc; box checked)
- Round 1 Mediums fixed at bd48e6c7 (D241): M2 single enrolment must clear threshold + margin; M3 damaged `speakers.json` is never overwritten (list/enrol/delete refuse with 500, listener only loses labels); M4 enrol needs ≥ 1.5 s at speech level; M5 enrol 409 while listening, Start disabled while recording, embedder looked up per segment. MC.6 e2e mic now plays the synthesized table-talk WAV.
- Reviewer sonnet round 2 on bd48e6c7: 0 H / 2 M / 4 L. M1 the single-voice bar (0.7) may be too strict on real voices → kept (prefer silence), Q78 added for Luke with the live path. M2 a steady hum above the RMS threshold passed → fixed (level swing ≥ 0.2; table-talk measures 0.54; unit + route tests). Lows to backlog: malformed single entries dropped silently on rewrite; listen-on not refused server-side during an enrol from a second window; Voices alert needs a page reload after moving the file; untested 1.5 s boundary. Verified fixes myself: check green (1,425 unit), e2e MC.5 + MC.6 3/3.

## 2026-10-26 · MC.7 Practice drafts, round 1 (run 6c4032fc; box not checked)
- Reviewer sonnet on 43753ddc (wip/MC.7): 0 H / 6 M / 6 L. Fixed on wip/MC.7: M3 a pending draft is not drafted again (0d4c4236); M6 a malformed item is dropped, the rest kept (0d4c4236, unit test); M2 re-rolling the same contest logs practice once (43c71d25). Open for next run: M1 a contest logs a stat, not a skill, so it does not suppress a skill draft (contradicts D243); M4 drafts carry no session (confirming in a later session credits the wrong one); M5 drafts sit in their own window, not in the end-of-session review queue. Lows: a player naming a character counts as gm-named; short names ("Will") match ordinary speech; Confirm can double-log if the draft delete fails; e2e fake keyed on one phrase. Round 2 due after fixes.

## 2026-10-26 · MC.7 Practice drafts, round 2 (run 0143b463; box checked)
- Round-1 open Mediums fixed by a fork (43c71d25..d8c98418, D245): M1 a stat-only app action covers its character's moment (±2 min); M4 drafts carry their session and Confirm logs against it (optional GM-only `session` on practice.log); M5 drafts listed in the Practice review queue.
- Reviewer sonnet on d8c98418 (worktree): 0 H / 1 M / 5 L; check 1,450 unit, MC.7 + M5.5 + M7.3 e2e 3/3. M1 Draft found nothing after End session (read transcript 0): fixed, Draft reads the most recent session when none runs (D246, unit test fails without the fix; MC.7 e2e passes). Lows to QUALITY backlog: null-session `logged` filter, Confirm double-log if drop fails, contest dedupe keyed on last pair only, ±2-min window suppresses silently, MC.7 two screenshots byte-identical.

## 2026-10-26 · MC.8 Suggestions panel, round 1 (run 0143b463)
- wip/MC.8 merged wip/MC.7 (5345c493; DECISIONS and GM-GUIDE conflicts kept both), screenshots re-rendered (767a05ff). Reviewer sonnet on 767a05ff (worktree): 0 H / 2 M / 3 L; check 1,462 unit, MC.8 + MC.2 e2e 2/2. M1 a reply it could not read re-billed on every 15 s poll (lastCallAt set only on success): fixed, the pace counts from the call (37b37f55; test 872ec9f8 fails without it). M2 a chip dismissed during an in-flight call came back (stale read-modify-write): fixed, re-read after the call (37b37f55; test a3aefe71 fails without it). Lows to the QUALITY backlog. Round 2 due (two Mediums).

## 2026-10-26 · MC.8 Suggestions panel, round 2 (run 0143b463; box checked)
- Reviewer sonnet on a3aefe71 (worktree): 0 H / 0 M / 4 L (a failed call also holds a manual retry for 60 s; a crash after the pre-call write; M1 test asserts not-200 rather than 502; M2 test polls a flag). Both round-1 fixes verified; route tests 5/5, eslint clean.

## 2026-10-26 · MC.9 Session notes and summary, round 1 (run 26bb7f86)
- wip/MC.9 merged main (28898909; server.ts registers both MC.8 suggestion and MC.9 notes routes; D247 before D248). Reviewer sonnet on 28898909 (worktree): 0 H / 3 M / 4 L; check 1,472 unit, MC.9 e2e pass.
- M1 re-summarising left the export stale (log key ignored summary content) → key is a hash of the notes file; M2 an empty or bad reply advanced `readUpTo` and lost lines → advances only when a note returns; M3 a hand-edited summary threw in `sessionReport` and stopped the session log → zod check on read plus a guard around `renderNotes`. Also L4 one-line model text, L6 catch-up notes saved before summarising, L7 `Jake: …`. All with failing-first tests (263556e2, D250).

## 2026-10-26 · MC.9 Session notes and summary, round 2 (run 26bb7f86; box checked)
- Reviewer sonnet on 263556e2 (worktree): 0 H / 0 M / 5 L (unbounded re-send of unread lines per click; summary ignores unread lines silently; `safeNotes` silent; misplaced comment; empty strings pass). Lows to QUALITY Backlog. Merged to main.

## 2026-10-26 · MC.10 Prepare ahead, round 1 (run 26bb7f86)
- Built by a fork on wip/MC.10 (9624ab78, D249). Reviewer sonnet on 9624ab78 (worktree): 0 H / 5 M / 5 L; check 1,482 unit, MC.10 e2e pass.
- Fixed on wip/MC.10 (694f086d, D251): M1 Review deleted the draft before approval → it stays until Dismiss (and Dismiss from the panel had never worked: content-type with no body; fixed); M3 a failed look consumed its lines → read only after the fast reply parses; M4 stale view after a campaign switch → every tick reloads; M5 tests for the 409 guard and a failed look. M2 (looks run only while the GM console is open) kept by decision D251, with no automatic-tick test yet. Round 2 due (5 Mediums): next run.

## 2026-10-26 · MC.10 Prepare ahead, round 2 (run 26bb7f86; box checked)
- Reviewer sonnet on 694f086d (worktree): 0 H / 2 M / 3 L; check 1,486 unit, MC.10 e2e pass. D251 (looks driven by the open GM console) judged acceptable.
- M1 the M3 fix could re-pay for the same unreadable stretch every interval → after 2 unreadable replies in a row the lines count as read (`MAX_FAILED_LOOKS`); M2 approved-but-undismissed drafts filled the 3-draft queue and stopped preparing → Review marks a draft `taken`, taken drafts leave the queue. Both with assertions that fail on the old code (2fdb376b, D252). Verified by me (no round 3 per LOOP §6.4): check 1,486 unit, e2e MC.8/MC.9/MC.10 pass. Merged to main.

## 2026-10-26 · QF.32 forced-kill desktop test waits for Electron's helpers (run 200c63df; box checked)
- Round 1, sonnet on fa43e9f9 (worktree): 0 H / 2 M / 4 L. M1 helpers forked between the snapshot and the kill escaped → freeze the tree first (SIGSTOP, re-walk until stable), then SIGKILL all; M2 the wait covered only known pids → `holders(userData)` asserts nothing holds the profile open (4de16d52, D255).
- Round 2, sonnet on 4de16d52: 0 H / 0 M / 3 L (to QUALITY Backlog). Desktop smoke 7/7, polite-close ×8 green. CI green on 4de16d52.

## 2026-10-26 · MC.A Co-DM acceptance and review (run 200c63df; box checked)
- Round 1, fable on 12bb5da1 (wip/MC.A with main merged): 0 H / 2 M / 7 L; check 1,486 unit, MC.* e2e 15/15; no path for co-DM data to players found; GM-GUIDE matches the code.
- M1 spend counter was a stale snapshot → `useLiveSpend` rereads every 20 s while a key is saved (D253), unit test, MC.A e2e asserts it catches up without a button; M2 fixture audio drives a scripted stand-in engine → documented (D254) and a speech step added to the live checklist. Lows fixed: fast-model label, summary-timing note. Other Lows to Backlog.
- Round 2, fable on 540d4e95: 0 H / 0 M / 2 L (to Backlog). check 1,489 unit, MC.* 15/15.
- Full e2e on 12bb5da1: 122 + latency 8 passed.

## 2026-10-30 · MD.1 The fixed five · round 1 · sonnet (worktree, 4c628878)
- 0 High / 3 Medium / 6 Low. M1 an answer stuck in "writing…" when a later request failed or a stream ended early; M2 a cut-off paid stream not counted in the spend counter; M3 no abort/disconnect tests.
- Fixed (6fefab89): `endQuick` on every early end; `AiError.partial` usage recorded by `counted`; tests for client disconnect aborting the upstream call, the partial count, and endQuick. Lows fixed: Richer keeps the answer's NPC (L5), transcript lines underlined as clickable (L4), settings screenshot shows the form top (L9). Others to the QUALITY Backlog.

## 2026-10-30 · MD.1 · round 2 · sonnet (worktree, 6fefab89)
- 0 High / 0 Medium / 3 Low: M1–M3 and L5 verified fixed. Lows: a generic "newer request" note on any non-OK reply; a final NDJSON line without a newline is dropped (shows "cut off"); unrelated screenshot churn in the fix commit (reverted before push). One `npm run check` run in the reviewer's worktree hit a 120 s timeout in an unnamed heavy test; the re-run was clean (noted as a possible flake).

## 2026-10-30 · MD.2 · round 1 · sonnet (worktree, 34d21b05)
- 0 High / 2 Medium / 5 Low. M1: a failed call on a question line was retried every 30 s for as long as the line stayed unread → fixed: a question cuts the wait short once (`questionsUpTo`, D259), with a test. M2: keyless 5 s polls read the transcript and got a 409 each time → fixed: a keyless poll is a 200 `needsKey` before any read; only "Suggest now" gets the 409 message (test). Lows to QUALITY Backlog.

## 2026-10-30 · MD.2 · round 2 · sonnet (worktree, f6b39e71)
- 0 High / 0 Medium / 3 Low: M1 and M2 verified fixed. Lows (test gaps for a second question after a failure and old files; a hand-edited `questionsUpTo`; a narrow dismissal race in the pre-call write) to QUALITY Backlog.

## 2026-10-30 · CI fix (MD.2 fallout) · bff5db12
- Red CI on 1d2ee26a: M8.3 empty-slot contrast 3.62:1 (opacity removed; dashed border marks the slot), MC.A clicked a removed "Use" button (now clicks the chip, as MC.8), MC.10 did not count the question look (D258; test waits for it). All three failed alone too: real, not flakes. Verified with 1 and 2 workers.

## 2026-10-30 · MD.3 · round 1 · sonnet (worktree, c8bcf91b)
- 0 High / 3 Medium / 5 Low. No leak path (lore is a `gm` note; `player.ts` drops them, View as included; export needs an `export` tag).
- M1 an over-long newest note ended `loreLines` and dropped all lore → fixed (skip, keep going; test). M2 NPC lore matched by substring ("Al" in "also") → fixed (Unicode whole-word; test with "Al" and "Zoë"). Both on `wip/MD.3` d51bce51.
- M3 the Lore view edits only the body: no delete, no title or tag edit → **open**, next run. Round 2 due (3 Mediums).
- Lows: e2e has no NPC/place tags and no Keep → later prompt; KeepGenerated hides on unexpected shapes and lets an item be tagged as NPC; Lore view has no filter and sits collapsed at the bottom; one shared status line; place/session taken from the polled scene can be stale.

## 2026-10-30 · Quality sweep A · fixes
- None applied this run; confirmed Mediums queued as QF.33–QF.35.
- M3 fixed (e3668fc5): the Lore view edits title, NPC and place (`retagLore` replaces only the npc:/place: tags, keeps lore/session/other tags) and deletes after a confirm; unit tests and e2e extended.

## 2026-10-30 · MD.3 · round 2 · sonnet (worktree, e3668fc5)
- 0 High / 0 Medium / 3 Low. M2, M3 verified fixed (M1 taken from its d51bce51 tests); check 1,544 unit and MD.3 e2e green in the reviewer's worktree. Lows (Edit on a second note drops the first draft; status line not cleared on Cancel; blank title saves as "Lore" silently) to QUALITY Backlog. MD.3 checked.

## 2026-10-30 · QF.33, QF.34 · round 1 · sonnet (worktree, 8842d54f)
- 0 High / 1 Medium / 3 Low. M1 the new QF.33 route test relied on the previous test's leftover draft and failed under shuffle → fixed (ccb276cc on main as 6f6dd767): its own describe, campaign and server; session 1 drafts, ends, session 2 drafts the same use, a repeat in session 2 is blocked; fails with the session filter removed; passes shuffled (seeds 1, 3, 5; seed 2 fails only the older MC.7 test, Backlog). Verified myself (one Medium: no round 2). Lows to Backlog. QF.33, QF.34 checked.

## 2026-10-30 · QF.35 · round 1 · sonnet (worktree, 7d9e28ce)
- 0 High / 0 Medium / 4 Low. All three mutations applied by the reviewer and caught; both files pass alone and shuffled (3 seeds); `useLiveSpend` behaviour unchanged. Lows to Backlog. QF.35 checked.

## 2026-10-30 · MD.A (milestone MD: MD.1–MD.3, QF.33–QF.35, MD.A) · round 1 · fable (worktree, 2f9c5246)
- 0 High / 1 Medium / 5 Low. `npm run check` green (1,549), MD.1/2/3/A e2e green; 4 mutations (slot stability, lore in prompt, question-triggered refresh, typing guard) all caught; no GM-only data path found. M1 keys 1–0 stayed live while the GM pane was hidden (View as) → fixed b29da91a (`paneShown` guard on both rows; unit test; MD.A e2e step, caught by mutation). Low "MD.A shot does not show slots 6–0" fixed (new `gm-picks-6-0` screenshot). Other Lows to Backlog. Verified myself (one Medium: no round 2). Full e2e 126/126 at 2 workers; latency 7/8 under reviewer load, M11.3 passed alone (Flakes). MD.A checked.

## 2026-10-30 · MU.1 Home dashboard and tabs · sonnet (2 rounds)
- Round 1 (b632a8a1): no High; Medium: banners chip hash link worked once; Session lacked party at a glance / quick vs full Award XP identical; §9a windows elsewhere without a decision; Needs you missed co-DM drafts. Lows: aria-controls targets missing, focus lost after a Needs-you link, home QR below the fold, M8.3 tab switching by mouse, practice capture on Progression.
- Fixes (5a9e0433): chip is a button opening Broadcast each time (MT.6 checks twice); openWindow moves focus to the window; aria-controls only on the open tab; Needs you counts co-DM drafts; D265 records the §9a placements, Q84 asks about separate quick/full XP forms; GM-GUIDE updated.
- Round 2 (5a9e0433): no High; Medium: draft count stale after generating/discarding drafts → fixed: Home re-counts each time it opens. Lows (static tabIndex, rAF focus timing) left to the backlog.
- Also this run: e2e migrations fixed (MS.1, MS.4, MR.3, QF.17, M7.3, M7.A, M2.A, MS.3, MS.A; M8.3 walks every tab); quick-response buttons stay one row of five in a tab panel.

### 2026-10-30 · MU.2 Player running log; View as matches the player · sonnet, 2 rounds
- Round 1 (e1041e83): 0 High, 2 Medium, 6 Low. Medium: the phone's Log sat several screens below the status window; one XP award queued a "+N class XP" toast plus level DINGs, and +N was the gross share even when XP overflowed or was lost. Fixed (fa2a00fe, D267): Log ordered right under the status window on phones; the XP line only when no track levels, naming each track's actual gain. Lows fixed: override notice includes race level and is skipped with no diffs. Lows left: silent library edits (D266, by design), audit test asserts non-empty rather than kind, quest edits notify everyone, no undo/mute e2e (verified in code by the reviewer).
- Round 2 (fa2a00fe): 0 High, 0 Medium, 2 Low (the other track's gain is silent when one track levels, per D267; no tests for profession-only level or partial overflow).
- Builder fixes before review: lint (fallthrough in `notificationText`), "Full history" opens Notifications on "Everything", title rename tells only holders linked before and after, three older unit tests updated for the new notices.

### 2026-10-30 · MU.3 XP context in the award box · sonnet, 2 rounds
- Round 1 (c23fc057): 0 High, 2 Medium, 6 Low. Medium: the row formatting branches (profession, capped, uneven shares) were untested; "≈ levels" vanished silently when the preview errored. Lows: "0/100 XP, at the grade's top" on a capped row, busy row text, "0 levels" for a tiny share, unused `raceLevel`, long reference line, a cast in a test helper.
- Fixes (ea62d6f4): row text and level wording in `xpAwardModel.ts` with unit tests (profession, capped without a fraction, thousands, rounding); "under 0.1 levels"; a cue when a blocked preview hides the levels; e2e covers uneven shares by hand.
- Round 2 (ea62d6f4): 0 High, 0 Medium, 5 Low. Fixed (79cbf646): the cue now also shows for share errors and no longer says "above". Left: the cue is untested; "≈ under 0.1 levels" reads oddly; no 0.05 boundary case.

### 2026-10-30 · QF.36 MU.2 notice tests that can fail (sweep B High) · sonnet, 1 round
- Round 1 (eb968367): 0 High, 0 Medium, 3 Low. All three mutations (hidden-quest guard, `gained >= 0`, no-op statsSet) now fail a test; M5.3 and MU.2 green. Lows (to Backlog via the sweep entry): free-points wording unpinned; poolsSet/progression no-op guards untested; `expectToast`'s queued count is set by hand.

### 2026-10-30 · MU.4 Spells: skills with costs · sonnet, round 1 (fixes pending)
- Round 1 (ebe1d236, wip/MU.4): 0 High, 2 Medium, 5 Low. Medium: (1) a copy the GM hand-edited still shows the library's casting cost (text freezes on edited copies, casting does not); (2) upgrading a spell to a rarity with no library entry drops its cost from the owner's sheet with no warning or test. Lows: "No cost" with an amount typed blocks save; content-pack pools not checked at parse time; stale line numbers in GM-OVERRIDES; "Spell" tag case/order rewritten on edit; the 1,000,000 literal repeated in `skillLibraryModel.ts`. Next run fixes the Mediums; round 2 is due (two Mediums).
- Fixes (6015d687, 2026-10-30 22:10 run): Medium 1 resolved by D270 (casting follows the entry like effects; a hand edit freezes text only) with a test; Medium 2 fixed: `castingForSkill` lends the nearest lower rarity's casting when the copy's rarity has no entry, tested (nearest wins; an entry with no cost means none). Literal 1,000,000 replaced by `MAX_SKILL_COST`. Q85 added.
- Round 2 (sonnet, 6015d687): 0 High, 0 Medium, 4 Low (effects do not take the same lower-rarity fallback; a cost without the Spell box leaves no "spell" tag chip; library list shows the full pool name; a removed pool shows its raw id). Lows to the QUALITY backlog. Box checked.

### 2026-10-30 · QF.37 Quick-response buttons show their names · sonnet, 2 rounds
- Round 1 (764a0716): 0 High, 2 Medium, 4 Low. Mediums: container-unit font had no floor (~12 px names, ~10 px keys, smaller in narrower panels); e2e checked one viewport and no size. Fixed (7f6e0f34): names `max(12px, …)`, keys `max(11px, 0.8em)`, duplicate `.quick-row` merged, e2e at both viewports with size assertions.
- Round 2 (7f6e0f34): 0 High, 0 Medium, 3 Low (floor path untested under ~355 px, where "character" could spill; 1920 shot near-duplicate; custom labels unchecked). Lows to Backlog. Box checked.

### 2026-10-30 · MU.5 Cast from the player's phone · sonnet, round 1 (fixes pending)
- Round 1 (e8ab6cba, wip/MU.5): 0 High, 2 Medium, 7 Low. Medium: (1) no projection-canary case for casts; (2) e2e does not check the cast's practice entry in the GM's review or its removal on undo. Lows: duplicate too-low message; Cast button not dimmed when too low; refusal names a removed pool's raw id; change-log row lacks cost; feed screenshot cut off; `source: 'gm'` for any non-player actor; two phones race (server re-checks). Next run fixes the Mediums; round 2 is due.
- Fixes (1a026352): Medium 1 — `projection.test.ts` canary case: a player's cast reaches only the caster (spell, cost, cooldown, range, notes), nobody gets an unowned library spell; Medium 2 — e2e checks the practice review lists both casts unreviewed ("To review (2)") and undo takes one out ("To review (1)"). Low: Cast dimmed when too low.
- Round 2 (sonnet, 1a026352): 0 High, 0 Medium, 4 Low. Fixed: feed screenshot now shows the feed (plus a practice-review shot); after a refusal only the server's line shows, not two; the Cast button's description carries the refusal (kept pressable on purpose, so no `aria-disabled`, which would also block the click). Left: toast partly under the dialog at 390×844 (Backlog).

### 2026-10-30 · MU.6 Primal Hunter reference lists · sonnet, 2 rounds
- Round 1 (a0b737a4): 0 High, 2 Medium, 4 Low. Medium: (1) the co-DM sample's god filter scanned only name and summary with a thin word list ("Orrery of the Godless One", "Altar of the Damned", a "Chosen-level guest" could reach prompts); (2) the e2e player canary connected only after the searches, and one assertion was vacuous. Lows: ASCII-only search words and two-tier ranking; lenient CSV reader; near-duplicate names in a sample; stale results beside an error, empty list menu before the first reply, no paging, cluttered grade notes.
- Fixes (445f9f16): `GOD_WORDS` widened (godless, Chosen, heretic, bless…, cult…, sacrifice…, altar, worship…) and applied to the whole prompt line; a unit test samples 200 requests per kind over the real lists and checks every row seen (>150) against it, naming the three rows above; names de-duplicated per sample; the e2e connects the player before any search and requires frames; a failed search clears old results.
- Round 2 (sonnet, 445f9f16): 0 High, 0 Medium, 2 Low (the wider word list also drops some harmless rows, e.g. "Blessed …"; the e2e names only two strings). Not fixed: both by design.

### 2026-10-31 · MU.A Acceptance and review · fable, 2 rounds
- Round 1 (9b41c3b9, milestone 6511b291..9b41c3b9): 0 High, 2 Medium, 6 Low. Medium: (1) the local full run ended red on M11.3 latency (2,158 ms vs 2,000); (2) `quest.edited` notified every player when only GM-only fields (stability rules, notice recipients) changed. Lows to the QUALITY backlog.
- Fixes (6af64924): Medium 2 — `questFace` in `history/gmChanges.ts` skips `questUpdated` when nothing player-visible changed, with a unit test (D273). Medium 1 — not an MU regression: the pre-MU commit flips 1,956 / 2,048 ms on this box, HEAD quiet runs 1,825 / 1,847 ms; logged under Flakes.
- Round 2 (fable, 6af64924): 0 High, 0 Medium, 1 Low (pre-existing: hiding a quest is silent). Box checked.

### 2026-10-31 · QF.38 Listening follows the session · sonnet, 1 round
- Round 1 (3e6e7937): 0 High, 1 Medium, 3 Low. Medium: talk after End session (with the mic still on) went to `session-00`, where Draft from transcript and the summary (which read the session that just ended) never see it; contradicted the guide and D275.
- Fixes: `transcriptSession` (running session, else the last one, else 0) feeds the listener; the route test now talks after End session and finds the line in `session-01`; guide and D275 updated. Lows: test gap (closed by the same test), a boundary-spanning utterance is filed by when it ends (documented in D275), guide wording (fixed). No round 2 (one Medium); fixes verified: the test fails with the old getter.

### 2026-10-31 · QF.39 Identify can never be merged away · sonnet, 1 round
- Round 1 (469c331a): 0 High, 1 Medium, 3 Low. Medium: an override merge with Identify first gave the merged skill kind race, so a restored Identify sat beside a second race skill.
- Fixes: the merged skill takes the non-race side's kind (never race), with an engine test that the restored Identify is the only race skill; Low 2: the Merges window's override preview passes retired names like the reducer. Low 3 (a pre-QF.39 offer to a retired name would refuse on replay; none known) and Low 4 (race by kind vs restore by name, consistent once Medium fixed) recorded in D276. No round 2; `npm run check` 1,672 green; MT.2, MT.7, M5.4, MC.5 e2e green.

### 2026-10-31 · QF.40 A non-latest undo never silently loses XP · sonnet, 1 round
- Round 1 (2462ba8b): 0 High, 0 Medium, 4 Low: two extra folds per non-latest undo with later awards (O(n), undos rare); `undoError` parses the engine message with a regex; Confirm stays enabled when the preview says the undo is refused (the server still refuses); dry-run id naming. No fixes needed; Lows noted for QF.62/QF.63. Box checked.

## 2026-10-31 · QF.41 A crash-left LOCK never blocks the app
- Round 1 (sonnet, worktree, 54a7a241): High 1: the recorded start used `Date.now() - process.uptime()`, which stops during sleep, so a live holder could look stale (two writers); fixed: the holder records its start with the same OS probe a later start uses. Medium: DST local-time parse (fixed by the same-source read); Windows PowerShell sync call at launch (accepted, once per launch, D278); same-pid text identity (not a defect). Low: pre-QF.41 locks keep the old rule (by design).
- Round 2 (sonnet, worktree, f8fca948): High fixed; 0 High, 0 Medium. Low 1 (a failed probe cached the uptime estimate) fixed: never cached, and the LOCK is then written without `started`. Lows 2 (Linux clock steps move `lstart`; not a target platform) and 3 (no fallback-path test, cache not resettable) accepted.

## 2026-10-31 · QF.42 A campaign that can't load says what to do
- Round 1 (sonnet, worktree, 3ff66c13): 0 High, 3 Medium: a deliberate fresh start was refused with no way out (TROUBLESHOOTING: move `backups/` aside); the empty-log guard used byte length so a torn-only log opened blank (now counts parsed events); migration, lost-writes and other load errors were still raw (shared `cannotLoad` format; a failed migration closes the store). Lows: message names the newest backup with events (fixed); "newer version" matched by text (accepted); refusal test now checks the folder listing is unchanged, plus torn-only, staging-folder and empty-backup tests.
- Round 2 (sonnet, worktree, 3505c0c9): 0 High, 0 Medium. Low 1 (failed migration rewrites the snapshot on close, so "Nothing was changed" overclaimed) fixed: "The event log was not changed."; Low 3 (backup lookup could throw while building the message) fixed with a fallback. Lows 2 (backup "has events" is size > 0) and 4 (regex case) accepted.

## 2026-10-31 · QF.43 Backups always happen, and hold everything
- Round 1 (sonnet, worktree, 2e404505): 0 High, 2 Medium: an uncopyable `codm/` or `transcripts/` folder aborted the whole backup (now left out of that backup only, tested with an EBUSY copy); no test that warnings name `server.log` (session-end test now asserts the path and the logged error). Lows: failed rotation stopped logging (fixed); rotation race between two servers, synthetic back-off test, symlinks copied as links, exports unchanged (accepted, D280).
- Round 2 (sonnet, worktree, 3e6679af): 0 High, 0 Medium. Lows accepted: server.log before the data folder exists (the store creates it first), back-off cap of ~102k events (slow start only), backup failure logged twice.

## 2026-10-31 · QF.44 Back up, download and restore from the console
- Round 1 (sonnet, worktree, 0f008a63): 0 High, 4 Medium: the header switch did not re-read after opening a restored campaign with the same name (now a `the-system:campaign-changed` window event); the Restore list shows only the open campaign's backups (hint in the window and the guide); a downloaded file lacks co-DM notes and transcripts (said in the window and the guide); no client size check (256 MB, same constant as the server, unit-pinned). Lows accepted: torn last line counted in the list (restore still refuses it clearly), leftover `.import-*` on a failed copy (invisible, retried away), restoring while the demo is open (legal), backups restorable only from the open campaign. Also fixed: `demo.test.ts` updated for the `main` flag and `{ id }` switching (an unknown id is 404).
- Round 2 (sonnet, worktree, c1da9979): 0 High, 0 Medium. Lows accepted: body-limit margin over the raw file size; the "backups of X" hint hides when the list is empty (the guide covers it).

## 2026-10-31 · QF.45 Installing a new build over a running app quits it cleanly (wip, not checked)
- Round 1 (sonnet, worktree, 416518b1): High 1: the CLI-inspect fuse would break Playwright's packaged smoke tests (fixed: that fuse stays on). Medium: speech engine inside packaged Electron not done (open); uninstall check did not wait for the exe to go (fixed); the custom macro dropped the Retry/Cancel box for an unstoppable app (fixed). Lows noted (old version waits 8 s then falls back; per-user single-instance lock; workflow cleanup). Round 2 due next run on wip/QF.45 263c26df.

## 2026-10-31 · QF.64 (High) Merges stored before QF.39 still replay
- Found by sweep C (Rules, haiku); confirmed in code and by a failing replay test. Fix 74569e7e: v2 payloads, v1 upcast to `legacy` (D283).
- Round 1 (sonnet, worktree, 74569e7e): 0 High, 0 Medium; reverting the reducer or the accept's `legacy` fails tests. Lows accepted: retired-name skip tested at `mergeSkills` level only; `skill.merged` never checked retired names (legacy there means the race check only).
- Round 2 (sonnet, worktree, 263c26df): 0 High, 1 Medium: the custom macro dropped electron-builder's OK/Cancel "app is running" question (fixed: asked unless auto-update; silent answers OK). Lows: the ~8 s wait was really 16 × (0.5 s + a process query) (fixed: `GetTickCount` deadline); first upgrade from a pre-QF.45 build still force-stops (documented in D282); tasklist fallback / other install paths (accepted, same as stock). Round-1 open Medium (speech engine inside packaged Electron) done: packaged smoke asserts it through a test-only hook; passed locally on a fresh `--linux dir` package with fuses applied. Verified by the builder (2-round cap): `npm run check` green, packaged smoke green.

## 2026-10-31 · QF.65 Restore and stale-lock tests that can fail
- Found by sweep C (Tests, sonnet); both mutations re-run and confirmed surviving. Fix 03f87c06 (tests only).
- Round 1 (sonnet, worktree, 03f87c06): 0 High, 0 Medium, 0 Low; each mutation now fails exactly the new test; both files pass shuffled 3×.


### 2026-10-31 · QF.66 Opening a restored campaign tells players, in local time
- Round 1 (sonnet, e75d112a): 0 High, 3 Medium, 4 Low. M1 the notice said "another copy" on switch back too → worded by direction (`campaignSwitch.ts`: earlier copy from a backup / switched back / demo / other), e2e asserts both. M2 notice unstyled → `.system-banner` with [System] mark and 44 px OK. M3 wording lacked "earlier" and the history point → fixed; the wait reason names the open campaign. Lows: D284 judged a reasonable reading (kept); GM guide now mentions the notice; no LiveClient unit test (e2e covers switch and rejoin; noted).
- Round 2 (sonnet, 0c2e32cb): 0 High, 0 Medium, 2 Low (home campaign is the page's first hello, so a reload while a copy is open words a later return as "another campaign"; a fresh load straight into a copy without the character shows the bare "No such character"). Both to the QUALITY Backlog.
- Also: MS.4 and MS.A e2e texts updated for the new wait reason (MS.4 was red on the wip before the fix).

### 2026-10-31 · QF.46 Forms reset after use, and say who it went to
- Round 1 (sonnet, c57aeac1): 0 High, 2 Medium, 2 Low. M1 clearing incomplete (Import file, Encounter pools and clocks, New character class/race) and no e2e for Import/Encounter → form- or window-level `onChange` clears the line in New character, System broadcast, Award XP, Encounter and Import content; second e2e test covers each. M2 award line not cleared on amount/track/reason → same form-level handler, e2e asserts it. Low: by-hand shares now shown in the line; When/day kept after scheduling (deliberate, M4.7 queues several days).
- Round 2 (sonnet, f393685c): 0 High, 0 Medium, 4 Low (to the QUALITY Backlog).
