# Desktop / installer / Windows review (worktree f656f8c2)

Lens: the Electron app, the NSIS installer, the release workflow and Windows behaviour. I can't run Windows here, so Windows-only claims are marked **unreproduced**, with the exact template or code lines and the reasoning. I reproduced the Electron behaviour on Linux with Electron 45 under xvfb. For that I bundled `dist/main.cjs` with esbuild, pointing it at a separate copy of `tar-stream`/`unbzip2-stream`, because the shared `node_modules` predates those dependencies. Probes are removed and the worktree is clean.

## Findings

### desktop-1 · Medium · Upgrading over a running app hard-kills it: no quit backup, no final session-log write, and the LOCK is left behind
- **Where:** `apps/desktop/src/main.ts:136-140` (the D201 premise); `node_modules/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh:85-97` (`KILL_PROCESS`), `:105-140` (`_CHECK_APP_RUNNING`); `apps/desktop/test/desktop.spec.ts:102-150`.
- **What:** D201 and the comment in main.ts assume the installer first sends a polite close (WM_CLOSE) and force-kills about a second later. That only happens on the `taskkill` fallback. electron-builder 26.15.3 first runs `IS_POWERSHELL_AVAILABLE`, which passes on stock Windows 10/11 (`Get-CimInstance` exists and the Process-scope execution policy is `Undefined`). It then takes the PowerShell branch, which runs `Get-CimInstance Win32_Process | ? {$_.Path.StartsWith('$INSTDIR')} | % { Stop-Process -Id $_.ProcessId $0 }`, where `$0` is empty for the "polite" pass. `Stop-Process` without `-Force` still calls `Process.Kill()` (TerminateProcess); `-Force` only skips the confirmation for processes owned by other users. So the polite pass is already a hard kill, and the window never gets a `close` event.
- **Failure scenario:** Luke leaves the app open between sessions and runs the next preview's installer. He clicks OK on "The System is running. Click OK to close it.", which kills every process under the install folder at once. `server.backup()` never runs, so the backup D201 promised before an upgrade (the moment a new build's `migrateOnLoad` may append migration events) doesn't exist. `preClose` never writes the last session logs, no snapshot is taken, and `campaigns/main/LOCK` stays behind, which feeds desktop-2. The event log itself is safe (fsync per append, torn-tail recovery).
- **Evidence:** the template lines above, with PowerShell's documented `Stop-Process` semantics. The desktop test "a polite close then a forced kill" simulates the `taskkill` path (`win.close()` then SIGKILL), not what the shipped installer does on Windows 10/11, so it passes while the real path skips the backup. **Unreproduced** (needs Windows).
- **Fix direction:** add a `customCheckAppRunning` macro through `nsis.include`. It should ask the running instance to quit cleanly first, for example by running `"$INSTDIR\TheSystem.exe" --quit-for-update`; the single-instance lock delivers that argv to `second-instance`, which calls `app.quit()` (backup, close, lock release) without the question. Wait up to about 8 s, then fall back to the stock force kill. Make the desktop test drive that path.
- **Confidence:** high on the mechanism; medium on how often Luke installs with the app open.

### desktop-2 · Medium · On Windows a stale campaign LOCK can be judged "alive", and then the whole app refuses to start
- **Where:** `apps/server/src/store.ts:263-330` (`bootMinute`, `takeLock`, `defaultIsAlive`); `apps/desktop/src/main.ts:261-270`; `docs/TROUBLESHOOTING.md` (LOCK is not mentioned).
- **What:** a lock from this machine counts as live when `|boot − bootMinute()| ≤ 1` and `process.kill(pid, 0)` succeeds. Three Windows facts break this:
  - (a) `os.uptime()` is `GetTickCount64`, which keeps counting through Fast Startup "Shut down" (the default on laptops), so the boot minute does not change overnight.
  - (b) Windows reuses PIDs quickly, and `kill(pid, 0)` returns EPERM for SYSTEM-owned processes, which `defaultIsAlive` treats as alive.
  - (c) `takeLock` has no `info.pid === process.pid` check, so if the new main process gets the old PID, the app refuses its own PID.
  
  Any `StoreError` from `open('main')` inside `startApp` is not a port error. The desktop then shows `showErrorBox` and calls `app.exit(1)`, so the in-app backup and restore UI can't be reached.
