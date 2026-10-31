# Independent verification (verify-fable) of persistence / desktop / security findings

Worktree `/home/claude/review/persistence` (origin/main f656f8c2). Nothing committed. My own probes (kept):

- `/home/claude/review/persistence/apps/server/test/zz-verify-fable-store.test.ts` (persistence-1, -3, -10; real `defaultIsAlive`, no injected `isAlive`)
- `/home/claude/review/persistence/apps/server/test/zz-verify-fable-load.test.ts` (persistence-4, including what the desktop's `startErrorMessage` shows)
- `/home/claude/review/persistence/apps/server/test/zz-verify-fable-security.test.ts` (security-1, security-3)
- `/home/claude/review/persistence/apps/desktop/test/zz-verify-fable.spec.ts` (desktop-5, real Electron 45 under xvfb)

Run: `npx vitest run apps/server/test/zz-verify-fable-*.test.ts --reporter=verbose`; `CI=1 xvfb-run -a npx playwright test -c apps/desktop/playwright.config.ts apps/desktop/test/zz-verify-fable.spec.ts` (after `npm run build && npm run build -w @the-system/desktop`). All pass, i.e. every assertion below that says "observed" was observed.

Summary: 10 of 10 confirmed in mechanism. Two have parts I could not run (Windows): desktop-1 is confirmed from the shipped template text; desktop-3's 1000 ms cold-start part is not reproduced here (62 ms warm). Severity adjustments: none upward; desktop-3 is a CI-reliability Medium, not a user-facing one.

---

## persistence-1 / desktop-2 · CONFIRMED · Medium (agree)

**Evidence (observed, real `defaultIsAlive`):**
- Lock left with the relaunched process's own pid, same boot minute, same machine id: `CampaignStore.open` throws `The campaign is already open (process 14695)` (14695 = `process.pid` of the test). Message contains neither `LOCK` nor `delete`.
- Lock with `pid: process.ppid` (alive, unrelated): `The campaign is already open (process 14677)`.
- Lock with `pid: 1`: refused as alive (root here; for a non-root user `kill(1,0)` gives EPERM and `store.ts:259` returns true on EPERM, so same outcome).
- Lock with `boot: bootMinute() - 2`: opens. The boot minute is the only thing that saves a stale lock today.
- Code: `store.ts:322-325` has no `info.pid === process.pid` check and no start-time/identity comparison; `app.ts:97-99` opens `main` before anything else, so the StoreError propagates out of `startApp`; `main.ts:261-270` shows `startErrorMessage(...)` (`launch.ts:118`: `The System could not start: <raw>`) and calls `app.exit(1)`. The foreign-machine branch (`store.ts:318-320`) does carry a delete hint; this one does not.
- Windows parts (not run; by source + platform facts): `os.uptime()` is libuv `uv_uptime` = `GetTickCount64()/1000` on win32, and GetTickCount64 includes sleep/hibernate time, so a Fast Startup "shut down" (a kernel hibernate) does not move `Date.now() - uptime*1000`: the boot minute survives while every user process was ended. I am confident of the mechanism; I did not measure it. PID reuse after the installer kill (desktop-1) or a Task Manager kill is the realistic trigger; a cold boot (BSOD, battery) moves the boot minute and is fine.
- Note on the reviewer's remark that the desktop's single-instance lock makes the liveness check redundant: true for a second desktop instance (same userData → same data dir), not for a CLI/dev server pointed at the same data dir. A fix should keep the check but make it identity-based.

**Severity:** Medium agreed. Low probability per incident, but the outcome is "the app will not open and nothing says why" on game night, repeating on every launch while the reused pid lives.

**Acceptance check:**
1. `apps/server/test/store.test.ts`: with no `isAlive` injected, a LOCK `{pid: process.pid, machine: <same>, boot: bootMinute()}` is treated as stale and `open` succeeds.
2. The lock records a holder identity beyond pid (e.g. process start time, or a per-launch token the desktop keeps) and a LOCK with `pid: process.ppid`, same boot, but a different identity opens too. If the project chooses to keep refusing in that case, the thrown message must contain the full LOCK path and the word "delete".
3. `startErrorMessage(new StoreError('The campaign is already open (process 7)'), 30333)` output contains the LOCK path to delete, and `docs/TROUBLESHOOTING.md` gains an "already open" entry naming `LOCK`.

## persistence-2 · CONFIRMED · Medium (agree, with a note)

**Evidence (code and docs):**
- `grep -rn "api/gm/export\|importCampaign" apps/web/src` → nothing. `apps/server/src/server.ts:432` serves `GET /api/gm/export` behind the `x-gm-key` header (unreachable from an address bar); `importCampaign` (`store.ts:642`) has no caller outside tests. The only "backup" UI text is the session-end toast (`SessionPanel.tsx:59`). `CampaignSwitch.tsx` (the header) only switches demo/main, so GM-GUIDE:32 "campaigns and backups sit in the header" is also wrong.
- `docs/GM-GUIDE.md:327-328`: "A campaign export (the GM's export file) carries the event log and the portraits, and importing it brings both back." No such file or import exists for the GM.
- The live-copy hazard (restoring or copying while the app is running) I did not reproduce; by code it is plausible (`close()` writes a snapshot of in-memory state ahead of a restored log → next open refuses with the lost-writes message). Minor beside the main point.

**Severity:** Medium agreed, because the GM guide promises a restore path that does not exist; the practical fix can be docs-only, which makes the build work small.

**Acceptance check:** either (a) the GM console has a visible "Download campaign" control (fetches `/api/gm/export` with the key, saves `.json`) and an "Import campaign" control backed by a new `POST /api/gm/import` that calls `importCampaign` under a new id and never overwrites, with an e2e test export → import → event count and portraits equal; or (b) `grep -c "importing it brings both back" docs/GM-GUIDE.md` is 0, GM-GUIDE:32 no longer says backups sit in the header, and the "Backups and moving laptops" section says to quit The System before copying and that restore = copy files from `backups/` into the campaign folder with the app quit.

## persistence-3 · CONFIRMED · Medium (agree)

**Evidence (observed):**
- `snapshot.json` replaced by a directory (stand-in for a rename refused by an open handle): `store.backup('session-1-end')` throws `EISDIR: illegal operation on a directory, rename '.../snapshot.json.tmp-…'`; `backups/` stays `[]`; `events.jsonl` is intact (1 line). Code: `store.ts:533` calls `writeSnapshot()` with no try/catch before any copying.
- Append path with `snapshotEvery: 2` and a persistently failing snapshot: 6 appends → 6 `writeSnapshot` attempts (healthy would be 3), because `store.ts:521` resets `sinceSnapshot` only on success. Each attempt serialises the whole state and fsyncs a temp file.
- Callers: `app.ts:174-184` (quit backup) swallows the error into `console.error`, so no copy and no visible message; `server.ts:161-166` (session end) reports "the backup could not be saved. See the server log" (there is no server log in the desktop, cf. persistence-5).
- The Windows trigger (EPERM/EBUSY on rename over an open `snapshot.json`) is not reproduced here; graceful-fs exists for exactly this, so it is a real-world failure mode, frequency unknown.

**Severity:** Medium agreed: when the snapshot is stuck, every session-end and quit backup fails silently or with an unfollowable message, and every append pays a full-state serialise + fsync.

**Acceptance check:** unit tests: (1) with `writeSnapshot` failing (directory in place, or a stub that throws), `backup('x')` returns a folder containing `events.jsonl` equal to the live log (and the previous `snapshot.json` if one existed) and does not throw; (2) with `snapshotEvery: 2` and a persistently failing snapshot, 20 appends make at most 3 snapshot attempts (back-off), and the first append after the fault clears writes one.

## persistence-4 · CONFIRMED · Medium (agree)

**Evidence (observed):**
- Damaged newline-terminated line: `Event log line 4 is damaged (not valid JSON)`; desktop shows `The System could not start: Event log line 4 is damaged (not valid JSON)` and exits. No campaign name, no path, no `backups`, no "nothing was changed". LOCK is released (`store.ts:400`), log untouched.
- Unknown event type (newer build): `Campaign "main" cannot load: Event vf-future: unknown type "future.thing"` — no "update the app".
- Additive key on a known type, same schemaVersion (how a newer build's new optional field looks to an older build; 127 strict zod objects in `envelope.ts`): `Campaign "main" cannot load: Event vf-future2: bad campaign.dayAdvanced payload: (root): Unrecognized key: "addedInNewerBuild"` — no "update the app".
- Only `schemaVersion > target` says "update the app" (`envelope.ts:1134-1137`), observed with `schemaVersion: 99`.
- `docs/TROUBLESHOOTING.md:131-137` covers the lost-writes case only.

**Severity:** Medium agreed: every load failure ends the app with a raw message and no path to recovery except one case.

**Acceptance check:** for each of (damaged terminated line, unknown type, unrecognized key, schemaVersion ahead) the message the GM sees (StoreError from `open`, or `startErrorMessage` output) contains the campaign folder path, the newest backup folder path or "no backups yet", and "Nothing was changed"; the unknown-type and unrecognized-key cases also say the campaign was saved by a newer version of The System; TROUBLESHOOTING.md has a "damaged line" entry (copy the line aside / restore from backups). A vitest asserts all four messages.

## persistence-10 · CONFIRMED · Low (agree)

**Evidence (observed):** after `backup()` and `close()`, deleting `events.jsonl` and `snapshot.json` → `open` succeeds with `state === null`, 0 events, while `backups/` still holds 1 folder. Zero-length log, no snapshot: same. Code: `store.ts:407` reads an empty buffer, `store.ts:433` opens with `'w+'`, and the `lostWrites` guard needs a snapshot.

**Severity:** Low agreed (nothing lost on disk; the GM may start a new campaign beside the real one).

**Acceptance check:** unit test: a campaign folder whose `events.jsonl` is missing or zero bytes, with no `snapshot.json`, and with at least one folder in `backups/` (or an `events.jsonl.torn-*` file) → `open` throws a StoreError naming `backups/`; a genuinely new campaign (empty `backups/`, no torn files) still opens blank.

## desktop-1 · CONFIRMED (by source; Windows-only, not run) · Medium (agree)

**Evidence (exact lines, electron-builder/app-builder-lib 26.15.3):**
- `node_modules/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh:40-41`: `CHECK_APP_RUNNING` runs `IS_POWERSHELL_AVAILABLE` then `_CHECK_APP_RUNNING` unless `customCheckAppRunning` is defined. `apps/desktop/electron-builder.yml` defines no `nsis.include`, so the stock macros ship.
- `:48,53`: PowerShell counts as available when `Get-CimInstance` exists and the Process-scope policy is not `Restricted` (stock Windows 10/11: `Undefined`), so `$IsPowerShellAvailable == 0`.
- `:127`: the "polite" pass is `KILL_PROCESS ... 0`; `:89-90` sets `$0 = ""`; `:93-94` then runs `Get-CimInstance Win32_Process | ? { Path.StartsWith('$INSTDIR') } | % { Stop-Process -Id $_.ProcessId }`. `Stop-Process` is `Process.Kill()` (TerminateProcess); `-Force` only suppresses the confirmation for other users' processes. Only the fallback branch (`:99`, `taskkill` without `/F`) posts WM_CLOSE. The PowerShell filter also matches every helper process under `$INSTDIR`, so main, GPU and renderer die together.
- `installSection.nsh:33,36` and `uninstaller.nsh:2` invoke `CHECK_APP_RUNNING` for the manual install and the upgrade's silent uninstall alike; `messages.yml:47` is the "is running. Click OK to close it" box.
- App side: `apps/desktop/src/main.ts:131-140` takes the quit backup only inside the `close` event (WM_CLOSE), and `before-quit` (`:304-320`) is what calls `running.close()` → `store.close()` (snapshot, LOCK removal). A TerminateProcess skips all of it. The comment at `:136-139` ("sends this polite close and then force-kills the app a second later") describes the taskkill fallback, not the shipped path. `desktop.spec.ts` ("a polite close then a forced kill") drives `win.close()` + SIGKILL, so it cannot catch this.
- Consequence check: event log safe (fsync per append); no `*-quit` backup, last session-log interval lost, no snapshot, `LOCK` left → feeds persistence-1.

**Confidence:** high on the template and the Stop-Process semantics; the only unverified assumption is that `Get-CimInstance` is present and the policy is not `Restricted` on Luke's machine, which is the stock state.

**Severity:** Medium agreed.

**Acceptance check:** (1) `electron-builder.yml` has `nsis.include` pointing at a script defining `customCheckAppRunning` that first launches `"$INSTDIR\TheSystem.exe" --quit-for-update` (delivered via `second-instance`, which calls `app.quit()` without the question), waits up to ~8 s for the process set to be gone, then falls back to the stock kill; (2) desktop spec: launch A with a campaign holding events, launch a second instance with `--quit-for-update`; within 8 s A has exited, `campaigns/main/backups/*-quit` exists and `campaigns/main/LOCK` does not; (3) the Windows CI job runs `setup.exe /S` over a running installed copy and asserts the same two files; (4) the main.ts comment is corrected.

## desktop-3 · CONFIRMED (5 s vs 10 s) / PARTLY (1000 ms cold-start, not reproduced) · Medium as CI reliability (agree), no user impact

**Evidence:**
- CI annotation on check-run 124282724597 (run 41119622184, 2026-10-30, head 277e5c9): `launch.spec.ts:102` `Expected: 1 Received: 2`, `Timeout 5000ms exceeded while waiting on the predicate`. Line 99 (`Connected`) had already passed, so the GM page was loaded and only `reveal()` had not run: `ready-to-show` was late and the app's own fallback is `setTimeout(reveal, 10_000)` (`main.ts:200`). `apps/desktop/playwright.config.ts` sets no `expect.timeout`, so `expect.poll` uses Playwright's 5 s default. Confirmed mismatch: the test fails on a condition the app recovers from by design 5 s later.
- 1000 ms bound (`launch.spec.ts:63`): `afterReady` is measured after `new BrowserWindow(...)` + `loadURL` in `showSplash()` (`main.ts:79-81`), so it does include Electron's first-window construction. My single run here: `splash shown 62 ms after app-ready, 729 ms after the process started` (warm cache; the Electron binary had been run before in this sandbox). I did not reproduce 1269 ms and did not drop the page cache to try (shared machine).
- Root cause of the late `ready-to-show` (GPU/software GL under xvfb) is a hypothesis in the original report and remains one here.

**Severity:** Medium agreed only as a release-blocking flaky check in a repo whose rule is "keep main green"; it is not a product defect.

**Acceptance check:** (1) `launch.spec.ts:100-102` polls with a timeout above 10 s, or the app records a reveal reason (`ready-to-show` | `did-fail-load` | `timeout`) on `globalThis` and the test asserts `ready-to-show` with a 15 s poll; (2) desktop specs launch with `--disable-gpu` (or `app.disableHardwareAcceleration()` under a test env var) and `desktop-smoke` passes 3 consecutive CI runs; (3) the splash bound is measured before `new BrowserWindow` (our code only) or after a warm-up launch.

## desktop-5 · CONFIRMED (reproduced) · Low (agree)

**Evidence (observed in the built app, Electron 45, xvfb, after a real click for activation):** `navigator.clipboard.writeText` → `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied.`; `navigator.clipboard.write([ClipboardItem])` → same. `navigator.permissions.query({name:'clipboard-write'})` reports `granted` (no check handler), so the page cannot even detect the denial ahead of time. Cause: `launch.ts:194` returns false for every permission but `media`; `main.ts:156-166` wires it as the request handler. `JoinPanel.tsx:146-152` has no fallback: on rejection it calls `setCopied(false)`, so the button stays "Copy" and nothing is copied; `SessionPanel.tsx:344` has an `execCommand('copy')` fallback, which is why "Copy for Claude" still works.

**Severity:** Low agreed.

**Acceptance check:** `launch.test.ts`: `allowsPermission(true, 'clipboard-sanitized-write', undefined, 'http://127.0.0.1:<port>/gm', port)` is true and false for a foreign URL or `fromGmWindow=false`; desktop spec: in the GM window `navigator.clipboard.writeText('x')` resolves and `app.evaluate(({clipboard}) => clipboard.readText())` returns `'x'`; clicking the GM-link Copy button flips its label to "Copied".

## security-1 · CONFIRMED (reproduced) · Medium (agree)

**Evidence (observed via the real `contestPracticeCommands` + engine `execute` + `projectForPlayer`):**
- PC vs NPC (Jake, Perception vs custom "Hooded Ambusher"), no `contest.shared`: command `{"type":"practice.log","characterId":"jake","action":"Contest roll against Hooded Ambusher (Perception)","stat":"perception","tags":["contest"],"source":"gm"}`; Jake's projection: `practice: [{id, at, action: "Contest roll against Hooded Ambusher (Perception)", skills: [], stat: "perception", source: "gm"}]`; shared contests: none.
- PC vs PC: Jake sees `Contest roll against Mira · Agility (Strength)`, Mira sees `Contest roll against Jake · Strength (Agility)`.
- The entry is sent at roll time (`Encounter.tsx:111-125`, `roll()`), not at share; `player.ts:146` projects `practice: 'owner'` and `:872-879` copies `action` as typed; `PracticePanel.tsx:175` renders `p.action` on the player's sheet. Only `tags` are withheld. D182 says the roll "stays private" until Share.

**Severity:** Medium agreed (design inconsistency; the GM typed the label as "what players see", but chose not to share).

**Acceptance check:** test in `apps/web` (or engine) asserting that after executing `contestPracticeCommands(...)` for an unshared contest, no entry in `projectForPlayer(state, <each PC side>).practice` has an `action` containing the opposing side's label (and, PC vs PC, nothing naming the other side's stat). Satisfied by logging on `contest.shared` only, or by a neutral action text ("Contest roll (Perception)"); if the project instead keeps the label, the Encounter panel must show "players see this at once" and a test must assert that text.

## security-3 · CONFIRMED (reproduced) · Low (agree)

**Evidence (observed, `execute` with a player actor):** `{type:'practice.log', characterId:'jake'}` → throws `TypeError: Cannot read properties of undefined (reading 'length')`; `skills: 5` → `(command.skills ?? []) is not iterable`; `note.create` with `title: 5` → `(command.title ?? "").trim is not a function`. `commands.ts:2050` calls `overLimit` before the `try` at `:2052`; `hub.ts:258-259` catches it with `console.error('The System: <type> failed:', error)` and answers "The command could not be run". Hardening only.

**Severity:** Low agreed.

**Acceptance check:** hub test: those three frames from a player yield an ordinary refusal (e.g. `Bad command "practice.log"`) with a `console.error` spy never called; engine test: `execute` does not throw for any command whose `type` is valid but whose fields have wrong types (small table-driven test over `practice.log`, `note.create`, `skill.cast`).

---

## Not checked (out of scope here)
persistence-5..9, desktop-4, 6..8, security-2, security-4.

## Memory
Nothing from the user's memory was used; nothing new to save.
