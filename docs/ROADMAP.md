# Roadmap

Work top to bottom. An item is checked only when its acceptance criteria pass
**and** its adversarial review is clean (LOOP §6). `[~]` = provisional
(reviewed without a second model); the milestone review must confirm it.

## Global rules (apply to every item)

- `npm run check` (typecheck + lint + unit) and all existing e2e specs exit 0.
- Engine line coverage ≥ 90% from M1.4 on.
- Every UI or GM item ships a Playwright spec named `e2e/<ITEM-ID>.spec.ts`
  that exercises its acceptance, plus screenshots in
  `docs/screens/<ITEM-ID>/` at 1366×768 (and 390×844 for player screens).
  A reviewer rejects a UI item without them.
- Each milestone ends with an `Mx.A` item that runs the milestone acceptance
  and gets the `fable` review.
- No GM-only data in any player-bound WebSocket frame or HTTP response
  (canary test from M2.2 on).
- From MS on, each `Mx.A` item ends by pushing `main` to the `release`
  branch so Luke gets a fresh preview build after every milestone.
- Work order is the order of this file, not the numbering: M0 → M1.1–M1.5 →
  M1.13 → M2.1–M2.3 → MS → M1.6 onward.

---

## M0 — Foundation

- [x] **M0.1 Monorepo scaffold.** npm workspaces: `packages/engine`,
  `apps/server`, `apps/web`, `apps/desktop` (placeholder until M10). TS strict
  with `moduleResolution: Bundler`; engine consumed as source (no engine
  build step). ESLint (bans `.skip`/`.only`/`@ts-ignore`/`eslint-disable`),
  Prettier, Vitest, Playwright using `/opt/pw-browsers/chromium` when present.
  Server bundled with esbuild. Root scripts: `dev`, `build`, `check`, `e2e`,
  `test:coverage`. `.npmrc`/scripts set `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.
  *Accept:* clean clone → `npm ci && npm run check && npm run build` succeed;
  `npm run e2e` runs `e2e/M0.1.spec.ts`, which loads the web app through the
  server on a random port.
- [x] **M0.2 CI.** GitHub Actions on push/PR (ubuntu): install, check, build,
  e2e (CI installs its own Chromium). `paths-ignore: docs/**` so lock and
  progress commits don't trigger runs. No desktop builds.
  *Accept:* latest completed run on main is green.
- [x] **M0.3 LAN server skeleton.** Fastify serves the web build and a
  WebSocket at `/ws`; binds `0.0.0.0`, default port 30333 (configurable);
  `/health`; logs LAN IPv4 join URLs on start.
  *Accept:* integration test on a random port: `/health` 200; a WS client
  receives `hello`.

## M1 — Rules engine (`packages/engine`, pure, deterministic)

- [x] **M1.1 Rules config.** Zod schema with every DESIGN default, a
  `configVersion`, and migration hook. *Accept:* defaults parse; invalid
  configs give readable errors; snapshot of defaults.
- [x] **M1.2 Character model.** Stats, tracks, grade, derived pools, tenths
  formatting, Identify (Common) at creation. *Accept:* track/grade rules from
  DESIGN §2 incl. caps at 4/14/49/99/149/199/240; pool formulas; formatting.
- [x] **M1.3 Event-sourced core.** Commands → validated events → reducer.
  Events carry id, timestamp, actor, sessionId, `schemaVersion`; upcasters for
  old versions. Undo = compensating event; undoing a non-latest event is
  rejected when the result would be invalid. A committed golden event log
  (`packages/engine/test/golden/*.jsonl`) must replay in `check`.
  *Accept:* replay equals incremental state (property test, fixed seed); undo
  tests per event type; golden replay.
- [x] **M1.4 XP and leveling.** Class/profession XP; integer share splits
  (largest remainder; shares always sum to the award); participant
  selection; above-level bonus; XP curve by current grade; class spread by
  class weights (largest remainder); free points per race level; race level
  floor average. *Accept:* split and spread sums exact; all-tracks-equal
  simulation reproduces 194 @14, 614 @49, 1,514 @99, 2,864 @149, 4,864 @199,
  7,324 @240; diverging-tracks test (class 30, profession 10 → race 20,
  correct free points and spread).
- [x] **M1.5 Free points.** Per-level batches assigned once then locked; GM
  override. *Accept:* reassigning a locked batch is rejected; the next level
  grants a new unlocked batch; override is undoable.
- [x] **M1.13 Player projection.** (built early; extend it with every later feature) Player view: own sheet in full; party
  limited (name, race/class, levels, pool bars); hidden quests/stability
  removed; Identify text resolved to the viewer's tier; GM notes and others'
  private notes excluded. *Accept:* canary strings seeded into every GM-only
  field never appear in any projection across 1,000 random states (fixed
  seed).

## M2 — Server and sync

- [x] **M2.1 Persistence.** Append-only JSONL event log + snapshots in a data
  directory; fsync; tolerant of a torn last line; backup at session end;
  campaign export/import with secrets (tokens) stripped. *Accept:* restart
  keeps state; torn-line test; export→import round trip identical; no secret
  in exports.
- [x] **M2.2 Live protocol and authority.** Zod-typed messages. Clients join
  as a character (no password) or as GM (GM key required, injected by the
  desktop app; never in join URL/QR). Origin check on WS upgrade; GM HTTP
  routes deny by default. Players may only act on their own character (free
  points now; nicknames, notes, gifts/trades, practice submissions, montage
  focus and Identify as those features land). Server pushes filtered updates and notifications;
  reconnect resumes without gaps. *Accept:* GM + 2 player clients; canary test
  over every player WS frame and HTTP body; GM command without key rejected;
  cross-character action rejected; reconnect test; address/origin checks unit
  tested as pure functions (incl. `::ffff:192.168.1.5`).
- [x] **M2.3 Join helper.** LAN IPv4 list, join URL, QR SVG. *Accept:* unit
  tests; QR decodes to the URL.

## MS — Walking skeleton and first preview build

A thin end-to-end slice so Luke can run the app early and watch GM changes
land on player screens. Later milestones replace these minimal screens with
the full ones.

- [x] **MS.1 Minimal GM screen.** Create a character from one built-in
  starter class; award XP with the even split; send a System broadcast.
- [ ] **MS.2 Minimal player screen.** DESIGN §9 core rows (name, race, class,
  levels, pools, nine stats in tenths, free points) and the live DING feed.
- [ ] **MS.3 Perspective switcher.** In the GM app, a "View as" bar:
  [GM] [each character] [Table view]. Character views and the Table view's
  panes are real player clients (no GM key, player projection only), so what
  Luke sees is exactly what that player sees. Table view shows the GM console
  plus up to 4 player panes side by side, all live. Also works from any
  browser on the host at `http://localhost:30333`.
  *Accept:* e2e: in Table view, the GM awards XP and every affected player
  pane shows the DING within 1 s; the canary test passes on every pane.
- [ ] **MS.4 Demo campaign.** GM menu "Load demo campaign": 4 characters at
  different grades (G, F, E, D) with skills, titles, items and a quest with
  World Stability, for trying things out. Never mixes into a real campaign.
- [ ] **MS.5 Desktop wrapper (preview).** Pulls M10.1 forward: double-click
  starts the server and opens the GM window with the GM key injected; join
  URL + QR shown; data in the OS app-data folder.
- [ ] **MS.6 Preview release.** Pulls M10.2 forward: the release workflow
  builds Windows (portable exe + installer), macOS (dmg, unsigned) and Linux
  (AppImage) on push to the `release` branch and publishes a GitHub Release
  named `preview-<date>`.
  *Accept:* latest release workflow run is green with all artifacts.
- [ ] **MS.A Milestone acceptance and review.** Then push `main` to
  `release` so Luke gets the first build.

## M1 (continued) — Rules engine

- [ ] **M1.6 Titles and bonuses.** Flat and percentage bonuses, percentage
  cap, documented order (base → flat → percent → cap). *Accept:* stacking and
  cap tests.
- [ ] **M1.7 Items and economy.** Item definitions (rarity, effects), rarity
  edits, inventories, 12 equipment slots (2 rings, necklace, chest, legs,
  boots, bracers, mask, cloak, gloves, main hand, off hand), currency, gifts
  and two-sided trades between characters and the GM. *Accept:* atomic
  transfers; no negative balances or stacks; equip rules; item effects reach
  effective stats via M1.6 order; trade accept/decline/cancel.
- [ ] **M1.8 Practice log and notes.** Practice entries (character, action,
  skill/stat, tags, source GM/player/montage), repeat detection, skill-pair
  counts, alerts (selection within 5 levels, merge at 3 joint uses). Notes:
  private journal, party notes, GM notes, tags, shareable flag, search.
  *Accept:* alert and pair-count tests; GM cannot read unshared private notes.
- [ ] **M1.9 Skills.** Rarity ladder, Unique tag, nicknames, mastery marks
  (one per skill per session; end-of-session review), thresholds, grade
  ceilings with banking, upgrades, merges (uses M1.8 counts; both ≥ Uncommon;
  one per grade; +1 rarity; originals consumed; marks reset). *Accept:* one
  test per rule incl. every rejection path.
- [ ] **M1.10 Selections and evolutions.** Selections from class level at
  DESIGN intervals with capstone flags; capstone menus must contain an option
  at the grade ceiling; profession options inside class menus. Evolution:
  available at grade top (`evolutionGate` config) → GM release → options →
  choice → new grade, banked XP applied, optional spread reshape, skill
  transforms; profession unlock at E starting at class level. *Accept:* 0→240
  simulation yields exactly 29 selections, capstones at 10/45/90/140/190/240;
  levels freeze at caps and banked XP applies after evolution; evolution
  impossible without GM release; both gate modes tested.
- [ ] **M1.11 Resolution and clocks.** Ratio odds with injectable RNG; three
  grade-gap modes (none; per-grade multiplier on the stat value; lower-grade
  side ÷3); progress clocks; montage eligibility. *Accept:* 10,000-roll test
  within ±2% for 1:1, 2:1, 3:1, 10:1 in each mode; clock/montage tests.
- [ ] **M1.12 Quests and World Stability.** Quest text, timers, day counter,
  stability rules (action tag → delta), clamp 0–100, manual nudge, visibility
  flag. *Accept:* rule, clamp and visibility tests.
- [ ] **M1.14 Campaign simulation.** 40 sessions, 4 characters, ~6 levels per
  session, random valid play (fixed seed). *Accept:* DESIGN check values; 29
  selections each; evolutions at thresholds; invariants hold; coverage ≥ 90%.
- [ ] **M1.A Milestone acceptance and review.**

## M2 (continued) — Server and sync

- [ ] **M2.4 Session log autosave.** Running log (DESIGN §7 "Logging for
  Claude") written to the exports folder every 5 minutes and on shutdown.
  *Accept:* file appears and grows during a scripted session; contains no
  GM-private notes unless GM-flagged for export.
- [ ] **M2.A Milestone acceptance and review.**

## M3 — Player app (browser)

- [ ] **M3.1 Join screen.** Character list (portrait, name, grade); pick one;
  remembered in localStorage (try/catch).
- [ ] **M3.2 Status screen.** DESIGN §9 layout, live updates.
- [ ] **M3.3 Notifications and history.** Book-style DING feed, queued
  animation, optional sound; full history back to day 1, searchable and
  filterable.
- [ ] **M3.4 Free points.** Allocate a batch, confirm, locked.
- [ ] **M3.5 Skill detail.** Rarity color, description, flavor, marks
  progress, nickname edit (official name always shown).
- [ ] **M3.6 Skill selection.** Pending badge, offers side by side, choose.
- [ ] **M3.7 Inventory, gifts, trades.** Equip; give items/currency to a
  character or the GM; propose/accept/decline trades; incoming notices.
- [ ] **M3.8 Quest log.** Text, days left, stability gauge when visible.
- [ ] **M3.9 Identify.** Choose a known entity; show tier text.
- [ ] **M3.10 Notes.** Private journal (markdown, shareable toggle), live
  party notes, tags, search.
- [ ] **M3.11 Practice and montage.** Submit practice entries; enter montage
  focus when offered.
- [ ] **M3.12 Party view.** Names, race/class/level, pool bars.
- [ ] **M3.13 Table extras.** Contest result pop-up; hunger tracker when
  enabled; evolution screen (options, warnings, choose).
- [ ] **M3.A Milestone acceptance and review.** All M3 specs pass at both
  viewports with zero console errors.

## M4 — GM console

- [ ] **M4.1 Skill library.** Create/edit skills: rarity, tags, description,
  flavor, effects text.
- [ ] **M4.2 Class, race and profession libraries.** Starting classes (stat
  weights + 3 starting skills), Human race, professions; seed a default set.
- [ ] **M4.3 Campaign and sessions.** Create campaign; start/end session (end
  = backup + full session report); in-game day counter.
- [ ] **M4.4 Character creation.** Name, starting class, portrait; Identify
  added automatically.
- [ ] **M4.5 Party dashboard.** Card per character with flags (pending
  selection/evolution/marks/merges); full sheet edit as audited events.
- [ ] **M4.6 XP award dialog.** Amount, class or profession, participant
  checkboxes, even integer split by default with auto-balanced last share,
  editable shares, above-level bonus toggle, level-up preview, "typical
  session ≈ 6 levels" helper, confirm.
- [ ] **M4.7 System broadcast.** System-style message to one or all; now or
  scheduled.
- [ ] **M4.8 Change log and undo.** Filterable event list; undo with M1.3
  rules.
- [ ] **M4.9 Rules settings.** Edit every config value as events, with
  validation and reset to defaults.
- [ ] **M4.A Milestone acceptance and review.** GM creates 3 characters,
  awards XP with a custom split; each player screen shows the DING within
  1 s; undo reverts it everywhere.

## M5 — Skills and practice tools (GM)

- [ ] **M5.1 Offer builder.** Per-character menu builder beside the practice
  log; capstone check; profession options; send.
- [ ] **M5.2 Evolution builder.** Options, warnings, transforms, spread
  reshape; release.
- [ ] **M5.3 Marks review.** End-of-session queue; upgrade prompts.
- [ ] **M5.4 Merges.** Alert, build, send.
- [ ] **M5.5 Practice capture.** Quick-add with shortcut; end-of-scene
  prompt; review of player submissions.
- [ ] **M5.A Milestone acceptance and review.** Full selection, evolution,
  mark-upgrade and merge loops between GM and player.

## M6 — Items, titles, economy (GM)

- [ ] **M6.1 Item library.** Create/edit, rarity change, give/take.
- [ ] **M6.2 Loot tables.** Define and roll.
- [ ] **M6.3 Currency.** Grants, fines, ledger.
- [ ] **M6.4 Titles.** Library; award with System text.
- [ ] **M6.A Milestone acceptance and review.** Give, trade, loot roll, title
  award end to end.

## M7 — Quests, encounters, bestiary

- [ ] **M7.1 Quest manager.** Text, timers, stability rules, nudges,
  visibility.
- [ ] **M7.2 Bestiary and NPCs.** Grade, level, stats, Identify tiers, notes.
- [ ] **M7.3 Encounter panel.** Ratio-odds roller (stats + mode), pool
  damage/heal, progress clocks, montage trigger.
- [ ] **M7.4 Trackers.** Hunger (fades at E-grade by default), regions,
  survivor factions.
- [ ] **M7.A Milestone acceptance and review.** Sample encounter end to end;
  stability visible to players only when toggled on.

## M8 — Look and feel

- [ ] **M8.1 Metallic grade themes.** Tokens for aluminum (dull), bronze
  (dull), copper, silver, gold, platinum (cool blue-white, heavier brushed
  texture), prismatic diamond (animated; respects reduced motion).
  System-window styling per DESIGN §9.
- [ ] **M8.2 Evolution transition.** Animated re-theme on evolution.
- [ ] **M8.3 Accessibility.** Text contrast ≥ 4.5:1 in all 7 themes
  (automated); silver vs platinum ΔE ≥ 10 (automated); keyboard navigation;
  reduced motion.
- [ ] **M8.4 Sound.** Original sounds generated in code (DING, selection,
  evolution); volume and mute.
- [ ] **M8.A Milestone acceptance and review.** Screenshots of every theme in
  `docs/screens/themes/`, viewed by the reviewer.

## M9 — Claude bridge and content packs

- [ ] **M9.1 Session report.** Full markdown + JSON report at session end
  (builds on M2.4); "Copy for Claude" button.
- [ ] **M9.2 Content format.** JSON schemas for skill offers, skills, items,
  titles, evolution options, bestiary entries; `docs/CONTENT-FORMAT.md` with
  examples.
- [ ] **M9.3 Import with approval.** Invalid files show errors and change
  nothing; GM approves what applies.
- [ ] **M9.4 Optional GitHub sync.** Token stored in OS app data only, never
  exported. Session end pushes the report to `campaign/sessions/`; pulls
  `campaign/inbox/*.json` into the import queue. Off by default. Tested
  against a mocked API.
- [ ] **M9.5 Tutorial content pack.** DESIGN §8 as an importable pack.
- [ ] **M9.A Milestone acceptance and review.**

## M10 — Desktop app (double-click)

- [ ] **M10.1 Electron wrapper (final).** Builds on MS.5. Double-click starts the server and opens
  the GM console with the GM key injected; shows join URL + QR; data in the
  OS app-data folder; single instance; backup on quit; Windows firewall help.
  *Accept:* launches under `xvfb-run` in the workspace; `/health` responds;
  GM window connects with the key; a plain browser client cannot act as GM.
- [ ] **M10.2 Packaging and releases (final).** Builds on MS.6. electron-builder: Windows NSIS + portable,
  macOS dmg (unsigned), Linux AppImage. A release workflow runs on push to
  the `release` branch (tags cannot be pushed from build sessions) and
  creates the GitHub Release itself. *Accept:* AppImage builds and launches
  under `xvfb-run` locally; the release workflow's latest run is green with
  all three artifacts (check via the repo-scoped Actions read API).
- [ ] **M10.A Milestone acceptance and review.**

## M11 — Hardening and docs

- [ ] **M11.1 Soak test.** 1 GM + 4 player clients, 2,000 random valid
  commands (fixed seed): no desync, no crash, heap growth < 20% after warm-up.
- [ ] **M11.2 Recovery.** Server restart mid-session; client reconnect;
  simulated power loss on the event log.
- [ ] **M11.3 Performance.** Player sheet interactive < 2 s on localhost
  (Playwright timing); 50,000-event log loads < 3 s.
- [ ] **M11.4 Guides.** `docs/GM-GUIDE.md`, `docs/PLAYER-QUICKSTART.md` (one
  page), `docs/TROUBLESHOOTING.md` (firewall, IP, ports, unsigned-app
  warnings on Windows and macOS).
- [ ] **M11.5 Final review.** Whole-repo review by a different model; every
  High/Medium fixed; no `[~]` boxes remain; `docs/DONE.md` written.
