import { defineConfig } from '@playwright/test';

// Desktop smoke test (MS.5): launches the real Electron app under xvfb.
// Not part of `npm run e2e`/CI, whose installs skip the Electron binary.
// QF.59: the app under test turns hardware acceleration off (unpackaged runs
// only); every launch spreads process.env, so setting it here covers them all.
process.env['THE_SYSTEM_TEST_NO_GPU'] = '1';

export default defineConfig({
  testDir: 'test',
  testMatch: '*.spec.ts',
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  timeout: 60_000,
});
