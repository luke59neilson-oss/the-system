import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M10.1 Electron wrapper (browser half): the join panel's "Players can't
// connect?" help names this computer's firewall. The Electron half (backup on
// quit, Windows help in the real app) is apps/desktop/test/desktop.spec.ts.

const GM_KEY = 'e2e-gm-key-m101-0123456789abcdef';
let server: RunningServer;

// One server per test: each creates its own campaign (LOOP §4: no shared state).
test.beforeEach(async () => {
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

async function openConsole(page: import('@playwright/test').Page, name: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await page.getByLabel('Campaign name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByTestId('join-url')).toBeVisible();
}

test('the join panel folds away generic firewall help on this OS', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openConsole(page, 'Firewall help');
  const help = page.getByTestId('connect-help');
  await expect(help).toBeVisible();
  // Folded until the GM opens it.
  await expect(help.getByRole('listitem').first()).toBeHidden();
  // The e2e server runs on Linux: generic steps, not Windows ones.
  await expect(help.locator('summary')).toHaveText('Players can’t connect? Check the firewall');
  await help.locator('summary').click();
  await expect(help).toContainText('same wifi');
  await expect(help).not.toContainText('Windows');
  await expect(help).not.toContainText(GM_KEY);
  expect(errors).toEqual([]);
});

test('on a Windows server the help walks through Windows Firewall', async ({ page }) => {
  // The server's OS comes from GM-only /api/join; report win32 as the desktop app does there.
  await page.route('**/api/join', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, platform: 'win32' } });
  });
  await openConsole(page, 'Windows help');
  const help = page.getByTestId('connect-help');
  await expect(help.locator('summary')).toHaveText('Players can’t connect? Check Windows Firewall');
  await help.locator('summary').click();
  await expect(help.getByRole('listitem')).toHaveCount(5);
  await expect(help).toContainText('Allow an app through Windows Firewall');
  await expect(help).toContainText('Private');
  await help.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screens/M10.1/gm-join-help-windows-1366x768.png' });
  await page.locator('.window.join').screenshot({
    path: 'docs/screens/M10.1/join-panel-windows.png',
  });
});
