# The System

A LAN app for running a Primal Hunter-style LitRPG tabletop campaign: player
status screens in the browser, a GM console in a double-click desktop app.

- This repo is built by scheduled autonomous runs. **Follow `docs/LOOP.md`
  exactly.**
- Game rules live in `docs/DESIGN.md`; the plan in `docs/ROADMAP.md`;
  choices in `docs/DECISIONS.md`.
- All rule numbers come from the rules config, never hard-coded in UI code.
- Engine code is pure and deterministic (injectable clock and RNG).
- Players' browsers must never receive GM-only data.
- Keep `main` green: `npm run check` before every push.
