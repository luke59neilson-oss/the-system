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
- [x] **MS.2 Minimal player screen.** DESIGN §9 core rows (name, race, class,
  levels, pools, nine stats in tenths, free points) and the live DING feed.
- [x] **MS.3 Perspective switcher.** In the GM app, a "View as" bar:
  [GM] [each character] [Table view]. Character views and the Table view's
  panes are real player clients (no GM key, player projection only), so what
  Luke sees is exactly what that player sees. Table view shows the GM console
  plus up to 4 player panes side by side, all live. Also works from any
  browser on the host at `http://localhost:30333`.
  *Accept:* e2e: in Table view, the GM awards XP and every affected player
  pane shows the DING within 1 s; the canary test passes on every pane.
- [x] **MS.4 Demo campaign.** GM menu "Load demo campaign": 4 characters at
  different grades (G, F, E, D) with skills, titles, items and a quest with
  World Stability, for trying things out. Never mixes into a real campaign.
  *Split (D53):* titles, items, quests/World Stability and grades above G
  need M1.6, M1.7, M1.12 and M1.10, which come later in the work order, so
  MS.4 ships the demo as its own campaign (load / back to my campaign) with
  4 characters at different levels, starter skills and the tutorial quest
  text as a System message; M1.15 grows it to the full content.
  *Accept (MS.4):* e2e: load the demo, play in it, go back; the real
  campaign's party, log and export carry nothing of the demo.
- [x] **MS.5 Desktop wrapper (preview).** Pulls M10.1 forward: double-click
  starts the server and opens the GM window with the GM key injected; join
  URL + QR shown; data in the OS app-data folder.
- [x] **MS.6 Preview release.** Pulls M10.2 forward: the release workflow
  builds Windows (portable exe + installer), macOS (dmg, unsigned) and Linux
  (AppImage) on push to the `release` branch and publishes a GitHub Release
  named `preview-<date>`.
  *Accept:* latest release workflow run is green with all artifacts.
- [x] **MS.A Milestone acceptance and review.** Then push `main` to
  `release` so Luke gets the first build.

- [x] **MS.7 Launch polish (do next).** Luke's first try of the preview
  failed to open. Make launching foolproof on Windows: a "Starting The
  System…" window appears within 1 s of double-clicking; a second launch
  brings the running window to the front instead of erroring; if port 30333
  is taken by another program, use the next free port and show it; release
  file names carry the preview date and run number
  (`TheSystem-preview-<date>-<run>-win-x64-portable.exe`) so a new download
  never collides with an older copy that is still open; release notes list
  what changed since the previous preview.
  *Accept:* desktop tests for double launch (second instance exits and
  focuses the first), busy-port fallback and the splash; the release
  workflow's dry run produces the new file names.

## MQ — Luke's answers, batch 1 (2026-10-22)

Rule changes from Luke's answers (DESIGN §2, §4, §6, §7 updated; D97–D109).
They touch finished engine and player items, so they come before M4.4.

- [x] **MQ.1 Evolution rules.** Evolution cannot be released, and a player
  cannot evolve, while any skill selection is pending. Evolution refills
  all pools. Each evolution option carries a GM-set one-time stat bonus.
  Transforms are optional (config `skills.evolutionTransforms` minimum 0).
  *Accept:* engine tests for each rule (new event versions + upcasters,
  golden logs); evolution screen shows the bonus; e2e.
- [x] **MQ.2 Pools follow maxima.** A full pool stays full when its maximum
  rises (level, item, title, evolution bonus); otherwise current is
  unchanged; never refill on level-up; clamp when a maximum falls.
  *Accept:* tests incl. DESIGN §2's 85/100 → 85/120 and 100/100 → 120/120.
- [x] **MQ.3 Passed-over options.** Unchosen menu options stay eligible and
  appear in later menus below the new ones; one pick per selection;
  eligibility rules from DESIGN §6. Player selection screen scrolls through
  older options. *Accept:* engine tests; e2e.
