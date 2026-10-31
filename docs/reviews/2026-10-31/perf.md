# Performance review: what degrades over a long session or a long campaign

Worktree `/home/claude/review/perf` (origin/main f656f8c2). No repo source was modified; probes are untracked under `perf-probes/`.

## Method and caveats (read first)

- Campaigns generated at 10, 20 and 40 sessions with a realistic mix (XP, practice, notes plus edits, casts, trades, loot, broadcasts, quests, clocks, contests, undo). On-disk sets: `/tmp/perf-data-{10,20,40}`.

  | Sessions | Events | Event log | Snapshot |
  |---|---|---|---|
  | 10 | 3,820 | 1.3 MB | 0.67 MB |
  | 20 | 7,154 | 2.6 MB | 1.2 MB |
  | 40 | 13,400 | 4.8 MB | 2.1 MB |

- Server numbers come from the built server bundle, with 1 GM and 4 player ws clients, 600 commands per run (300 for the Table-view and slow-client runs).
- Browser numbers come from Chromium over CDP. The phone page was throttled 4x CPU, the GM console was not.
- The box has 2 CPUs and load average 3 to 10 from other reviewers. Treat absolute milliseconds as inflated and trust the ratios between sizes. Where a number is a single run I say so.
- **Biggest uncertainty:** my generator makes about 335 events per session and about 16 notes per player per session (657 notes for one player at 40 sessions, about 735 B each). A real table may be 2x lighter or 3x busier. Everything below is linear or worse in events, so divide the "sessions" thresholds by your real events-per-session ratio.
- Projections beyond 40 sessions are extrapolated, not measured.
- Already known in the docs, and not repeated as new:
  - REVIEW-LOG: "full snapshot per broadcast, fine at 5 clients; M11.1 will measure" (this report is that measurement).
  - REVIEW-LOG: "messages unbounded per view".
  - D204 paged only the display of notifications and messages, not the data sent.
  - D76 accepted undo at "20 ms for 3,000 events" (true at that size; see perf-2).
  - QUALITY.md:227 is a client-side heartbeat gap, not the server-side one in perf-3.

## Findings (most severe first)

### perf-1 · Medium (High from about 80 sessions, or earlier with Table view or busier sessions) · Every command re-sends whole views, so cost per command is linear in campaign size

- **Where:**
  - `apps/server/src/hub.ts:297` (fan-out loop).
  - `hub.ts:321-336` (`sendSnapshot`: `projectForGm` for the GM, `projectForPlayer` plus `JSON.stringify` for each player, compared with `lastView`).
  - `apps/server/src/server.ts:306` (the same view stringified a second time for the send).
  - Payload sources: `packages/engine/src/projection/gm.ts` and `projection/player.ts:839`.
- **What ships.**
  - The GM gets the entire `CampaignState` as a `state` frame for about 1.05 frames per command.
  - Each player gets the entire view for about 0.45 to 0.65 frames per command.
- **Measured, soak, last 50 commands:**

  | Sessions | GM state frame | GM KB/cmd | Player view frame | Player KB/cmd | Server CPU/cmd | Result latency p50 / p99 | RSS peak |
  |---|---|---|---|---|---|---|---|
  | 10 | 658 KB | 813 | 268 KB | about 175 | 17.8 ms | 5 / 45 ms | 252 MB |
  | 20 | 1,144 KB | 1,306 | 496 KB | about 300 | 29.7 ms | 19.5 / 190 ms | 301 MB |
  | 40 | 1,998 KB | 2,205 | 843 KB | about 540 | 48.6 ms | 33 / 328 ms | 330 MB |

  - Frame size is about 150 B per event for the GM and about 65 B per event per player.
  - Bytes sent per command across all five sockets: about 1.5 MB at 10 sessions, about 4.3 MB at 40.
  - CPU per command includes 4 extra GM pool-refill commands per 12 steps, so it is "per command of any kind".
- **Breakdown at 40 sessions.**
  - Player view, 863 KB: `notes` 483 KB, `practice` 195 KB, `messages` 146 KB, `inventory` 27 KB, everything else under 5 KB each.
  - GM state, 2.05 MB: `practice` 1.17 MB, `notes` 0.80 MB, `broadcasts` 211 KB, `contests` 119 KB.
  - `practice` in the player view is dead weight: only 8 entries are displayed (`player/practice.ts:12`, `PracticePanel.tsx:27`) but all 948 ship.
