import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/test/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
