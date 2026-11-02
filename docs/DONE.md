# Build complete

Every roadmap box is checked and none is provisional, except M9.4 (optional
GitHub sync), which Luke deferred until he asks (D207, D345). Last updated
2026-11-02, after MW.A. Scheduled runs stop while this file exists; to queue
more work, add items to `docs/ROADMAP.md` and delete this file.

## What was built

A LAN app for running a LitRPG tabletop campaign: a GM console in a desktop
app, and player status screens in the browser on the same wifi. It covers the
rules engine and event log, characters, XP, skill offers, evolutions, items,
quests and encounters, the co-DM (with the GM's own API key), content import,
backups and movable console panels. `docs/ROADMAP.md` has the full list.

## How to install and run

1. Build an installer: Actions → Release → Run workflow (Luke's one click,
   D93). A preview for MW is ready to build.
2. Install it and double-click the app. It opens on the Campaigns home.
3. Players open the join address or QR from the console.

Guides: `docs/GM-GUIDE.md`, `docs/PLAYER-QUICKSTART.md`,
`docs/TROUBLESHOOTING.md`. For development: `npm ci`, `npm run dev`,
`npm run check`, `npm run e2e`.

## Known gaps

- M9.4 GitHub sync is not built; session reports export to a folder.
- Speech labels and co-DM defaults have not been tried on real voices or at a
  real table (`docs/QUESTIONS.md`, which also lists the defaults awaiting
  Luke's call).
- Reviewed Lows are unfixed: see the Backlog in `docs/QUALITY.md`.
- Not run on this final commit: desktop smoke. Tests cover Chromium only, so
  Firefox, Safari and touch dragging of panels are untested.