- [x] **MQ.4 Marks carry over.** Excess marks carry into the next rarity
  after an upgrade (incl. banked marks applied after an evolution).
  *Accept:* tests.
- [x] **MQ.5 Grade walls.** New default grade-gap mode per DESIGN §7: same
  grade plain odds; one grade apart lower side ×⅓ in rolls and ⅓ damage; two
  or more apart no roll (higher grade succeeds) and zero damage; no pooling of
  lower-grade power against a higher grade. Encounter tools (M7.3) apply it.
  *Accept:* statistical test for the one-grade case (24% ±2% for DESIGN's
  peak-E vs fresh-D example); deterministic tests for two-plus grades,
  damage scaling and the no-pooling rule.
- [x] **MQ.10 Steep XP curve.** XP per level ×3 per grade (G 100 … A 72,900);
  XP for defeating a target one grade below ×⅓, two or more below 0; the
  "typical session" helper per grade. Config migration with an upcaster for
  existing campaigns. *Accept:* engine tests; the 40-session simulation
  still reaches the DESIGN check values with awards scaled per grade.
- [x] **MQ.6 Tailored professions.** Remove the default profession list from
  the library seed. The GM offers each character their own professions at
  the E evolution; the player may choose "none for now"; a Professions tab
  lists the offers and lets the player take one later; once chosen the list
  locks (greyed). Race level = class level until a profession is taken.
  *Accept:* engine tests; e2e for picking at evolution, declining, and
  picking later from the tab.
- [x] **MQ.7 Hidden quest notice.** Creating a hidden quest sends the
  affected players a System notice that a hidden quest exists, with no
  details. *Accept:* canary test still passes; notice e2e.
- [x] **MQ.8 Identify range.** Lower grade always; higher grade never; same
  grade only if level ≤ 1.5 × the viewer's level; otherwise
  `[??? – lvl ???]`. *Accept:* engine and projection tests; e2e.
- [x] **MQ.9 Windows-first releases.** Luke uses Windows. Release builds
  Windows (portable + installer) and Linux (kept for the automated smoke
  test); drop macOS (macOS Actions minutes count 10×). *Accept:* release
  dry run green with exactly 3 files.
- [x] **MQ.11 XP overflow, no banking.** Replace banked XP: XP for a capped
  track levels the other track; when both are capped (or the class is capped
  with no profession) the XP is lost and the GM's award preview says so.
  Schema bump + upcaster for logs that banked XP (replaced by the
  `rules.xp.overflow` flag, D124: stored campaigns keep banking and replay
  unchanged until M4.9 switches them). *Accept:* engine tests
  (class capped → profession levels; profession capped → class levels; both
  capped → lost and reported); 40-session simulation still passes.
- [x] **MQ.12 Skill library rules.** Library entries keyed by name and rarity;
  an upgrade takes the higher rarity's text; library edits update every copy
  not individually edited by the GM; effects visible to the skill's owner
  only. *Accept:* engine and projection tests (other players never see
  effects); e2e for an upgrade picking up new text and an edit propagating.
- [x] **MQ.13 The books' starting classes.** Replace the default class set
  with DESIGN §10 (weights and starting skills, original text); update the
  built-in Archer, the demo campaign and screenshots. *Accept:* seed tests;
  demo e2e still green.
- [x] **MQ.14 Bonus rules.** Items carry flat stat bonuses only (no
  percentages); total item bonus per stat capped at 20% of base; title
  percentages summed and applied once to (base + capped items); the existing
  title percentages uncapped by default (config may set a cap). Status screen shows a capped item
  bonus as capped. *Accept:* engine tests incl. DESIGN §4's 100 → 138
  example; item definitions with percentages rejected (upcaster for old
  logs); e2e for the capped display.
- [x] **MQ.15 No healing by gear swap.** A pool clamped by a falling maximum
  stays full only if it was full before the drop (DESIGN §2 examples); applies
  to new campaigns and, via the rules setting, older ones. *Accept:* engine
  tests for all four DESIGN §2 examples; property test that equip/unequip
  cycles never raise a non-full pool's current value.
