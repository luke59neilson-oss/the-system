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

- [x] **QF.14 The desktop splash test does not race the hand-over.**
  `apps/desktop/test/launch.spec.ts:33` screenshots the splash, which closes
  by design once the GM console is ready, so CI's desktop-smoke job fails
  with "Target page ... has been closed" (f4d07d9 at 06:43 and ab3f114 at
  10:31 UTC on 2026-10-23; QUALITY.md, Flakes). *Accept:* the test asserts the
  splash text and takes any screenshot before the hand-over can happen (or
  holds the hand-over in a test-only way); `--repeat-each=20` on that test
  green under xvfb; no retries added. (Numbered 14 because `wip/M4.A` holds
  QF.13.)
- [x] **QF.16 Pin the merge rarity and a partial practice review.** Sweep B
  (Tests, 2026-10-23): every evolution-merge test merges two skills of the
  same rarity, so `Math.max`→`Math.min` in `checkOption`
  (`evolution/model.ts` ~507) and in the builder's `mergePrompts`
  (`evolutionBuilderModel.ts` ~88) survives (DESIGN §6: one rarity above the
  *higher*); and no test reviews a subset of pending entries, so dropping
  `ids.has(e.id)` in `practice.reviewed` (`reducer.ts` ~1220) marks every
  entry reviewed unnoticed. *Accept:* an Uncommon + Rare merge at evolution
  is refused below Epic and accepted at Epic, through `execute`; the builder
  model prompts Epic for that pair; `practice.review` of one of two entries
  leaves the other unreviewed; each named mutation fails a test.
- [x] **QF.17 Table-view panes show every DING.** Sweep B (UX, 2026-10-23):
  `PaneLatest` (`PlayerScreen.tsx` ~966) pins only `kind === 'level'`, so a
  skill upgrade, merge or profession DING never shows in the GM's Table-view
  pane. *Accept:* the pane uses the same set as the history's DING filter; an
  e2e upgrades a skill in Table view and sees `latest-ding` change.
- [ ] **QF.18 M2.A restart test: tolerate the expected resource error.**
  Repeat flake (QUALITY "Flakes", 2026-10-23 and 2026-10-24): during the
  server restart in `e2e/M2.A.spec.ts` the GM page logs "Failed to load
  resource" (connection reset, then 503) and the console-error check fails;
  passes alone and with 2 workers. *Accept:* find which request hits the
  restarting server (likely a GM HTTP poll or asset) and either make the
  client not log it as an error during a known reconnect or filter exactly
  that message during the restart window only, with a reason; the test
  passes 10/10 under a parallel vitest load.
- [x] **QF.15 Pin the grade-gap floor and scheduled broadcasts in the leak
  property.** Sweep A (Tests, 2026-10-23): `Math.floor`→`Math.round` on the
  grade-gap scaled share (`progression/xp.ts` ~175, ~274, ~496) left every
  test green (200 × ⅓ gives 67, not 66, D120); and the random-state GM-leak
  property (`projection.test.ts`) never seeded `scheduledBroadcasts`, so
  merging them into a player's messages passed it. *Accept:* each of the three
  floor sites mutated to `Math.round` fails a test; the property seeds
  GM-only scheduled broadcasts (to everyone and to each character) and fails
  when `projectForPlayer` includes them; no production code changes.
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
- [x] **QF.13 The change log stays cheap in a long campaign.** M4.A review
  (fable), Medium 3: `GET /api/gm/changelog` replays every event on the
  server's event loop and the GM console refetches and renders every row after
  each state change (188 ms and 538 KB at 3,196 events; a 40-session campaign
  would stall DINGs). *Accept:* the route returns a bounded page (newest N
  plus a "load older" cursor) without a full replay per request, the console
  renders that page, and a unit or e2e test pins the bound on a 10k-event log.
  Needed before M4.A is checked.

## MR — Luke's answers, batch 2 (2026-10-22)

Answers to Q43–Q52 (DESIGN §2, §6, §7 updated; L14–L18). They change finished
engine and player items, so they come before M4.5. Defaults Luke kept need no
work: Q44–Q48 and Q52.

