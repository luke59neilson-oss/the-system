# Decisions log

Newest at the bottom. Format: ID · date · decision · why.

- D1 · 2026-10-21 · TypeScript monorepo with npm workspaces: `packages/engine` (pure rules), `apps/server` (Fastify + ws), `apps/web` (React + Vite), `apps/desktop` (Electron + electron-builder). · One language end to end; players need only a browser; the GM gets a double-click app.
- D2 · 2026-10-21 · Persistence is an append-only JSONL event log plus snapshots; no native database modules. · Gives the audit log, undo, and session reports for free, and avoids Electron native-module rebuilds.
- D3 · 2026-10-21 · Players join by picking their character, no password (Luke's call). GM commands only from loopback or with a GM key generated at launch. · Keeps it simple at the table while stopping a player's browser from running GM actions.
- D4 · 2026-10-21 · Default port 30333. · Avoids Foundry VTT's 30000 in case it runs on the same machine.
- D5 · 2026-10-21 · Players see their own sheet in full; the party view shows name, race/class, levels and pool bars only. · Luke's default answer; keeps per-player surprises intact.
- D6 · 2026-10-21 · XP is a number per event; default split even across chosen participants, adjustable. XP per level by grade: G 100, F 150, E 250, D 400, C 650, B 1,000, A 1,500. · Luke wants numeric XP; the curve keeps numbers growing with grade. Configurable.
- D7 · 2026-10-21 · One configurable currency, default name "Credits". · Luke wants money transfers; name to be confirmed.
- D8 · 2026-10-21 · CI runs tests on push (ubuntu only). Windows/macOS/Linux desktop builds run only on tags or manual dispatch. · Private-repo Actions minutes are limited and Windows/macOS minutes count extra.
- D9 · 2026-10-21 · No Claude API calls inside the app. The app exports session reports (and can optionally sync them to a GitHub repo); Claude-drafted content comes back as importable JSON. · Luke wants to carry notes to Claude and bring ideas back; no API key or cost in the app.
- D10 · 2026-10-21 · Adversarial review: Sonnet reviews each item, Fable reviews each milestone, always a fresh context. · Luke asked for reviews by different models.
- D11 · 2026-10-21 · Build installers for Windows, macOS and Linux. · Luke's laptop OS is not confirmed yet.
- D12 · 2026-10-21 · Free points are assigned once and then locked; the GM can override. · Luke's rule.
- D13 · 2026-10-21 · Grade themes are metallic: aluminum (dull), bronze (dull), copper, silver, gold, platinum (cool tint to separate it from silver), prismatic diamond. · Luke's choice; platinum tint added because silver and platinum look alike on screens.
