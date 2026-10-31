# Security review (lens: security and "players never receive GM-only data")

Worktree `/home/claude/review/security` at origin/main f656f8c2. Time-boxed review; all probes were throwaway vitest files and have been removed (`git status` clean).

**Summary: 0 High, 1 Medium, 3 Low.** The security perimeter held up under probing: GM authority, Host/Origin checks, key handling, projections, notifications and the new co-DM surfaces are sound. The one Medium is a design inconsistency in a newer feature (contest practice logging), not a perimeter break.

## Findings

### security-1 · Medium · A private contest roll tells the player who they rolled against
- **Where:** `apps/web/src/gm/practiceDraftsModel.ts:80-86` (builds the action text `Contest roll against <label> (<Stat>)`), `apps/web/src/gm/Encounter.tsx:111-125` (sends it when the GM *rolls*, not when the GM shares), `packages/engine/src/projection/player.ts` (`practice` is projected to the owner in full, GM-sourced entries included).
- **What is wrong:** D182 says the contest roll "is drawn on the GM's screen and stays private" until the GM presses Share. D243 / MC.7 then logs a practice entry for each PC side at roll time. That entry carries the opponent side's label, and it is player-visible (the Practice log on the sheet shows `action`; `PlayerPractice.action` is projected as typed). So the roll, its stat and the opponent's label reach the player whether or not the GM shares the contest.
- **Failure scenario:** the GM rolls Jake's Perception against an ambusher, label "Hooded Ambusher", and decides not to share (the usual reason for a private roll). Jake's phone gets a new Practice entry "Contest roll against Hooded Ambusher (Perception)" at once, and the GM never chose to show it. For a PC-vs-PC contest the label is `Mira · Agility`, so each player sees which stat the other rolled. The "Players see" field is only meant to be seen if the contest is shared, and the GM has no hint otherwise. Practice entries are silent (no DING), but the panel updates live.
- **Evidence:** probe (`apps/server/test/zzprobe3.test.ts`, removed) calls the real `contestPracticeCommands`, executes the command, then `projectForPlayer`:
  ```
  commands: [{"type":"practice.log","characterId":"jake","action":"Contest roll against Hooded Ambusher (Strength)","stat":"strength","tags":["contest"],"source":"gm"}]
  player practice list: [{"id":"e3",...,"action":"Contest roll against Hooded Ambusher (Strength)","skills":[],"stat":"strength","source":"gm"}]
  contests shared to player: []
  ```
- **Fix direction:** either log the practice only when the GM shares (`contest.shared`), or keep the roll-time entry but with neutral text ("Contest roll (Strength)") and no opponent label. Or tell the GM in the UI. The `contest` tag is hidden from players already, so the text is the only leak.
- **Confidence:** High on the mechanism. Severity is Medium rather than High because the label is nominally "what players see" and the GM controls the text.