- [x] **MQ.A Batch acceptance and review.**

## QF — Quality fixes (from sweeps, LOOP §10)

Confirmed findings from quality sweeps (`docs/QUALITY.md`). Items marked
**(High)** are taken before any other new item, wherever they sit (LOOP §5.2);
the rest follow in file order. Each gets its own §6 review.

- [x] **QF.1 (High) Chosen options never return as passed-over options.**
  `passedOverOptions` (`packages/engine/src/evolution/model.ts` ~276) drops a
  menu's chosen option only while a skill of that name is owned, so after an
  evolution transform renames it, the old name comes back on every later menu,
  can be chosen again (the character then holds both forms), and the GM cannot
  withdraw it. DESIGN §6: an option leaves the list when chosen. *Accept:*
  engine test for the sweep's sequence (choose Piercing Shot at 5, transform it
  to Storm Pierce at evolution, offer the level-15 menu): it is not passed-over,
  `selection.choose` refuses it, and the player view does not list it; golden
  logs still replay.
- [x] **QF.2 (High) Item definitions reach players only for items they can
  see.** A player's own `trade.propose` may name any library item on the `get`
  side, and the player projection then sends its full definition (name, GM
  description, bonuses) to both sides; equip and gift errors also name items
  the player does not hold (`events/reducer.ts` ~800-835,
  `projection/player.ts` ~743, `economy/model.ts` ~124, ~150). *Accept:* a
  proposal may ask only for items the counterparty holds; "unknown item" and
  "not held" errors are identical and name nothing; the projection canary
  builds trades with non-empty item bundles and a GM-only item no player holds,
  and finds none of its fields in any player frame or HTTP body.
- [x] **QF.3 Limits on player-made data.** One phone can post 200 × 20 KB party
  notes in about a second, after which every command pushes a 4 MB view to
  every client (`apps/server/src/hub.ts` ~93-226). *Accept:* a per-connection
  command rate limit in the hub, and per-character caps on note count and
  total note size and on open trades, all from the rules or server config;
  clients whose projected view did not change get no new snapshot; server
  tests for each limit, with the error players see.
- [x] **QF.4 Golden logs are pinned.** A commit can edit a `.jsonl` golden and
  regenerate its `.state.json`, and the golden test still passes. *Accept:* a
  manifest pins each `.jsonl` and `.state.json` by SHA-256 together with the
  `CAMPAIGN_STATE_SCHEMA_VERSION` it was recorded at; the test fails when a
  `.jsonl` changes, or when a `.state.json` changes without a higher schema
  version; a script re-records the manifest and refuses to do so without a
  version bump.
- [x] **QF.5 Engine purity lint has no bypasses.** `export function f(clock =
  Date)`, `rng = Math` default parameters, `{ clock: Date }` and `() => Date`
  pass the engine lint (`eslint.config.js` ~52-59). *Accept:* each of these is
  rejected; `scripts/lint-rules.test.ts` asserts the rule id
  (`no-restricted-syntax`), not just "some message".
- [x] **QF.6 Desktop smoke specs run in CI.** `apps/desktop/test/*.spec.ts`
  (GM window connects with the injected key, key leaves the address bar,
  busy-port fallback) run in no workflow. *Accept:* a CI job (public repo, so
  free minutes) installs the Electron binary and runs `npm run desktop:smoke`
  under xvfb on pushes to main; a test asserts the desktop app never prints
  its GM key.
- [x] **QF.7 Store failure paths are tested.** The rollback after a failed
  write and the stop-writing latch after a failed fsync
  (`apps/server/src/store.ts` ~403-420) have no tests. *Accept:* fault-
  injection tests: a failed write leaves the log at its last good length; a
  failed fsync refuses every later append and the error says why.
