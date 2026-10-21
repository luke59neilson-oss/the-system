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

## Packaging (MS.6)

- `npm run build && npm run package -w @the-system/desktop -- --linux` (or
  `--win`, `--mac`) runs electron-builder (`electron-builder.yml`) into
  `apps/desktop/release/`: Windows installer + portable exe, macOS universal
  dmg (unsigned), Linux AppImage. Only `dist/main.cjs` ships in the asar; the
  web build goes to `resources/web`.
- `THE_SYSTEM_PACKAGED_EXE=apps/desktop/release/linux-unpacked/the-system npm run package:smoke -w @the-system/desktop`
  launches the packaged app under `xvfb-run` and checks it serves and connects.
- `.github/workflows/release.yml` builds all three on push to `release` and
  publishes a GitHub pre-release `preview-<date>`; a push to `release-dry-run`
  builds and checks without publishing.
