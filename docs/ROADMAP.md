# Roadmap

Every item has acceptance criteria. An item is checked only when its criteria
pass **and** its adversarial review is clean (see LOOP.md). Work top to bottom;
an item may be split into smaller commits, but the box is checked once.

Global targets that must hold after every item:
- `npm run check` (typecheck + lint + unit tests) exits 0.
- `npm run e2e` exits 0 for all e2e specs that exist.
- Engine line coverage ≥ 90% (from M1.4 on).
- No unresolved High or Medium review findings.

---

## M0 — Foundation

- [ ] **M0.1 Monorepo scaffold.** npm workspaces: `packages/engine`,
  `apps/server`, `apps/web`, `apps/desktop`. TypeScript strict, ESLint,
  Prettier, Vitest, Playwright (Chromium at `/opt/pw-browsers`, no download).
  Root scripts: `dev`, `build`, `check`, `e2e`, `test:coverage`.
  *Accept:* from a clean clone `npm ci && npm run check && npm run build`
  succeeds; `npm run e2e` runs one smoke spec that loads the web app through
  the server.
- [ ] **M0.2 CI.** GitHub Actions on push/PR (ubuntu): install, check, build,
  e2e (CI installs its own Chromium). Desktop builds are NOT run here.
  *Accept:* workflow is green on `main` (verify with
  `GH_TOKEN= gh api repos/luke59neilson-oss/the-system/actions/runs?per_page=1`).
- [ ] **M0.3 LAN server skeleton.** Fastify serves the built web app and a
  WebSocket at `/ws`; binds `0.0.0.0:30333` (configurable); `/health`; logs
  every LAN IPv4 join URL on start.
  *Accept:* integration test starts the server on a random port, `/health`
  returns 200, a WS client connects and receives a `hello` message.

## M1 — Rules engine (`packages/engine`, pure TypeScript, no I/O)

- [ ] **M1.1 Rules config.** Zod schema holding every default in DESIGN.md
  (grades, thresholds, intervals, budgets, XP curve, mark thresholds,
  ceilings, caps, resolution modes, slots, currency name). Versioned.
  *Accept:* defaults parse; invalid configs rejected with readable errors;
  snapshot test of the default config.
- [ ] **M1.2 Character model.** Stats, tracks, grade from race level, derived
  pools, tenths display helper, Identify (Common) as starting race skill.
  *Accept:* grade boundary tests (4→G, 5→F, 14→F, 15→E, 49→E, 50→D, 99→D,
  100→C, 149→C, 150→B, 199→B, 200→A); pool formulas; tenths formatting.
- [ ] **M1.3 Event-sourced core.** Commands → validated events → reducer.
  Every event has id, timestamp, actor, sessionId. Undo = compensating event.
  *Accept:* replaying the event log reproduces incremental state exactly
  (property test over random command sequences); undo restores prior state
  for every event type.
- [ ] **M1.4 XP and leveling.** Class/profession XP awards; even split with
  largest-remainder rounding; custom percentages; participant selection;
  above-level bonus; per-grade XP curve; class spread by class weights
  (largest remainder); free points per race level; race level = floor average
  (= class level before a profession exists); levels freeze at evolution
  thresholds and XP banks.
  *Accept:* splits always sum to the award; spreads always sum to the grade
  budget; simulated leveling with all tracks equal reproduces total stats
  194 @14, 614 @49, 1,514 @99, 2,864 @149, 4,864 @199, 7,324 @240; freeze at
  4/14/49/99/149/199; banked XP applies after the evolution.
- [ ] **M1.5 Free points.** Assign once, then locked; GM override event.
  *Accept:* second assignment rejected; override works and is undoable.
- [ ] **M1.6 Selections and evolutions.** Selection triggers at the DESIGN
  intervals with capstone flags; pending selection holds GM-built offers;
  player picks one. Evolution: pending → GM release → options → player choice
  → new grade, optional class-spread reshape, skill transforms. Profession
  unlock at the E evolution starting at the current class level.
  *Accept:* a 0→240 simulation yields exactly 29 selections with capstones at
  10, 45, 90, 140, 190, 240; profession start level test; evolution cannot
  complete without GM release.
