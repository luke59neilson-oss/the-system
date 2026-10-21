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
