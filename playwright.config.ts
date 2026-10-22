import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The cloud workspace ships Chromium here; CI installs its own via `playwright install`.
const localChromium = '/opt/pw-browsers/chromium';

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
});