- [ ] **M1.7 Skills.** Rarity ladder, Unique tag, nickname, mastery marks
  (one per skill per session), thresholds, grade rarity ceilings with
  banking, upgrades, merges (3 joint logs, both ≥ Uncommon, one per grade,
  +1 rarity, originals consumed, marks reset).
  *Accept:* one test per rule, including every rejection path.
- [ ] **M1.8 Items and economy.** Item definitions with rarity and effects;
  rarity edits; inventories; 12 equipment slots (2 rings, necklace, chest,
  legs, boots, bracers, mask, cloak, gloves, main hand, off hand); currency;
  transfers between characters and the GM.
  *Accept:* transfers are atomic; balances and stacks never go negative;
  equip/unequip rules; item effects reach effective stats.
- [ ] **M1.9 Titles and bonuses.** Flat and percentage bonuses, percentage
  cap, effective stat computation order documented.
  *Accept:* tests for stacking order and cap.
- [ ] **M1.10 Resolution and clocks.** Ratio odds with injectable RNG and the
  three grade-gap modes; progress clocks; montage eligibility (half filled,
  no failures).
  *Accept:* 10,000-roll statistical test within ±2% of expected for 1:1, 2:1,
  3:1, 10:1; clock and montage rules tested.
- [ ] **M1.11 Quests and World Stability.** Quest text, timers, day counter,
  stability rules (action tag → delta), clamp 0–100, manual nudge,
  visible/hidden flag.
  *Accept:* rule application and clamping tests.
- [ ] **M1.12 Practice log.** Entries (character, action, skill/stat, tags,
  source: GM/player/montage), repeat detection, skill-pair counting,
  end-of-session review that produces marks, selection alerts (within 5
  levels), merge alerts.
  *Accept:* tests for each alert and the review output.
- [ ] **M1.13 Visibility projection.** Player view: own sheet in full; party
  view limited (name, race/class, levels, HP/MP/Stamina bars); hidden quests
  and hidden stability removed; Identify text resolved to the viewer's tier;
  GM notes never included.
  *Accept:* property test over random states proves no hidden field ever
  appears in a player projection.
- [ ] **M1.14 Campaign simulation.** Scripted 40-session campaign, 4
  characters, ~6 levels per session, random but valid play.
  *Accept:* all DESIGN check values hold; 29 selections each; evolutions at
  thresholds; no invariant violations; engine coverage ≥ 90% lines.

## M2 — Server and sync

- [ ] **M2.1 Persistence.** Append-only JSONL event log + periodic snapshots
  in a data directory; fsync; tolerant of a torn last line; automatic backup
  at session end; whole-campaign export/import.
  *Accept:* restart test keeps state; torn-line test; export→import round
  trip is identical.
- [ ] **M2.2 Live protocol.** Zod-typed messages; clients join as GM or as a
  character; server pushes filtered state updates and notifications;
  reconnect resumes without missing notifications.
  *Accept:* GM + 2 players test; a player never receives another player's
  private data; reconnect test.
- [ ] **M2.3 GM authority.** GM commands accepted only from loopback
  connections or with a GM key generated at launch. Player commands limited
  to their own character (free points once, nicknames, notes, gifts/trades,
  practice submissions, montage focus, Identify).
  *Accept:* a LAN-address client cannot run any GM command; a player cannot
  act on another character.
- [ ] **M2.4 Join helper.** List LAN IPv4 addresses, build the join URL, QR
  code as SVG.
  *Accept:* unit tests; QR decodes to the URL.

## M3 — Player app (browser)

- [ ] **M3.1 Join screen.** List characters (portrait, name, grade); pick one
  to open the sheet; remembered in localStorage (wrapped in try/catch).
