import { defineConfig } from '@playwright/test';

// Desktop smoke test (MS.5): launches the real Electron app under xvfb.
// Not part of `npm run e2e`/CI, whose installs skip the Electron binary.
export default defineConfig({
  testDir: 'test',
  testMatch: '*.spec.ts',
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  timeout: 60_000,
});
