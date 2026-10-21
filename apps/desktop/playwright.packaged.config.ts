import { defineConfig } from '@playwright/test';

// Packaged-app smoke (MS.6): launches the electron-builder output named by
// THE_SYSTEM_PACKAGED_EXE. Run by `npm run package:smoke` and the release workflow.
export default defineConfig({
  testDir: 'test',
  testMatch: 'packaged.smoke.ts',
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  timeout: 90_000,
});