- **Failure scenario:** Windows shuts down or updates with the app open (session-end kills it, lock kept), or desktop-1 kills it. Later the old PID belongs to some other process, such as a service after the Fast-Startup boot, or one of Electron's own helpers or the main process after an upgrade's "Run The System". The app shows "The System could not start: The campaign is already open (process 1234)". If the PID belongs to a long-lived process, this happens on every launch until a full Restart. The message doesn't name `LOCK` (only the foreign-host message does), and TROUBLESHOOTING doesn't mention it either.
- **Evidence:** code reading. REVIEW-LOG line 72 fixed reuse after power loss with the boot minute, but Fast Startup and own-PID reuse aren't covered. **Unreproduced** (Windows only).
- **Fix direction:** in the desktop, Electron's single-instance lock already guarantees no second desktop server, so treat same-machine locks as stale there (or at least when `pid === process.pid`). Record the holder's process start time or image name and check it. Name the LOCK file in the "already open" message and document it in TROUBLESHOOTING. Consider opening the console with a recovery banner instead of exiting when only the campaign failed to load.
- **Confidence:** medium.

### desktop-3 · Medium · The splash and hand-over test fails for timing reasons it can't tell apart from a real hang; the latest CI failure is a new, fourth mode
- **Where:** `apps/desktop/test/launch.spec.ts:56-63, 99-102`; `apps/desktop/src/main.ts:197-200`.
- **What:**
  - CI run 41119622184 (2026-10-30, `desktop-smoke`) failed at `launch.spec.ts:102` with `Expected: 1 Received: 2` windows: the GM window was already "Connected", but the splash had not closed after 5 s. That `expect.poll` uses the default 5 s timeout. The app's own fallback reveal is 10 s (`setTimeout(reveal, 10_000)`), so whenever `ready-to-show` is late the test fails even though the app would recover by design.
  - The bound at line 63 (app-ready → splash under 1000 ms) still includes Electron's own work. Here, on the very first Electron launch (cold disk cache), I got **1269 ms**; the next run gave 56 ms. Constructing the first `BrowserWindow` is Electron's cost, not our code.
  - Earlier failures (CDP "Unable to capture screenshot", capturePage `UnknownVizError`, no capture within 15 s) and this late `ready-to-show` all need a compositor frame from the first window of a cold launch under xvfb. That points to the GPU process and software GL on the runner rather than our code. This is a hypothesis: locally `ready-to-show` fired 229–275 ms after creation in 3 of 3 runs (it fires right after `did-finish-load`).
- **Evidence:** the CI annotation pulled with `gh api …/check-runs/124282724597/annotations`; local `xvfb-run -a npx playwright test … -g "splash says"` (first run failed at 1269 ms, second passed at 56 ms); a probe that timed `ready-to-show`.
- **Fix direction:** launch desktop specs with `--disable-gpu`, or call `app.disableHardwareAcceleration()` under a test env var, so compositing is deterministic. Have the app record why it revealed (`ready-to-show`, `did-fail-load` or `timeout`) and assert on that with a poll timeout above 10 s. Measure the splash bound after a warm-up launch, or leave the first `BrowserWindow` construction out of it.
- **Confidence:** high that the 5 s versus 10 s mismatch exists; low on the root cause.