- [x] **MR.1 Evolutions re-rate skills.** An evolution release carries a new
  rarity for every skill the character keeps: by default one step down
  (never below Inferior), set per skill by the GM (raise within the new
  grade's ceiling, keep, or lower). The copy's text and effects stay as they
  are (library-linked or hand-written), and every mark is kept, so the next
  upgrade uses the lower rarity's cost. Evolution events stored before this
  item carry no re-rating and replay unchanged. The player's evolution
  screen shows each skill's old → new rarity before release. The GM builder
  controls come with M5.2; until then the default applies, with the override
  available as a command. *Accept:* engine tests: default drop, raise, keep,
  lower, the Inferior floor, a raise refused above the ceiling, marks kept,
  text unchanged for library-linked and hand-written copies, an upgrade
  right after the evolution at the lower rarity's cost; golden logs still
  replay; e2e on the evolution screen.
- [x] **MR.2 Every upgrade starts at 0 marks.** Replaces MQ.4's carry-over
  (D113) and D114's spend-and-carry: an upgrade by marks leaves the skill at
  0 (extra marks are not kept), and so does any evolution transform; only a
  downgrade at evolution (MR.1) keeps marks. New campaigns get the new rule;
  stored logs replay as recorded. The upgrade and evolution screens' marks
  notes say so. *Accept:* engine tests: 10 marks on an Inferior skill
  upgrade to a Common skill with 0; a transform (raising or same rarity)
  leaves 0; a downgrade keeps all; tests through `evolution.choose`; e2e
  text on both screens.
- [x] **MR.3 XP overflow for every campaign.** Replaces D124: campaigns
  created before MQ.11 switch to overflow automatically when loaded (a rules
  migration, logged). How XP already banked is handled is the run's call
  (no real campaigns exist yet), logged as a D-entry. *Accept:* a stored
  campaign with banked XP loads with overflow on; the GM award preview warns
  about lost XP for it; golden logs re-recorded under a schema bump.
- [x] **MR.4 Hand-written skill text survives upgrades; Use library text.**
  Replaces D133 (keeps D125): a hand-written copy keeps its text when the
  skill upgrades, and a downgrade (MR.1) never changes text. The GM's Skill
  text form gets **Use library text**, which reconnects the copy to the
  library entry for its current name and rarity (disabled when there is
  none). *Accept:* engine tests for an upgrade with and without hand-written
  text and for reconnecting; e2e on the form.
- [x] **MR.A Batch acceptance and review.** The batch's e2e specs and the full
  suite green; `fable` review; then "Preview ready" (LOOP §8.2).

## M1 (continued) — Rules engine

- [x] **M1.6 Titles and bonuses.** Flat and percentage bonuses, percentage
  cap, documented order (base → flat → percent → cap). *Accept:* stacking and
  cap tests.
- [x] **M1.7 Items and economy.** Item definitions (rarity, effects), rarity
  edits, inventories, 12 equipment slots (2 rings, necklace, chest, legs,
  boots, bracers, mask, cloak, gloves, main hand, off hand), currency, gifts
  and two-sided trades between characters and the GM. *Accept:* atomic
  transfers; no negative balances or stacks; equip rules; item effects reach
  effective stats via M1.6 order; trade accept/decline/cancel.
- [x] **M1.8 Practice log and notes.** Practice entries (character, action,
  skill/stat, tags, source GM/player/montage), repeat detection, skill-pair
  counts, alerts (selection within 5 levels, merge at 3 joint uses). Notes:
  private journal, party notes, GM notes, tags, shareable flag, search.
  *Accept:* alert and pair-count tests; GM cannot read unshared private notes.
- [x] **M1.9 Skills.** Rarity ladder, Unique tag, nicknames, mastery marks
  (one per skill per session; end-of-session review), thresholds, grade
  ceilings with banking, upgrades, merges (uses M1.8 counts; both ≥ Uncommon;
  one per grade; +1 rarity; originals consumed; marks reset). *Accept:* one
  test per rule incl. every rejection path.
- [x] **M1.10 Selections and evolutions.** Selections from class level at
  DESIGN intervals with capstone flags; capstone menus must contain an option
  at the grade ceiling; profession options inside class menus. Evolution:
  available at grade top (`evolutionGate` config) → GM release → options →
  choice → new grade, banked XP applied, optional spread reshape, skill
  transforms (rewrite or alias practice-log skill names, M1.9 review);
  profession unlock at E starting at class level. *Accept:* 0→240
  simulation yields exactly 29 selections, capstones at 10/45/90/140/190/240;
  levels freeze at caps and banked XP applies after evolution; evolution
  impossible without GM release; both gate modes tested.
- [x] **M1.11 Resolution and clocks.** Ratio odds with injectable RNG; three
  grade-gap modes (none; per-grade multiplier on the stat value; lower-grade
  side ÷3); progress clocks; montage eligibility. *Accept:* 10,000-roll test
  within ±2% for 1:1, 2:1, 3:1, 10:1 in each mode; clock/montage tests.
- [x] **M1.12 Quests and World Stability.** Quest text, timers, day counter,
  stability rules (action tag → delta), clamp 0–100, manual nudge, visibility
  flag. *Accept:* rule, clamp and visibility tests.
- [x] **M1.14 Campaign simulation.** 40 sessions, 4 characters, ~6 levels per
  session, random valid play (fixed seed). *Accept:* DESIGN check values; 29
  selections each; evolutions at thresholds; invariants hold; coverage ≥ 90%.
- [x] **M1.15 Demo campaign content.** (from MS.4, D53) Extend the demo:
  characters at grades G, F, E and D (via evolutions), titles, items and a
  quest with World Stability. *Accept:* demo tests check each grade, a title,
  an item and a visible stability quest; the real campaign is untouched.
- [x] **M1.A Milestone acceptance and review.**

## M2 (continued) — Server and sync

- [x] **M2.4 Session log autosave.** Running log (DESIGN §7 "Logging for
  Claude") written to the exports folder every 5 minutes and on shutdown.
  *Accept:* file appears and grows during a scripted session; contains no
  GM-private notes unless GM-flagged for export.
- [x] **M2.A Milestone acceptance and review.**

## M3 — Player app (browser)

- [x] **M3.1 Join screen.** Character list (portrait, name, grade); pick one;
  remembered in localStorage (try/catch).
- [x] **M3.2 Status screen.** DESIGN §9 layout, live updates.
- [x] **M3.3 Notifications and history.** Book-style DING feed, queued
  animation, optional sound; full history back to day 1, searchable and
  filterable.
- [x] **M3.4 Free points.** Allocate a batch, confirm, locked.
- [x] **M3.5 Skill detail.** Rarity color, description, flavor, marks
  progress, nickname edit (official name always shown).
- [x] **M3.6 Skill selection.** Pending badge, offers side by side, choose.
  The e2e uses the demo's open menu (Jake, level 50; D70).
- [x] **M3.7 Inventory, gifts, trades.** Equip; give items/currency to a
  character or the GM; propose/accept/decline trades; incoming notices.
  Project holdings, own trades and the definitions of held/offered items;
  switch pool maxima and the stats block to effective stats (D60). The e2e
  checks the demo's equipped ring and bow on Jake's screen (D70).
- [x] **M3.8 Quest log.** Text, days left, stability gauge when visible.
  The e2e checks the demo quest's visible gauge (89) on a player screen (D70).
- [x] **M3.9 Identify.** Choose a known entity; show tier text.
- [x] **M3.10 Notes.** Private journal (markdown, shareable toggle), live
  party notes, tags, search. Project notes with `canReadNote` (own journal +
  party; never GM notes) with a canary; server-generated note ids.
- [x] **M3.11 Practice and montage.** Submit practice entries; enter montage
  focus when offered.
- [x] **M3.12 Party view.** Names, race/class/level, pool bars.
- [x] **M3.13 Table extras.** Evolution screen (options, warnings, choose).
  The contest result pop-up moved to M7.3 and the hunger tracker to M7.4,
  where the engine first records rolls and hunger (D88).
- [x] **M3.A Milestone acceptance and review.** All M3 specs pass at both
  viewports with zero console errors.

## M4 — GM console

- [x] **M4.1 Skill library.** Create/edit skills: rarity, tags, description,
  flavor, effects text. Character skills already carry `description` and
  `flavor` (M3.5, D78; `skill.described`); the library should fill them when
  a skill is granted, including the starting race skill (Identify).
- [x] **M4.2 Class, race and profession libraries.** Starting classes (stat
  weights + 3 starting skills), Human race, professions; seed a default set.
- [x] **M4.3 Campaign and sessions.** Create campaign; start/end session (end
  = backup + full session report); in-game day counter. Point the running
  session log (M2.4, D72) at the started session's events instead of "since
  the server opened the campaign".
- [x] **M4.4 Character creation.** Name, starting class, portrait; Identify
  added automatically.
- [x] **M4.5 Party dashboard.** Card per character with flags (pending
  selection/evolution/marks/merges); full sheet edit as audited events.
- [x] **M4.6 XP award dialog.** Amount, class or profession, participant
  checkboxes, even integer split by default with auto-balanced last share,
  editable shares, above-level bonus toggle, target grade (⅓ / no XP for
  lower grades, MQ.10: `enemyGrade`), level-up preview with overflow and
  "XP lost" warnings (`previewXpAward`, MQ.11), "typical
  session ≈ 6 levels" helper (`typicalSessionXp`), confirm.
- [x] **M4.7 System broadcast.** System-style message to one or all; now or
  scheduled.
- [x] **M4.8 Change log and undo.** Filterable event list; undo with M1.3
  rules.
- [x] **M4.9 Rules settings.** Edit every config value as events, with
  validation and reset to defaults. Turning on `xp.overflow` (D124) for a
  campaign that banked XP moves each capped track's bank per the overflow
  rule, and says what was lost.
- [x] **M4.A Milestone acceptance and review.** GM creates 3 characters,
  awards XP with a custom split; each player screen shows the DING within
  1 s; undo reverts it everywhere.

## M5 — Skills and practice tools (GM)

- [x] **M5.1 Offer builder.** Per-character menu builder beside the practice
  log; capstone check; profession options; send. Lists the character's
  passed-over options with a Withdraw button (`selection.withdrawOption`,
  MQ.3, D112). Show due selections
  (`dueSelections`) next to the M1.8 selection alert, which does not know
  whether a selection was taken.
- [x] **M5.2 Evolution builder.** Options, warnings, one-time stat bonus per
  option, optional transforms with merge prompts, spread reshape, tailored
  profession offers (E evolution, or later after "none for now"; withdrawing an
  untaken offer, MQ.6 review); per-skill re-rating at release (default one
  rarity down, raise/keep/lower; MR.1); release. Warn when a selection (esp. the capstone) is still
  pending (Q21).
- [x] **M5.3 Marks review.** End-of-session queue; upgrade prompts.
- [x] **M5.4 Merges.** Alert, build, send.
- [x] **M5.5 Practice capture.** Quick-add with shortcut; end-of-scene
  prompt; review of player submissions. Needs new events to edit/remove an
  entry and to mark entries reviewed (M1.8 review, Lows 5).
- [x] **M5.A Milestone acceptance and review.** Full selection, evolution,
  mark-upgrade and merge loops between GM and player.

## M6 — Items, titles, economy (GM)

- [x] **M6.1 Item library.** Create/edit, rarity change, give/take.
- [x] **M6.2 Loot tables.** Define and roll.
- [x] **M6.3 Currency.** Grants, fines, ledger.
- [x] **M6.4 Titles.** Library; award with System text.
- [x] **M6.A Milestone acceptance and review.** Give, trade, loot roll, title
  award end to end.

## M7 — Quests, encounters, bestiary

- [x] **M7.1 Quest manager.** Text, timers, stability rules, nudges,
  visibility, and for hidden quests who gets the notice (`noticeTo`, D122).
  Offer to apply a quest's stability rule when a practice entry
  carries one of its action tags (D67).
- [x] **M7.2 Bestiary and NPCs.** Grade, level, stats, Identify tiers, notes.
  Sets an entity's grade and level for the Identify range (D123); warn when a
  label names what an out-of-range target is.
- [ ] **M7.3 Encounter panel.** Ratio-odds roller (stats + mode), pool
  damage/heal, progress clocks, montage trigger. Rolls the GM shares become
  events, and the players involved get a contest result pop-up (from M3.13,
  D88).
  Store the race level used for the above-level XP bonus in `xp.awarded`
  so a non-latest undo cannot re-price a later award (D71).
- [ ] **M7.4 Trackers.** Hunger (fades at E-grade by default), regions,
  survivor factions. Players see their hunger tracker when the campaign
  enables it (from M3.13, D88).
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
- [ ] **M9.4 Optional GitHub sync (deferred: Luke chose folder export for now; skip and leave unchecked until he asks).** Token stored in OS app data only, never
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
- [ ] **M10.2 Packaging and releases (final).** Builds on MS.6. electron-builder: Windows NSIS installer (no portable build, D140),
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