### security-2 · Low · `skill.cast` skips the practice-entry cap, so casts pile up unreviewed entries without limit
- **Where:** `packages/engine/src/events/commands.ts:1976-1990` (`overLimit` applies `practiceEntriesPerCharacter` only to `practice.log`), `packages/engine/src/events/reducer.ts:1705-1740` (each cast appends an unreviewed `source: player` practice entry).
- **What is wrong:** the QF.3 cap exists so a player cannot grow the log and their own view without bound. Cast is another player-reachable path that adds practice entries, and it is checked only against the pool.
- **Failure scenario:** a player with a cost-1 spell and a large Mana pool (late-game pools are in the thousands) casts repeatedly (5 per second per socket is allowed). Every cast is a permanent event, an unreviewed row in the GM's review queue and a row in that player's practice list, which is re-sent in every `view` frame. No refusal ever appears.
- **Evidence:** probe with `limits.practiceEntriesPerCharacter: 3`, cost-1 spell, pool 100: `practice.log` is refused from the 4th entry ("Practice log is full (3 entries)") while 8 consecutive `skill.cast` all succeed; final state is 11 player practice entries, 11 unreviewed.
- **Fix direction:** count cast entries in `overLimit` (refuse `skill.cast` once the character's practice count reaches the cap, or exempt cast from the count but cap how many are kept in the view). 
- **Confidence:** High (reproduced). Bounded by the pool, hence Low.

### security-3 · Low · `overLimit` runs on raw command values before shape validation, so a malformed player command throws and is logged as an engine bug
- **Where:** `packages/engine/src/events/commands.ts:1976-2000` (`command.action.length`, `[...(command.skills ?? [])]`, `(command.title ?? '').trim()`), called from `execute` at ~2050 outside the `try`; caught in `apps/server/src/hub.ts` (the `catch` that does `console.error('The System: … failed:', error)`).
- **What is wrong:** `commandSchema` only checks `type`; the real payload validation happens later in `toEvent`/`parseEvent`. `overLimit` therefore dereferences unvalidated fields.
- **Failure scenario:** a player (or a script) sends `{type:'practice.log', characterId:'jake'}`, `skills: 5`, or `note.create` with `title: 5`. Nothing is corrupted and the player gets "The command could not be run", but the hub treats it as an engine bug and writes a stack trace to the server console for every message (up to 5 per second per socket). That buries a real engine error (the M11.5 trace exists to expose those) and clutters the GM laptop's console.
- **Evidence:** probe through the real `LiveHub`: `practice.log` without `action` → `TypeError: Cannot read properties of undefined (reading 'length')`; `skills: 5` → `(command.skills ?? []) is not iterable`; `note.create title: 5` → `(command.title ?? "").trim is not a function`; each answered `"The command could not be run"` and logged by `console.error`.
- **Fix direction:** validate the command's field types (a small zod schema for the three limited commands) before `overLimit`, or guard with `typeof` checks and fall through to the normal "Bad command" refusal.
- **Confidence:** High (reproduced). Hardening only.

### security-4 · Low · Packaged Electron app leaves the default fuses on
- **Where:** `apps/desktop/electron-builder.yml` (no `electronFuses`); `@electron/fuses` is only a transitive dependency in `package-lock.json`.
- **What is wrong:** with default fuses the packaged `TheSystem.exe` still honours `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect*` command-line arguments. Any process running as the GM's Windows user can use the signed app binary as a Node interpreter or attach a debugger to a running copy (the main process holds the GM key and decrypts the Anthropic key through `safeStorage`).
- **Failure scenario:** local only. Another program under the same user could already read the DPAPI-protected key file by calling DPAPI itself, so the gain is small: it can attach to the live main process and read the GM key and the decrypted API key from memory, or run code under the app's identity.
- **Evidence:** configuration read only; I did not build the installer, so the shipped fuse state is **unverified**.
- **Fix direction:** set `electronFuses` in electron-builder (RunAsNode off, EnableNodeOptionsEnvironmentVariable off, EnableNodeCliInspectArguments off, EnableCookieEncryption on); keep the dev/test paths in unpackaged builds.
- **Confidence:** Medium (config-level; not run).

## Already recorded (not repeated as findings; extra data only)
- Per-socket rate limit and no socket cap (QUALITY.md:286 and the Sweep B backlog line). New measurement: 30 sockets from one script, all joined as Jake, sent 900 `skill.nickname` commands; all 900 were accepted in 3.97 s (about 227 events per second, 201 KB of permanent event-log growth, 907 full-state frames pushed to the GM). The limiter really does nothing against a script that opens many sockets. Still the known gap; a per-character or per-address bucket is the fix.
- `PUT /api/gm/ai/key` over cleartext from a LAN GM console; no CSP/frame-ancestors; GM key readable by same-origin View-as frames; no `setPermissionCheckHandler`; `isAllowedHost` ignores text after `]`; static serving allows dotfiles.
- Unshared journal text sits in the raw event log, backups and `/api/gm/export` (D62, accepted).

## Checked and clean
**GM authority and perimeter (probed with raw sockets against a live `createServer`):** no-key, wrong-key, duplicate `x-gm-key` header, `//api`, `/api/%67m`, `/api/./gm/../gm`, `/API`, `;`-suffix, trailing slash, backslash, `%2f`, `%2561`, absolute-form target, HEAD and OPTIONS (no `Access-Control-*` headers anywhere) all give 403/404/400; `/api/characters/` (trailing slash) is not public. `Host: evil.com` → 421 even with a valid key; HTTP/1.0 with no Host → 421. WebSocket: wrong Origin 403, `Origin: null` 403, `Upgrade: WebSocket` mixed case 403, `/WS` and `/ws/` 404, same-origin 101. Static and portrait traversal (`/..%2f`, `/%2e%2e/`, `/portraits/..%2f..%2fLOCK`) never reach a file. Non-/api routes are only `/health`, `/ws`, `/portraits/:file` and static; every co-DM, listen, speaker, reference, changelog, export, join and report route sits under `/api/gm/` behind the hook.

**API key:** only reaches `https://api.anthropic.com` in an `x-api-key` header; stored through `safeStorage` (`anthropic-key.bin`, outside any campaign directory, not in backups/exports/session logs); never in a response body (`status()` returns `hasKey`), error messages go through `redactKey`, the co-DM routes use a scoped error handler that never echoes a body; no Fastify logger in production; Electron has no preload, no `crashReporter`, no webview, `sandbox` + `contextIsolation` on, DevTools off when packaged, navigation locked to the local origin, mic permission only for audio on own pages. The e2e fake cipher cannot save a real key (`sk-ant-e2e-` prefix) and the desktop never reads that env var.

**Players' views:** read all of `projectForPlayer` (allowlist copies), `notificationsBetween`, `gmChangeNotices` and the hub's per-character filtering. Credits history is own-entries only with the GM reason that the GM form labels "the player sees this"; factions are name and standing for revealed ones only (no count or order leak); merge offers, `scenePrompt` (id only), hidden quests (count only), pinned/timed broadcasts (no recipient list), lore (`kind: 'gm'` notes, filtered in both `projectForPlayer` and `loreFor`), contests (whole-percent chance, other side's label only). XP-award reasons are not in any player output. Undo rebuilds and re-filters the notification history per client. Journals: `projectForGm`, change log and session report all drop unshared entries.

**Player commands (probed through the real hub):** prototype-pollution keys (`__proto__`, `constructor`) in allocations, gift/trade bundles, skill, stat and slot names, and a top-level `__proto__` in the frame — nothing polluted (`({}).polluted` undefined), all refused with ordinary messages. Players cannot name another character, create GM notes, forge `source:'gm'` or `session` on practice, take GM-only commands, gift or trade with themselves, send negative/fractional/huge amounts, or use trade-accept errors as a holdings oracle (all answers are the same "That trade can no longer go through"). Cast: cost comes from the library at cast time (int 1..1,000,000, enforced in event schema and reducer), own skill only, own pool, refused when short.

**Co-DM files and routes:** transcript, drafts, suggestions, notes, prepared, quick settings and speaker enrolments are JSON/JSONL in the campaign directory or `co-dm/`, addressed by fixed names or in-file ids (no request-derived path segments); regexes built from names are escaped and bounded; speech model download is SHA-256 pinned and tar extraction flattens names to an allowlist; reference lists exist only in the server bundle (the web app does not import them); no player-facing route or frame carries a summary, draft or lore note. The `listening` frame is a bare boolean.

**Backups and import:** backups copy the log, snapshot and regex-validated portrait names only (`PORTRAIT_REF` is anchored); `importCampaign` validates ids, portrait names, types, sizes and hashes, and has no caller outside tests, so there is no restore or import path reachable from a route.

**Web:** no `innerHTML`/`dangerouslySetInnerHTML`/`eval`; the notes Markdown subset renders React elements only and its regexes are linear; no player-controlled string becomes a URL.