- **Table view (4 extra viewAs sockets) at 40 sessions:** 69.7 ms CPU per command (+43%), result latency p50 98 ms and p99 393 ms (single run).
- **Projected impact at 40 sessions.**
  - Comfortable on a desktop, but a phone on wifi receives about 0.5 MB per command.
  - A burst of 10 commands in 5 seconds is about 5 MB per phone, roughly 1 to 2 s of radio time, with 20 to 30 ms of parse each.
  - It becomes noticeable at about 20 sessions (p99 latency over 150 ms), and clearly so by 40.
  - Extrapolated: at about 80 sessions (27k events) a frame is about 4 MB for the GM and 1.7 MB per player, with about 95 ms CPU per command. That is High with Table view open.
- **Fix direction.**
  - Send deltas, or at least top-level-key patches. The reducer is immutable, so unchanged slices keep reference identity and "changed?" is a reference check instead of a stringify (I did not verify structural sharing end to end).
  - Cap what the player view carries: `practice` at 8, `messages` at the displayed 50 with fetch-older, notes as list metadata with bodies on open.
  - Stringify once per client, not twice.
- **Confidence:** High on the measurement and linear growth. Medium on the 80-session extrapolation.

### perf-2 · Medium · Undo is a stop-the-world rebuild that grows faster than the log, and ships the whole history back

- **Where:**
  - `packages/engine/src/events/log.ts` (undo path does a full fold of the effective events).
  - `packages/engine/src/history/index.ts:450` (`notificationHistory`).
  - `apps/server/src/hub.ts:292` (`historyCache = null`, then the getter at line 130 rebuilds), followed by a `reset` frame to every client.
  - `packages/engine/src/history/changeLog.ts:221` (`updateChangeLog`, rebuilt on the first Change Log request after an undo).
- **Measured, engine only:**

  | Sessions | Events | Undo | `notificationHistory` | Change-log build |
  |---|---|---|---|---|
  | 1 | 444 | 4 ms | 6 ms | |
  | 10 | 3,820 | 22 ms | 29 ms | 40 ms |
  | 20 | 7,154 | 88 ms | 103 ms | 118 ms |
  | 30 | 10,437 | 317 ms | 432 ms | 414 ms |
  | 40 | 13,400 | 460 ms | 484 ms | 557 ms |

- **Measured, built server, 40 sessions, three separate runs (box loaded):**
  - Undo of the newest event took 2.0, 2.4 and 2.9 s.
  - Max event-loop delay was 3.0 to 4.7 s in those runs.
  - The GM received a 1.41 to 1.44 MB `reset` notifications frame, and each player a 355 KB one.
  - The first Change Log request afterwards took 0.86, 1.03 and 1.25 s.
- **Projected impact at 40 sessions.** Every correction of a mistaken award freezes all five clients for about 2 s, and again when the Change Log is opened. Undo is the tool the GM reaches for when something goes wrong mid-session, so it is the worst time to freeze. D76's "undo is rare" holds, but the 20 ms figure does not hold past about 10k events (roughly 25 to 30 sessions at my rate).
- **Fix direction.**
  - Undo of the newest event can pop its derived notifications from the cache instead of refolding.
  - Send the GM and players a small `{undoneSeqs}` instead of a full `reset`.
  - Maintain the change log incrementally across undo (rows keyed by seq, flag the undone one).
  - Find why `notificationHistory` and the change-log build rise faster than linearly between 20 and 30 sessions; I did not root-cause it.
- **Confidence:** High that it grows and blocks. Medium on the exact curve (noisy box).

### perf-3 · Medium · No heartbeat or backpressure: one sleeping or stalled phone makes server memory grow without bound

- **Where:** `apps/server/src/server.ts:305-307` (`socket.send` with no `bufferedAmount` check) and `hub.ts:297`. There is no ping/pong or terminate in the server except at shutdown (`server.ts:378`). A grep finds no `bufferedAmount`, `ping` or `heartbeat` handling in `apps/server/src`.
- **Measured (`--slow=2`, 2 of 4 player sockets paused, 40 sessions, 300 commands):**
  - RSS went 198 MB to 550 MB, with a peak of 662 MB.
  - Post-GC heap was 379 MB, against 50 MB in the same run shape with no stalled clients.
  - That is about 165 MB retained per stalled client over 300 commands, roughly one full view per command.
  - Two `SimpleWriteWrap` handles were still pending at the end.
