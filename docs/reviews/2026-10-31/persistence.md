# Persistence, recovery and data integrity review

Worktree `/home/claude/review/persistence` (origin/main f656f8c2, tag `preview-2026-10-31-17.1`).
Probes live in `/tmp/persist-probe/scripts/` (nothing committed, nothing in the worktree changed).

Summary: no High found. The event log, torn-tail repair, snapshot invalidation and older-to-newer upgrade
paths held up under cross-version fuzzing (see "Checked and clean"). The real problems are in
lock handling, the missing restore path, backup fragility, and what the GM sees when something goes wrong.

## Findings (most severe first)

### persistence-1 · Medium · A crash-left LOCK can block the next start with no hint (PID reuse, even the new process's own PID)
- Where: `apps/server/src/store.ts:322-325` (`takeLock`: `sameBoot && isAlive(info.pid)` -> `The campaign is already open (process N)`); surfaced by `apps/desktop/src/launch.ts:118` (`The System could not start: ...`) then `app.exit(1)` (`apps/desktop/src/main.ts`, `dialog.showErrorBox`).
- What: stale-lock detection is "same boot minute and the pid is alive". It never checks that the live process is the one that wrote the lock. The message has no hint to delete `LOCK` (the foreign-machine branch does have one).
- Scenario: the app is killed (the installer force-kill that `main.ts` itself anticipates, Task Manager, a crash) while a campaign is open, so `LOCK` stays. Windows reuses PIDs aggressively. The relaunched main process, or any unrelated live process, can hold that PID. The GM gets "already open (process 1234)", the app exits, and nothing says what to delete. For an unrelated long-lived process the block repeats on every launch. The desktop app already holds Electron's `requestSingleInstanceLock`, so the liveness check adds only false positives there. Boot-minute protection may also be weakened by Windows Fast Startup / sleep (`os.uptime()` is `GetTickCount64`, `libuv src/win/util.c`); unverified.
- Evidence (reproduced, `lock-backup.mts` part A): lock left by pid 9539, reopened from the same process: `A. same-pid relaunch refused: The campaign is already open (process 9539)`. Lock with the pid of an unrelated live process (the parent shell, 9528): `refused: The campaign is already open (process 9528)`.
- Fix direction: record the process start time (or a per-launch random id the desktop keeps) in the lock and compare it. Or let the desktop pass `isAlive: () => false`, since its single-instance lock already guarantees exclusivity. Always put `delete <path>\LOCK` and the likely cause in the message.
- Confidence: high that it refuses; medium on how often Windows hands out the same PID.

### persistence-2 · Medium · There is no restore path, and the documented export/import cannot be reached
- Where: `apps/server/src/store.ts:642` (`importCampaign`, no caller outside tests); `apps/server/src/server.ts:432` (`GET /api/gm/export`, GM-key header required, no UI); `docs/GM-GUIDE.md:326-328` ("A campaign export (the GM's export file) carries the event log and the portraits, and importing it brings both back"); `docs/REVIEW-LOG.md` M2.A round 1 L(4) said M4.3/M10.1 would wire `backup()`/`importCampaign`. `backup()` was wired, `importCampaign` never was.
- What: grep of `apps/web/src` finds no `/api/gm/export` call and nothing calls `importCampaign`. A browser cannot send the `x-gm-key` header from the address bar. The only recovery that exists is hand-copying files out of `backups/`. The restore-over-running-campaign case (copying `events.jsonl` while the app holds it open) is not guarded or documented: the open append fd keeps writing to the replaced file, and `close()` then writes a snapshot ahead of the restored log, which refuses to load next start (the safe outcome, but confusing). The "move laptops" section does not say to quit the app before copying. A live copy can take `snapshot.json` newer than `events.jsonl` and hit the same "disk lost writes" refusal on a healthy campaign.
- Evidence: `grep -rn "api/gm/export\|importCampaign" apps` shows only server code and tests; `apps/desktop/test/desktop.spec.ts:75` calls the API directly.
- Fix direction: either add a GM-console "Download campaign" and a Restore/Import window (new id, never overwrite, as `importCampaign` already does), or correct the docs to say that folder copy is the only restore. State "quit The System first".
- Confidence: high.

