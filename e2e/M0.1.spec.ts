import { expect, test } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

let server: RunningServer;

test.beforeAll(async () => {
  server = await startBuiltServer();
});

test.afterAll(async () => {
  await server.stop();
});

test('the built server serves the web app on a random port', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  expect(server.url).not.toMatch(/:30333$/);
  await page.goto(server.url);
  await expect(page).toHaveTitle('The System');
  await expect(page.getByRole('heading', { name: 'The System' })).toBeVisible();
  // The engine (consumed as source) made it into the web bundle.
  await expect(page.locator('main')).toHaveAttribute('data-engine', 'the-system-engine');
  expect(errors).toEqual([]);
});

test('client routes fall back to the app shell', async ({ page }) => {
  await page.goto(`${server.url}/some/client/route`);
  await expect(page.getByRole('heading', { name: 'The System' })).toBeVisible();
});