### desktop-4 · Medium · The release workflow never installs anything: what Luke actually does is untested
- **Where:** `.github/workflows/release.yml` ("Smoke-test the packaged Windows app"); `apps/desktop/test/packaged.smoke.ts:20-24`.
- **What:**
  - The Windows smoke launches `win-unpacked\TheSystem.exe` with `THE_SYSTEM_DATA_DIR` set. Nothing runs the NSIS installer (`/S`) or launches the installed `%LOCALAPPDATA%\Programs\The System\TheSystem.exe`.
  - Nothing installs the same build over a running copy (which would have caught desktop-1), checks that uninstall keeps `%APPDATA%\The System\data`, or exercises the real data path (the install path has a space; CI's does not).
  - The "Packaged speech engine present and loads" step loads the addon in Node through `tsx`, not inside Electron. I checked the PE: `sherpa-onnx.node` delay-loads `node.exe` with the standard hook, so it should load in `TheSystem.exe`, but nothing proves it.
- **Failure scenario:** a regression in the installer or upgrade path, or in data-path handling, ships green.
- **Fix direction:** on the Windows job, add these steps:
  1. Run `setup.exe /S`.
  2. Launch the installed exe with no data-dir override and wait for `/health`.
  3. Run `setup.exe /S` again while it is running, then check the outcome (quit backup present, LOCK released).
  4. Run `Uninstall The System.exe /S` and check that the data is kept.
  5. Evaluate `require` of the packaged speech engine inside the packaged Electron (`app.evaluate`).
- **Confidence:** high.

### desktop-5 · Low · The desktop GM window denies all async clipboard writes; "Copy" for the GM link silently does nothing
- **Where:** `apps/desktop/src/launch.ts:187-197` (`allowsPermission`), `main.ts:156-166`; `apps/web/src/gm/JoinPanel.tsx:146-152`; `apps/web/src/gm/SessionPanel.tsx:93-104`.
- **What:** Chromium asks Electron's request handler for `clipboard-sanitized-write` on `navigator.clipboard.writeText/write`. The handler allows only `media` audio, so both calls reject with "Write permission denied".
  - The GM-link "Copy" button stays "Copy" and nothing reaches the clipboard.
  - "Copy log for Claude" and "Copy for Claude" work only through the deprecated `execCommand('copy')` fallback, which needs the click's user activation to still be valid after the report fetch.
- **Evidence:** reproduced with the app's own handler in the built desktop app (Electron 45, xvfb). `writeText` → `NotAllowedError … Write permission denied`; `write([ClipboardItem])` → the same; clicking the GM-link Copy button left the label at "Copy"; "Copy log for Claude" put the log on the clipboard through the fallback. The handler was asked for `request:clipboard-sanitized-write`.
- **Fix direction:** in `allowsPermission`, also grant `clipboard-sanitized-write` to the GM window's own page, and add a desktop test that clicks a Copy button.
- **Confidence:** high.

### desktop-6 · Low · The join QR can pick a virtual adapter over the home wifi on a 10.x home network
- **Where:** `apps/server/src/join.ts:33-42` (`addressRank`).
- **What:** every `192.168/16` address ranks above every `10/8` address, and adapter type is ignored. Several common Windows virtual adapters use 192.168: VirtualBox host-only (`192.168.56.1`), VMware VMnet1/8 (`192.168.x.1`), and Windows Mobile Hotspot / ICS (`192.168.137.1`).
- **Failure scenario:** the home wifi is 10.0.0.x (the Xfinity gateway default) and the laptop has one of those adapters up. The big URL and QR then point at the virtual adapter, and players scanning it get a timeout. "Other addresses" lists the right one, so it can be recovered, but it is confusing at the table.
- **Evidence:** code reading (`rankedLanAddresses` sorts by rank, then adapter order). **Unreproduced** on Windows.
- **Fix direction:** rank down known virtual MAC prefixes (`0a:00:27`/`08:00:27` VirtualBox, `00:50:56`/`00:0c:29` VMware, `00:15:5d` Hyper-V) and `192.168.137.0/24`, and prefer an address whose /24 matches the adapter with a default route if one can be found.
- **Confidence:** medium.

### desktop-7 · Low · The speech model install renames on Windows with no retry, so antivirus or an open handle can fail the last step and cost a 118 MB re-download
- **Where:** `apps/server/src/speech/model.ts:129-135` (`extractMembers` resolves on WriteStream `finish`, not `close`), `:292-293` (`rename(staging, …)` of a directory), `:381`.
- **What:** right after three large files are written into `whisper-tiny.en.staging`, the directory is renamed with a single `fs.promises.rename`. On Windows, Defender's on-access scan or a file descriptor not yet closed (`finish` fires before `close`) can make the rename fail with EPERM/EBUSY. graceful-fs retries renames on win32 for up to 60 s for exactly this reason. On failure, the `finally` deletes the staging folder and the archive, so "Try the download again" downloads all 118 MB again.
- **Evidence:** code reading; **unreproduced**.
- **Fix direction:** wait for `close`; retry the rename on EPERM, EACCES or EBUSY with backoff (a few seconds); keep the verified archive until the install succeeds.
- **Confidence:** low to medium.

### desktop-8 · Low · Packaged builds have no reload, zoom or find, and nothing recovers a crashed console renderer
- **Where:** `apps/desktop/src/main.ts:323-331` (`Menu.setApplicationMenu(null)` on Windows), `openGmWindow` (no `render-process-gone` handler).
- **What:** removing the menu also removes the default accelerators (Ctrl+R, Ctrl+= / Ctrl+-, Ctrl+0), and Electron doesn't apply Ctrl+wheel zoom on its own (`zoom-changed` is only an event).
  - On a 1366×768 laptop at 125% scaling, Luke can't zoom the dense console out, or zoom in to read it.
  - If the console wedges or its renderer crashes, the window goes blank and the only way out is Quit, which drops every player.
- **Evidence:** code reading plus Electron's documented menu and accelerator behaviour. I didn't test this in a packaged build.
- **Fix direction:** keep a minimal View menu without DevTools (reload, zoom in/out/reset) or register those accelerators, and reload on `render-process-gone` (the GM key survives in sessionStorage).
- **Confidence:** medium.

## Checked and clean
- **Uninstall:** keeps `%APPDATA%\The System` (no `deleteAppDataOnUninstall`; upgrades pass `--updated`).
- **Install mode and upgrades:** the default is a per-user install. The assisted installer offers all-users with elevation, and an upgrade detects the existing mode and preselects it. `appId` is stable, so the GUID stays the same across previews and the old version is uninstalled silently. The chosen install directory gets a `The System` subfolder (`instFilesPre`).
- **QF.11 half-download guard:** NSIS CRC check is on in `installer.nsi` (`CRCCheck off` appears only in `portable.nsi`), and the CI step truncating the shipped installer and running it with `/S` tests the real settings. A `$null` ExitCode makes that step fail, never pass falsely.
- **Data versioning:** each event carries a schema version with upcasters. An older build refuses newer events with "update the app" before any repair or write (`resume` runs before the torn-tail fix). A snapshot mismatch leads to a full replay. Backups are staged then renamed, and `fsyncDir` tolerates Windows.
- **Electron hardening:** `contextIsolation`, `sandbox`, `nodeIntegration: false`, no preload, DevTools off in packaged builds. `will-navigate` and `will-redirect` keep the window on its own pages; `window.open` is denied and only http(s) goes to `shell.openExternal`. The splash has JavaScript off plus a CSP, and test-only env hooks are ignored when packaged.
- **Mic permission:** only the GM webContents, on its own page, audio only. Capture runs through `onaudioprocess`, so a minimised window doesn't throttle it.
- **safeStorage on Windows:** DPAPI is available after app-ready, a decrypt failure returns `null` rather than crashing, and the key is stored outside campaign folders.
- **Single instance and quitting:** the single-instance lock is taken before ready, and a second launch focuses the existing window. Quitting while starting, the 5 s quit guard and the 3 s close grace are all consistent.
- **Speech addon:** `sherpa-onnx.node` delay-loads `node.exe` (the standard win delay-load hook, so it binds to `TheSystem.exe`), and its DLLs sit beside it.
- **Paths:** `%APPDATA%` isn't moved by OneDrive's folder redirection. The longest backup portrait path is about 200 characters, under MAX_PATH. The space in "The System" causes no problem.
- **Ports and windows:** the busy-port fallback covers EADDRINUSE and EACCES (Hyper-V exclusions). The GM window uses `127.0.0.1`, not `localhost`. A 1366×860 centred window is fitted to the work area on Windows (Chromium `AdjustWindowToFit`), so 150% scaling is fine.
- **Windows Firewall and Public networks:** documented in the GM guide, TROUBLESHOOTING and the join panel help, and already recorded as accepted.

Memory: nothing from the user's memory was used.
