import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

/**
 * Playwright's `test`, plus one automatic fixture: every browser context a
 * test opens (`browser.newPage()` opens one per page) is closed when that test
 * ends. Without it, pages outlive their test: once the test's server stops,
 * each leftover page keeps reconnecting to it, so the one shared browser of a
 * worker grows slower with every spec until a late one times out at its first
 * click (QF.10).
 */
export const test = base.extend<{ closeOwnContexts: void }>({
  closeOwnContexts: [
    async ({ browser, context: own }, use) => {
      const before = new Set(browser.contexts());
      await use();
      // The built-in `context` (behind the `page` fixture) closes itself.
      for (const context of browser.contexts()) {
        if (context !== own && !before.has(context)) await context.close();
      }
    },
    { auto: true },
  ],
});