### persistence-3 · Medium · `backup()` throws if the snapshot write fails, so a good log gets no backup; a failing snapshot also retries on every append
- Where: `apps/server/src/store.ts:533` (`if (this.broken === null) this.writeSnapshot();` with no try/catch); `store.ts:505-511` (append path).
- What: the backup's job is to copy `events.jsonl`, but it first rewrites `snapshot.json` (temp, fsync, rename). On Windows that rename onto an existing file fails with EPERM/EBUSY whenever Defender, an indexer or sync software holds `snapshot.json` open. When that happens at session end, `sessionEnded` reports "the backup could not be saved" and no copy exists, although the log was fine. On the append path the error is swallowed but `sinceSnapshot` is not reset, so every later append re-serialises and fsyncs the whole state until the lock clears.
- Evidence (reproduced, `lock-backup.mts` part B, `snapshot.json` made a directory so the rename fails): `B. backup FAILED although the log is fine: EISDIR ... rename '.../snapshot.json.tmp-9539' ->`; `backups folder: []`; `snapshot attempts for 5 appends while it keeps failing: 5`.
- Fix direction: wrap the snapshot in try/catch inside `backup()` and copy the log (and the older snapshot if present) regardless. Back off snapshot retries (for example every 100 more events).
- Confidence: high on the code path, medium on how often Windows triggers the rename failure.

### persistence-4 · Medium · An unloadable campaign ends the app with a raw message; only one of the causes has a documented recovery
- Where: `apps/server/src/store.ts:200` (`Event log line N is damaged`), `store.ts:428` (`Campaign "x" cannot load: ...`), `packages/engine/src/events/envelope.ts:1132` (`unknown type`); `apps/desktop/src/main.ts` (error box, `app.exit(1)`); `docs/TROUBLESHOOTING.md:131-138` covers only the lost-writes message.
- What: any load failure shows its raw message and quits. Only the lost-writes message names `backups/`. There is no repair tool, so a newline-terminated damaged line (D42: refuses) or a log from a newer build leaves the GM stuck.
- Evidence (reproduced): `nul-tail.mts`: a tail of NULs plus `\n` gives `REFUSED: Event log line 5 is damaged (not valid JSON)`, with no mention of backups or the line. `newer-in-older.mts`: tag 16.1's store opening a HEAD campaign gives `Campaign "main" cannot load: Event h-283: bad skillDef.defined payload: (root): Unrecognized key: "cost"` (no "update the app" hint; only the `schemaVersion > target` branch says that). The older build changed nothing: log byte-identical, `LOCK` released, snapshot intact, HEAD reopens (`fromSnapshot true`).
- Fix direction: catch `StoreError` at start and append a standard footer ("Your campaign is not changed. Newest backup: <path>. See TROUBLESHOOTING 'Campaign cannot load'"). For unknown event types or keys say "this campaign was saved by a newer version". Add a Troubleshooting entry for damaged lines (copy the line aside, restore from backup).
- Confidence: high.

### persistence-5 · Low · "See the server log" points at nothing; store write errors are swallowed
- Where: `apps/server/src/server.ts:100` (`logger: false` by default; `startApp` never passes one), warnings at `server.ts:153` and `server.ts:174`; `apps/server/src/hub.ts:264-267` (any non-`EventRejectedError` from `appendAll` becomes `Could not save the change`, nothing logged).
- What: in the desktop app `app.log.error(...)` is a no-op, and a packaged Windows GUI has no console. The GM cannot tell a full disk from a latched store (fsync failed) from a closed store. The REVIEW-LOG records the poisoned store being invisible to the GM as accepted; this adds that the message cannot be followed up either.
- Fix direction: have `startApp` write errors to `<dataDir>/server.log` (append, size-capped), and say in the warnings where it is.
- Confidence: high (code reading).

