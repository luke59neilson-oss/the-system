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
  // `@latency` tag and run one at a time after every other spec has finished,
  // so the bound measures the app, not the other workers' load on the machine.
  projects: [
    { name: 'e2e', grepInvert: LATENCY },
    { name: 'latency', grep: LATENCY, dependencies: ['e2e'], workers: 1, fullyParallel: false },
  ],
});
