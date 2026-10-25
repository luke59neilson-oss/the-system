# Build complete

Written by run 7a8361b5 on 2026-10-25, when M11.5 (final review) came back
clean. Every roadmap item is checked except **M9.4 Optional GitHub sync**,
which Luke deferred (folder export instead). Hourly build runs stop while
this file exists (LOOP §2.1): delete it to start them again, for example
after answering questions in `docs/ANSWERS.md` or adding roadmap items.

## What was built

The System: a LAN app for running a Primal Hunter-style LitRPG tabletop
campaign (rules in [`DESIGN.md`](DESIGN.md)).

- **GM desktop app** (Electron, Windows installer and Linux AppImage):
  double-click starts the server and opens the GM console; party dashboard,
  XP awards with overflow preview, encounters (grade-wall contest rolls,
  damage, progress clocks, montages), practice log, skill offers, marks
  review, merges, evolution builder, quests with World Stability and hidden
  quests, bestiary and Identify, items, loot tables, currency, titles,
  trackers, broadcasts, change log with undo, rules settings, demo campaign,
  "View as" any player and a Table view.
- **Player screens** (any browser on the wifi, no install, no password):
  the books' status window in the grade's metal, free points, skill
  selections, evolutions, professions, party, inventory and trades, quests,
  practice, Identify, notes, notifications with "DING!" chimes.
- **Engine**: pure, deterministic rules over an append-only event log with
  snapshots, undo, replay and versioned upcasting; GM-only data never reaches
  a player (projection canary tests).
- **Claude bridge**: session logs and reports in the exports folder,
  **Copy for Claude**, and content import with preview and approval
  ([`CONTENT-FORMAT.md`](CONTENT-FORMAT.md); the tutorial pack in
  `content-packs/tutorial.json`).
- **Hardening**: soak test (1 GM + 4 players, 2,000 commands), crash and
  power-loss recovery, a 50,000-event campaign loading in under a second.

## Install and run

- GM: [`GM-GUIDE.md`](GM-GUIDE.md). In short: GitHub → Actions → Release →
  Run workflow publishes a preview build; install it from Releases and
  double-click **The System**.
- Players: [`PLAYER-QUICKSTART.md`](PLAYER-QUICKSTART.md) (one page).
- Problems: [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
- Developers: Node 22, `npm ci`, `npm run dev`; `npm run check` and
  `npm run e2e` before pushing.

## Known gaps

- **M9.4 GitHub sync** is deferred by Luke; campaigns move by copying the
  `data` folder.
- **No macOS download** (D97, Q73); a Mac build works from source.
- **Open questions** in [`QUESTIONS.md`](QUESTIONS.md) still run on their
  defaults until Luke answers them in `ANSWERS.md`.
- **Low-severity findings** in the Backlog of [`QUALITY.md`](QUALITY.md) were
  triaged at M11.5 and kept, none affecting play at the table: polish and
  layout on rarely used screens (practice review list, marks review, long
  System messages lists, phone layout of the evolution bonus grid), extra
  edge-case tests (exact length limits, untested web helpers, mutations that
  survive), defence in depth for a hostile player on the LAN (CSP headers,
  per-address rate limits, key throttling, internal names in some error
  texts), and campaigns created before later rule changes (old default
  classes; library renames orphaning copies). Each line there says what and
  where.
- **Final review notes (M11.5, fable)**: no High or Medium. Kept Lows: the
  "GM key needed" screen still mentions the server terminal (the desktop
  path comes first); a player sees internal command names in "only the GM
  can …" refusals; DESIGN §9's one-line DING example vs the app's separate
  Class and Race DINGs; portraits of the real campaign are not served while
  the demo is loaded; DESIGN §6 says only a downgraded skill keeps its marks
  while L14 also keeps them on a GM raise at evolution (L14 decides).
  Fixed: an engine error inside a command is now logged by the server.
- **Flakes** watched in `QUALITY.md` (an M8.3 keyboard sweep and a desktop
  splash screenshot in CI); neither has repeated.