- **Projected impact at 40 sessions.** A phone that locks its screen and freezes the tab keeps its TCP connection open, so the server keeps queueing about 0.5 MB per command for it. Three or four sleeping phones over a long lull reach hundreds of MB of server memory. Inferred, not measured: on wake the phone is handed every queued stale view in order, each parsed and rendered, which may freeze or crash the phone's tab.
- **Fix direction.**
  - When `socket.bufferedAmount` exceeds a threshold, stop queueing per-command views for that socket, mark it dirty, and send one fresh view when it drains.
  - Add a ws ping every 15 to 30 s and `terminate()` after 2 missed pongs.
- **Confidence:** High on the memory growth. Medium on the real-phone wake-up behaviour.

### perf-4 · Medium · The GM console re-renders everything on each state frame; `skillPairCounts` is the hot spot and grows with practice

- **Where:**
  - `apps/web/src/gm/EvolutionBuilder.tsx:52` (`evolutionPlan` for every character on every render).
  - `apps/web/src/gm/evolutionBuilderModel.ts:101` and `:159` (both call `skillPairCounts`).
  - `packages/engine/src/practice/model.ts:111` (`skillPairCounts` → `repeatedEntryIds`, a `JSON.stringify` and regex per practice entry on every call).
  - `apps/web/src/gm/GmScreen.tsx:1083` (`feedRows`), with no memoisation across the heavy panels and windows kept mounted on hidden tabs.
- **Measured (CDP, GM console, per command):**

  | Sessions | Main thread | Script | Heap | Listeners |
  |---|---|---|---|---|
  | 10 | 268 ms | 231 ms | 9 to 16 MB | |
  | 40 | 317 ms | 266 ms | | |
  | 40, Table view open | 338 ms | | 42 to 46 MB | 12.7k |

  - The CPU profile at both sizes has `skillPairCounts` as the top self-time function, and its share grew about 3x from 10 to 40 sessions.
  - Most of the cost is a large fixed per-frame render, which is why the total moves only 18% while practice entries grow 3x.
  - Absolute values are inflated by the loaded box.
- **Projected impact at 40 sessions.** About 0.3 s of main thread per command on the GM console, so a burst of 20 commands (an import applies one command per entry) freezes the console for several seconds. It shares the laptop's CPU with the server (about 50 ms per command), so both slow each other. Noticeable from about 10 sessions because the fixed cost is already large.
- **Fix direction.**
  - Memoise `skillPairCounts` and `repeatedEntryIds` by `state.practice` identity (WeakMap), or have the reducer keep the pair counts.
  - Do not render windows that are not visible.
  - Give heavy panels `React.memo` over narrow props.
- **Confidence:** Medium (profile is real, absolute milliseconds are load-inflated).

### perf-5 · Medium · Player phone render and DOM grow with the campaign (full notes list, no paging, dead practice data)

- **Where:**
  - `apps/web/src/player/NotesPanel.tsx:65` (all `visibleNotes` rendered) and `:334` (`editedLabel` per row, using `toLocaleTimeString` or `toLocaleDateString`; helper at `player/notes.ts:94`).
  - `PlayerScreen.tsx:1075` (the panel is always mounted, re-rendered on every view frame, no memo).
  - Other unbounded lists: inventory credits and trades.
- **Measured, phone page, 4x CPU throttle:**

  | Sessions | Main thread per command | Script | DOM nodes |
  |---|---|---|---|
  | 10 | 90 ms | 62 ms | 1,665 |
  | 40 | 218 ms | 165 ms | 4,081 |

  - `editedLabel` costs about 0.05 ms per row, so one NotesPanel render at 700 notes is 38 ms in node (104 ms in an earlier loaded run). That is 150 to 600 ms on a mid phone.
  - Parse cost is small: view JSON.parse is 0.5 ms (10 sessions) to 1.7 ms (40 sessions) in node.
