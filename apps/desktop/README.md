# Desktop app

Electron wrapper (ROADMAP MS.5; finished in M10.1): double-click starts the
LAN server on port 30333 and opens the GM console with a fresh GM key
injected (in the URL fragment, never sent over the network). Campaign data
lives in the OS app-data folder (`<userData>/data`). One instance at a time.

- `npm run build -w @the-system/desktop` bundles `src/main.ts` (server and
  engine included) to `dist/main.cjs`; it serves the web build from
  `apps/web/dist` (packaged builds: `resources/web`).
- `npm run desktop:smoke` (repo root) launches the real app under `xvfb-run`.
  Installs skip the Electron binary (`.npmrc`); fetch it once with
  `cd node_modules/electron && npm_config_electron_skip_binary_download=false node install.js`.
- `THE_SYSTEM_PORT` and `THE_SYSTEM_DATA_DIR` override the port and data
  folder (tests, or a GM whose port 30333 is taken).