- [ ] **M3.2 Status screen.** Jake-style layout: race/class/profession with
  levels, pools, nine stats in tenths, free points, titles, skills by
  category, equipment summary.
- [ ] **M3.3 Notifications and history.** System-style "DING!" feed with
  queued animation and optional sound; full history timeline back to day 1,
  searchable and filterable.
- [ ] **M3.4 Free points.** Allocate, confirm, then locked.
- [ ] **M3.5 Skill detail.** Rarity color, description, flavor, marks
  progress, nickname edit (official name always shown).
- [ ] **M3.6 Skill selection.** Pending badge, offers side by side, choose.
- [ ] **M3.7 Inventory and gifting.** Equip by click; give items or currency
  to another character or the GM with confirmation; incoming gift notice.
- [ ] **M3.8 Quest log.** Quest text, days left, World Stability gauge when
  visible.
- [ ] **M3.9 Identify.** Choose a known entity; show the tier text.
- [ ] **M3.10 Notes.** Private journal (markdown) and live party notes, with
  tags and search.
- [ ] **M3.11 Practice and montage.** Submit practice entries; enter montage
  focus when a montage is offered.
- [ ] **M3.12 Party view.** Teammates' names, race/class/level, pool bars.
- [ ] **M3.13 Table extras.** Contest result pop-up; hunger tracker when
  enabled; evolution screen (options, warnings, choose).

*M3 acceptance:* Playwright specs cover every screen against seeded state at
1366×768 and 1920×1080; zero console errors; screenshots saved to
`docs/screens/player/`.

## M4 — GM console

- [ ] **M4.1 Campaign and sessions.** Create campaign; start/end session
  (end = backup + session report); in-game day counter.
- [ ] **M4.2 Character creation.** Name, starting class from the class
  library (stat weights + 3 skills), portrait; Identify added automatically.
- [ ] **M4.3 Party dashboard.** Card per character: levels, pools, flags for
  pending selection/evolution/marks/merges; open full sheet; every GM edit is
  an audited event.
- [ ] **M4.4 XP award dialog.** Amount, class or profession, participant
  checkboxes, even split by default, adjustable percentages that must total
  100%, above-level bonus toggle, preview of resulting level-ups, confirm.
- [ ] **M4.5 System broadcast.** Compose System-style messages to one player
  or all; send now or schedule.
- [ ] **M4.6 Change log and undo.** Filterable event list; undo any event.
- [ ] **M4.7 Rules settings.** Edit every config value with validation and
  reset to defaults.

*M4 acceptance:* e2e: GM creates 3 characters, awards XP with a custom split,
each player screen shows the DING within 1 s; undo reverts it on every screen.

## M5 — Skills and practice tools (GM)

- [ ] **M5.1 Skill library.** Create/edit skills: rarity, tags, description,
  flavor, effects text.
- [ ] **M5.2 Offer builder.** Per-character menu builder beside that
  character's practice log; send offers.
- [ ] **M5.3 Evolution builder.** Options, warnings, skill transforms,
  spread reshape; release to player.
- [ ] **M5.4 Marks review.** End-of-session queue: approve/deny marks;
  upgrade prompts when thresholds are reached.
- [ ] **M5.5 Merges.** Alert when unlocked; build merged skill; send to player.
- [ ] **M5.6 Practice capture.** Quick-add with keyboard shortcut;
  end-of-scene prompt; review of player-submitted entries.

*M5 acceptance:* e2e covers the full selection, evolution, mark-upgrade and
merge loops between GM and player.

## M6 — Items, titles, economy (GM)

- [ ] **M6.1 Item library.** Create/edit items, change rarity, give/take.
- [ ] **M6.2 Loot tables.** Define and roll loot tables.
- [ ] **M6.3 Currency.** Grants, fines, ledger view.
- [ ] **M6.4 Titles.** Title library; award with System text.

*M6 acceptance:* e2e for give, trade, loot roll, title award.

## M7 — Quests, encounters, bestiary