- **Projected impact at 40 sessions.** About 220 ms of main thread per command on a throttled phone, running about 0.6 times per command. The sheet stays usable, but scrolling and taps stutter during a burst, and the page weighs 2.5x more than at 10 sessions. A player who writes more than my generator's 16 notes per session hits it sooner.
- **Fix direction.**
  - Page or virtualise the notes list.
  - Memoise labels, or format one `Intl.DateTimeFormat` once.
  - `React.memo` the panels.
  - Stop shipping `view.practice` beyond 8 entries (also fixes part of perf-1).
- **Confidence:** Medium. The 4x throttle is a rough phone proxy.

### perf-6 · Low · Ending a session blocks the event loop for about 1 s at 40 sessions; backups copy everything each time

- **Where:**
  - `apps/server/src/server.ts:162` (`store.backup(...)` in the `sessionEnded` hook).
  - `apps/server/src/store.ts:528-561` (`backup()`: `writeSnapshot`, `copyFileSync` of the log and snapshot, fsyncs, portraits copied every time, never pruned).
  - Session report build at `packages/engine/src/report/sessionLog.ts:552`.
- **Measured:**
  - `session.end` took 230 ms (10 sessions), 689 ms (20) and 1,239 ms (40); other 40-session runs gave 846 to 1,411 ms.
  - Engine-only report build is 27 ms at 10 sessions and 487 ms at 40.
  - The maximum event-loop delays in the soak runs (222, 774 and 1,324 ms) match these times, so session end, not routine commands, is the longest stall in a normal session.
  - Each backup copies about 6.9 MB at 40 sessions (log plus snapshot, plus portraits). Cumulative backup disk is roughly 140 MB by session 40, which is fine.
- **Projected impact at 40 sessions.** A visible hang of about 1 s on "End session". The disk cost is not a problem.
- **Fix direction.**
  - Do the copy and fsync work off the request path.
  - Reuse the cached pre-sitting fold more broadly in the report.
  - Optionally prune old backups.
- **Confidence:** High for timings, Low severity.

### perf-7 · Low · (Re)join sends the full state and history, linear in campaign size

- **Where:** `apps/server/src/hub.ts` join path and `sendMissed`.
- **Measured:**

  | Sessions | GM join | Player join |
  |---|---|---|
  | 10 | 1.09 MB (339 ms) | 374 KB (74 ms) |
  | 20 | 1.89 MB (863 ms) | 682 KB (73 ms) |
  | 40 | 3.39 MB (1.08 s) | 1.19 MB (102 ms) |

  - The history alone is 346 KB for a player and 1.4 MB for the GM.
  - A reconnect with `lastSeq` resends only the view (844 to 880 KB at 40 sessions) plus a tiny missed-notifications frame, so the history is not resent. Five reconnects left no extra sockets.
  - In 2 of 5 reconnects two view frames arrived (1.72 MB); a command probably raced the join, but I did not rule out a duplicate.
- **Projected impact at 40 sessions.** A phone that wakes from sleep pulls about 0.9 MB, a few hundred ms on wifi. The GM console opens in about 1 s. Neither is a problem unless phones reconnect often.
- **Fix direction.** Falls out of perf-1 (smaller views). Confirm whether the double view on join is a race or a duplicate.
- **Confidence:** High on sizes. Low on the double-view cause.

### perf-8 · Low · Co-DM prompts and the listen panel scale with the unread backlog or session length

- **Where:**
  - `apps/server/src/ai/practiceDrafts.ts:130-139` and `:217-231` (`draftPrompt` joins every unread transcript line; `maxTokens` is 2000 for output only).
  - `apps/server/src/ai/notesRoutes.ts:72` and `:94` (`takeNotes` over everything unread).
  - `apps/server/src/ai/practiceRoutes.ts:19` (`readTranscript`: a sync read and parse of the whole session file per call; per session, so bounded).
  - `apps/server/src/speech/routes.ts:75`, `:113` and `:133` (`heard` map holds all lines of the run; `/api/gm/listen` returns all lines).
  - `apps/web/src/gm/ListenPanel.tsx:250` (`lines.map`, not virtualised; poll gated by `listenPollNeeded`, 2 s).
- **Measured.**
  - The listen response is 225 KB at 2,000 lines and 451 KB at 4,000, at 3 to 18 ms server time per poll.
  - The prompt size is an estimate, not measured: a 4,000-line backlog is roughly 300 to 450 KB, or about 80 to 110k tokens, in one call if the GM drafts only at the end of the night.
  - Transcript files are per session, about 0.45 MB each. About 18 MB over 40 sessions is not a concern.
