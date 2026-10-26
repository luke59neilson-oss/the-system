import { defineConfig } from 'vitest/config';

// MC.5 (D236): the real speech engine on a recorded fixture. Separate from
// the unit tests because it downloads a model (once, cached) and runs native
// code; CI runs it as its own step and reports the CPU time.
export default defineConfig({
  test: {
    include: ['apps/server/test/**/*.live.ts'],
    environment: 'node',
    testTimeout: 300_000,
  },
});