### persistence-6 · Low · On Windows the "cut back a failed write" step probably cannot work (unreproduced, Linux only here)
- Where: `apps/server/src/store.ts:454` (log opened `'a'`) and `store.ts:488` (`io.ftruncate(fd, this.goodBytes)` on that fd).
- What: libuv opens `O_APPEND` handles with `FILE_APPEND_DATA` and without `FILE_WRITE_DATA` (`src/win/fs.c` ~l.495), and `fs__ftruncate` uses `NtSetInformationFile(FileEndOfFileInformation)` on the handle (~l.2400), which I expect to need `FILE_WRITE_DATA`. If so, any failed or short write (disk full) makes the cut-back throw, sets `broken`, and refuses all further saves until restart. Restart repairs the torn tail, so no data is lost, but the Linux-only tests (`logIo` fakes) cannot show it.
- Fix direction: open the log `r+` and write at an explicit position (`goodBytes`), or open a second `r+` fd for truncation.
- Confidence: medium-low (not run on Windows).

### persistence-7 · Low · Backups and exports leave out `codm/`, `transcripts/` and `speakers/`
- Where: `apps/server/src/store.ts:541-556` (`backup()` copies `events.jsonl`, `snapshot.json`, `portraits/`); `exportCampaign()` is the log plus portraits; `apps/server/src/ai/practiceRoutes.ts:16`, `speech/routes.ts:45-47`.
- What: session notes and summaries (paid API output, `notes-NN.json`), practice drafts, suggestion/prepared state, raw transcripts and voice enrolments exist only in the live campaign folder. MT.10 and the docs say a backup restores whole. These files do not follow undo or restore either, and they are keyed by session number, so they are reused after an undone session start.
- Evidence (reproduced, `backup-contents.mts`): campaign dir = `LOCK, backups, codm, events.jsonl, snapshot.json, speakers, transcripts`; backup holds = `events.jsonl, snapshot.json`; export keys = `format, version, exportedAt, campaignId, events, portraits`.
- Fix direction: copy `codm/` and `transcripts/` into backups (leave `speakers/` out deliberately and say so), or reword the docs.
- Confidence: high.

### persistence-8 · Low · Co-DM JSON stores use temp+rename without fsync, and a damaged file throws forever
- Where: `apps/server/src/ai/{sessionNotes.ts:194, practiceDrafts.ts:289, suggestionRoutes.ts:83, prepareRoutes.ts:87, quickRoutes.ts:59}` (`writeFileSync(tmp)` then `renameSync`); `ai/coDm.ts:118` (settings written in place); the readers deliberately throw on a damaged file ("never overwritten").
- What: after a power cut NTFS can leave the renamed file empty or short. `JSON.parse` then throws a bare `Unexpected end of JSON input`, and every route using that store fails until the GM finds and moves the file. Only `store.ts` and `sessionLog.ts` use the durable helper.
- Fix direction: reuse `writeFileDurable`. Give the readers a friendly "<file> is damaged; move it aside" error for syntax errors too.
- Confidence: medium (reading; the window is milliseconds).

### persistence-9 · Low · Portraits are never deleted and every backup copies all of them
- Where: `apps/server/src/portraits.ts:38-40`; `apps/server/src/store.ts:546-556`.
- What: each distinct upload (up to 2 MB; the GM screen downsizes) is kept forever even if no character references it any more, and every session-end and quit backup (never pruned, D199) copies the whole folder. Slow disk growth over 40 sessions rather than a failure.
- Fix direction: copy only portraits the log references in backups, or hard-link or skip names already present in the previous backup.
- Confidence: high (reading); effect small.

### persistence-10 · Low · A missing or empty log with no snapshot opens as a blank campaign even when `backups/` is full
- Where: `apps/server/src/store.ts:407-410, 433` (`existsSync(logFile) ? 'r+' : 'w+'`; the `lostWrites` guard needs a snapshot).
- Evidence (reproduced, `empty-log.mts`): after deleting `events.jsonl` and `snapshot.json`: `opens as a blank campaign: true | backups still there: 1`; zero-length log, no snapshot: blank campaign `true`.
- What: antivirus quarantine or a misplaced folder silently gives the GM an empty campaign. Nothing is lost on disk, but the GM might start a new one next to it.
- Fix direction: if the log is missing or empty and `backups/` holds a backup (or `events.jsonl.torn-*` exists), refuse with the same "restore from backups" message.
- Confidence: high.