- **Projected impact at 40 sessions.** A 4-hour session fits current limits. A much longer session, or a GM who never uses the periodic draft, gets slow and costly co-DM calls and a heavy listen panel. Sessions are independent, so nothing grows across the campaign.
- **Fix direction.** Chunk or cap the unread window (for example the last N lines plus a running summary). Return only new lines from `/api/gm/listen` by index.
- **Confidence:** Medium (prompt size estimated).

## Measured as fine

- **Heap and handle leaks:**
  - Server post-GC heap after 600 commands is 33.4, 37.4 and 42.1 MB at 10, 20 and 40 sessions. The RSS sawtooth has no upward trend inside a run.
  - 5 reconnects (one every 15 commands) left `TCPSocketWrap` at 6 at the end against a baseline of 5 (one socket still closing) and caused no duplicate subscriptions.
- **Browser leaks over 450 commands (10-session campaign, GM console plus phone, GC'd):**
  - GM heap 13.1 to 14.4 MB with constant listeners (3,817) and constant nodes.
  - Phone heap 5.0 to 5.7 MB with constant listeners (396).
  - Phone nodes rose about 0.5 per command, consistent with the unbounded inventory-credits list (one row per `holdings.adjust`).
- **Frames per command:** about 1.05 for the GM and 0.45 to 0.65 per player; unchanged views are not resent. Notifications frames are tiny (0.1 to 0.2 KB per command).
- **Client helpers (node, 40 sessions, best of 7):**
  - GM `feedRows` 6 ms.
  - GM `known`-set rebuild in `apps/web/src/live.ts:289` 9.3 ms (1.2 ms for a player).
  - Player `filterHistory` 0.06 ms.
  - JSON.parse of the GM state 5.5 ms.
  - Linear, so fine now. The GM `known` rebuild would reach 25 to 30 ms around 100 sessions.
- **Startup and resume:**
  - Time to listening was 0.85 s (10 sessions) and 1.86 s (40), on a loaded box.
  - Engine resume from snapshot is 40 to 103 ms.
  - Full replay (when the snapshot is invalid) is 55 to 588 ms.
- **Snapshot cadence:** every 100 events at 2.1 MB serialises in about 22 ms at 40 sessions, which is under 0.3 ms per command amortised. This excludes fsync cost; a slow or antivirus-scanned Windows disk could add tens of ms once per 100 commands (not measured).
- **Append cost:** engine append is 0.02 to 0.1 ms per command at 13k events.

## Probes (all in `/home/claude/review/perf/perf-probes/`, untracked)

- Data generation:
  - `gen.ts`
  - `gen-smoke.ts`
  - `make-campaign.ts <sessions> <perSession> <dataDir>`
- Engine and browser-helper growth:
  - `growth.ts` → `/tmp/perf-out/growth.json`
  - `breakdown.ts <events.jsonl>`
  - `webcost.ts`
  - `notes-label-bench.ts`
  - `vad-bench.ts`
- Server soak:
  - `preload.mjs` (event-loop delay, memory, handles)
  - `soak.mjs <dataDirCopy> <steps> <label> [--reconnect=N] [--thinkMs=N] [--viewAs=1] [--slow=K] [--keep]`; logs and JSON in `/tmp/perf-out/` (`soak{10,20,40}`, `viewas40`, `slow40`, `reconnect40`)
- Browser:
  - `browser.mjs`
  - `browser-leak.mjs <dataDirCopy> [commands]`
  - `gm-profile.mjs`
- Co-DM:
  - `listen-probe.mjs`
- Data and logs outside the repo: `/tmp/perf-data-{10,20,40}`, `/tmp/perf-run-*`, `/tmp/perf-out/`.
- Re-run recipe: `npm run build` (output is git-ignored), then copy a `/tmp/perf-data-N` directory and point `soak.mjs` or `browser.mjs` at the copy.

## Not measured

- Real Windows disk and antivirus fsync costs.
- A real phone's wake-up behaviour after a long stall (perf-3 impact is inferred).
- Campaigns above 40 sessions; all extrapolation is linear from 10, 20 and 40.
- Browser cost of the listen panel at thousands of lines.
