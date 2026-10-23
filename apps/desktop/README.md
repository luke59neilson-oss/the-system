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
  folder. If the port is taken or reserved, the app tries the next 19 ports
  and tells the GM which one it used (MS.7).
- Launch polish (MS.7): a "Starting The System…" splash appears at once and
  hands over to the GM console; a second launch focuses the running window.
  Test-only, ignored when packaged: `THE_SYSTEM_USER_DATA_DIR` (separate
  profile, so test instances never meet a real one) and
  `THE_SYSTEM_TEST_START_DELAY_MS` (holds the start to show the splash).

## Packaging (MS.6)

- `npm run build && npm run package -w @the-system/desktop -- --linux` (or
  `--win`) runs electron-builder (`electron-builder.yml`, through
  `package.mjs`, which names files `TheSystem-<THE_SYSTEM_BUILD_ID>-…`,
  default `dev-<version>`) into
  `apps/desktop/release/`: Windows installer (QF.11: no portable exe), Linux AppImage.
  The `mac` section of `electron-builder.yml` stays for local `--mac` builds,
  but releases no longer build macOS (MQ.9, D97). Only `dist/main.cjs` ships in the asar; the
  web build goes to `resources/web`.
- `THE_SYSTEM_PACKAGED_EXE=apps/desktop/release/linux-unpacked/the-system npm run package:smoke -w @the-system/desktop`
  launches the packaged app under `xvfb-run` and checks it serves and connects.
- `.github/workflows/release.yml` builds Windows and Linux on push to `release` and
  publishes a GitHub pre-release `preview-<date>-<run>` whose files carry the
  same id and whose notes list the commits since the previous preview
  (`scripts/release-notes.mjs`); a push to `release-dry-run` builds and
  checks the same names without publishing.