## Checked and clean (with how)
- **Older campaigns in newer builds.** Extracted the engine from every `preview-*` tag (4.1 to 17.1) into `/tmp/persist-probe/old/<tag>`.
  - `old-campaigns.mts`: each tag's demo campaign and every one of its golden logs (11 to 48 per tag) replay on HEAD with 0 failures. Each demo campaign, written with that tag's own snapshot, opens through `CampaignStore` + `migrateOnLoad`. Every pre-17.1 snapshot is correctly ignored (`fromSnapshot=false`); 17.1's own is used.
  - `golden-drift.mts`: HEAD replay of each tag's frozen golden logs equals that tag's frozen `.state.json` value for value; the only differences are the intended `hunger` removal (rules config v2).
  - `fuzz-old.mts`: HEAD's random-command generator driven through the old engines (8 tags, 3000-step walks, several seeds each, undo and player actors included). Every 40 accepted events and at the end the log replays on HEAD, and the final state matches the old build's state value for value.
  - `migrate-prefixes.mts`: the walks cut at every 25 to 50 events, written with an old snapshot, opened by HEAD with `migrateOnLoad`: all OK. Up to 12 banked-XP entries migrated, and the second load does not migrate again.
  - Upcasters (`evolution.released/chosen` v1, `clock.removed` v1), the rules config 1 to 2 migration, and the optional/default fields from MQ, MR, MT, MC, MD, MU are additive. Event envelope diff 4.1 to HEAD shows no tightened payload constraint. The M4.9 rules-fit check that would reject older `rules.edited` events was added in the same day as the feature, and no tag has the feature without the fix.
- **Newer campaign in an older build.** The old store refuses cleanly (see persistence-4). Log byte-identical afterwards, `LOCK` released, HEAD reopens it with its snapshot. No path found where an older build rewrites a newer log.
- **Snapshot vs full replay.** `snapshot-equiv.mts`: snapshots at 10 to 95% of three 1.1k-event random campaigns, resumed with the tail, are `deepStrictEqual` to a full replay (state and undo map), so no JSON round-trip loss (undefined keys, NaN, -0) in the state. Invalidation keys cover state schema, rules config version, event version map (so a new event type invalidates), raw-upcaster count and format. Accepted gaps from the REVIEW-LOG (reducer change without a version bump, hand-edited snapshot) are unchanged.
- **Torn and corrupted tails.** NUL-filled tail, partial line plus NULs: repaired, bytes kept exactly in `events.jsonl.torn-*`, 4 events kept (`nul-tail.mts`). NULs plus newline refuses (D42, noted in persistence-4). Snapshot ahead of the log refuses without changing anything; a snapshot behind the log replays the tail.
- **Portrait paths.** `PORTRAIT_REF` is anchored (`^[0-9a-f]{64}\.(png|jpg|webp)$`); import checks each name, size, magic bytes and hash before writing; `/portraits/:file` and the import staging path cannot traverse. There is no archive format, so no zip-slip surface. `importCampaign` never overwrites and stages then renames.
- **Backup naming and paths.** Names are `<ISO with : and . replaced>-<label>`, no reserved or trailing-dot names; the longest path is about 190 characters under a typical Windows profile; only `main` and `demo` exist as campaign ids in the app.
- **Concurrency inside the process.** Hub command to `appendAll` is synchronous (check, one write, fsync, then swap in memory), so a backup or snapshot cannot interleave with an append. Two GM windows share one hub. A second process is stopped by `LOCK`; foreign-machine locks give a delete-this-file hint.
- **Session logs.** Written temp+fsync+rename; a write failure is logged and reported at session end; a stale log is rewritten after undo of start/end; the report is rebuilt from the event log, so a locked or lost export file can always be regenerated. Timestamps are UTC ISO (no local-time bugs; just not local).
- **Secrets.** The AI key lives under `<dataDir>/co-dm`, outside every campaign folder, so backups and exports cannot carry it.

## Possible facts for the user's memory (from this review)
- None new beyond what the snapshot already holds.