- [x] **QF.8 Latency checks that don't flake.** e2e specs bound
  click-to-render wall time (`e2e/MS.A.spec.ts` ~80-86 and ~157,
  `e2e/MS.2.spec.ts` ~81-87, `e2e/MS.3.spec.ts` ~118-126,
  `apps/server/test/sessionLog.test.ts` ~448) with `retries: 0` under fully
  parallel workers; under 4 workers on 2 CPUs `e2e/MS.3.spec.ts` and
  `e2e/M3.3.spec.ts` fail while each passes alone (QUALITY.md, Flakes). *Accept:* the "within 1 s" criteria (MS.3, M7.x) still
  hold but are measured without depending on CI load (e.g. a serial
  Playwright project for latency specs, or timing from the server's send to
  the client's render); no retries added; the full suite passes 10 times in a
  row with `--repeat-each` on the latency specs.

- [x] **QF.9 Trade proposals reveal nothing the proposer cannot see.**
  `trade.propose` refuses a `get` bundle the counterparty does not hold
  (`events/commands.ts` ~1250, QF.2), so a player can probe another
  character's exact item counts (accepted for 1–3, refused at 4), and the
  open trade then puts the asked-for item's full definition (GM description,
  bonuses) in the proposer's `inventory.itemDefs` (`projection/player.ts`
  ~782-800) for an item they never held (D82: players never see other
  inventories). Sweep B, Boundaries. *Accept:* proposing never depends on the
  counterparty's holdings (accept re-checks, with the same name-free error);
  the proposer's view carries definitions only for items they hold or offer,
  and the counterparty's for items they hold or are offered; engine tests for
  the 1–3/4 probe and the definition; canary still passes.

- [x] **QF.10 e2e pages close with their test.** Specs open pages with
  `browser.newPage()` and rarely close them; once a test's server stops, each
  leftover page keeps reconnecting, so the worker's one browser slows until a
  late spec times out at its first click (runs 4a0765f3 and 6fcb6693: MQ.13,
  MQ.14 and MQ.6 specs, each green alone). *Accept:* every spec imports `test`
  from `e2e/helpers/test.ts`, whose automatic fixture closes the contexts a
  test opened; the full suite passes on one worker; no retries added.
- [x] **QF.11 (High) A partial download cannot hang.** Luke's first real
  download (2026-10-22) stopped at 52 MB of 107 MB; double-clicking the
  portable `.exe` started it anyway and it hung, holding the file so Windows
  would not delete it ("file is open in The System"). electron-builder's
  portable template has `CRCCheck off` (`app-builder-lib/templates/nsis/
  portable.nsi`); the installer checks itself and says "integrity check
  failed". *Accept:* the portable build refuses a damaged or partial file with
  a clear message instead of starting (integrity check on, e.g. a custom
  portable script), or the portable build is dropped and the installer is
  the only Windows download (D-entry either way); the release notes put the
  installer first and list each file's exact size and SHA-256; a CI test
  truncates the built `.exe` and checks the integrity flag or the refusal.

- [x] **QF.12 A golden log runs under today's default rules.** All golden
  logs were recorded with stored-style rules (`libraryByRarity`,
  `clampedPoolsNotFull`, `itemsFlatOnly` all off), so library text sync, the
  no-heal pool mark and flat-only items have no replay pin for new campaigns,
  and MR.1/MR.4 will change that code. Sweep C, Rules. *Accept:* a new golden
  recorded with `DEFAULT_RULES` covering a hand-edited skill copy, a library
  edit, an upgrade, a clamped pool and a capped item, pinned through
  `npm run golden:record`.
- [ ] **QF.13 The change log stays cheap in a long campaign.** M4.A review
  (fable), Medium 3: `GET /api/gm/changelog` replays every event on the
  server's event loop and the GM console refetches and renders every row after
  each state change (188 ms and 538 KB at 3,196 events; a 40-session campaign
  would stall DINGs). *Accept:* the route returns a bounded page (newest N
  plus a "load older" cursor) without a full replay per request, the console
  renders that page, and a unit or e2e test pins the bound on a 10k-event log.
  Needed before M4.A is checked.
