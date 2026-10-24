import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The cloud workspace ships Chromium here; CI installs its own via `playwright install`.
const localChromium = '/opt/pw-browsers/chromium';

/** Tag on tests whose acceptance bounds wall time (QF.8). */
const LATENCY = /@latency/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // `github` turns failures into job annotations, which runs can read through
  // the repo API (job logs are not reachable from the build sessions).
  reporter: process.env['CI'] ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 768 },
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  // QF.8: specs that bound click-to-render wall time ("within 1 s") carry the
  // `@latency` tag and run one at a time in their own project. `npm run e2e`
  // and CI run the `latency` project as a separate step after `e2e`, so the
  // bound measures the app, not the other workers' load on the machine. (No
  // project dependency: it would skip the latency specs whenever any other
  // spec failed, and CLI filters do not narrow dependencies.)
  projects: [
    { name: 'e2e', grepInvert: LATENCY },
    { name: 'latency', grep: LATENCY, workers: 1, fullyParallel: false },
  ],
});