- [ ] **M7.1 Quest manager.** Text, timers, stability rules, manual nudges,
  visibility toggle.
- [ ] **M7.2 Bestiary and NPCs.** Grade, level, stats, Identify tiers, notes.
- [ ] **M7.3 Encounter panel.** Ratio-odds roller (pick stats and mode),
  damage/heal to pools, progress clocks, montage trigger.
- [ ] **M7.4 Trackers.** Hunger controls; regions; survivor factions.

*M7 acceptance:* e2e runs a sample encounter end to end and a quest whose
stability changes are visible to players only when toggled on.

## M8 — Look and feel

- [ ] **M8.1 Metallic grade themes.** Design tokens for G dull aluminum,
  F dull bronze, E shiny copper, D shiny silver, C shiny gold, B shiny
  platinum (cool blue-white, heavier brushed texture), A prismatic diamond
  (animated, respects reduced motion). Glowing System-window style.
- [ ] **M8.2 Evolution transition.** Animated re-theme on evolution.
- [ ] **M8.3 Accessibility.** Text contrast ≥ 4.5:1 in every theme
  (automated test); keyboard navigation; reduced-motion support.
- [ ] **M8.4 Sound.** Original, license-free sounds (generated in code) for
  DING, selection, evolution; volume and mute.

*M8 acceptance:* contrast test passes for all 7 themes; screenshots per theme
in `docs/screens/themes/`.

## M9 — Claude bridge and content packs

- [ ] **M9.1 Session report.** On session end, write markdown + JSON to the
  exports folder: practice log, notable actions, notes marked shareable, XP,
  level-ups, pending selections, quest/stability changes. "Copy for Claude"
  button.
- [ ] **M9.2 Content format.** JSON schemas for skill offers, skills, items,
  titles, evolution options, bestiary entries; documented in
  `docs/CONTENT-FORMAT.md` with examples.
- [ ] **M9.3 Import with approval.** Import a content file; validation errors
  shown without changing state; GM approves what applies.
- [ ] **M9.4 Optional GitHub sync.** Settings: fine-grained token + repo.
  Session end pushes the report to `campaign/sessions/`; the app pulls
  `campaign/inbox/*.json` into the import queue. Off by default.
- [ ] **M9.5 Tutorial content pack.** DESIGN §8 as an importable pack: quest,
  stability rules, regions, Identify tiers, the [Rapid Spread] title,
  placeholder Beast Lords.

*M9 acceptance:* round-trip tests; invalid-file test; GitHub sync tested
against a mocked API.

## M10 — Desktop app (double-click)

- [ ] **M10.1 Electron wrapper.** Double-click starts the server and opens
  the GM console; shows the join URL and QR; data in the OS app-data folder;
  single instance; backup on quit; Windows firewall help screen.
- [ ] **M10.2 Packaging.** electron-builder: Windows NSIS installer +
  portable exe, macOS dmg (unsigned), Linux AppImage. Release workflow on tag
  and manual dispatch.
  *Accept:* Linux AppImage builds locally and launches under `xvfb-run` with
  `/health` responding; the release workflow produces all artifacts (verify
  via the repo-scoped Actions API).

## M11 — Hardening and docs

- [ ] **M11.1 Soak test.** 1 GM + 4 player clients, 2,000 random valid
  commands: no desync (client state equals server projection), no crash,
  stable memory.
- [ ] **M11.2 Recovery.** Server restart mid-session; client reconnect;
  power-loss simulation on the event log.
- [ ] **M11.3 Performance.** Player screen interactive < 2 s on LAN; a
  50,000-event log loads < 3 s.
- [ ] **M11.4 Guides.** `docs/GM-GUIDE.md`, `docs/PLAYER-QUICKSTART.md` (one
  page), `docs/TROUBLESHOOTING.md` (firewall, IP, ports).
- [ ] **M11.5 Final review.** Whole-repo adversarial review by a different
  model; every High/Medium fixed; `docs/DONE.md` written.
