import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.5 Desktop wrapper (browser half): the GM console shows the players' join
// URL and QR. The Electron launch itself is covered by `npm run desktop:smoke`
// (apps/desktop/test/desktop.spec.ts), which needs the Electron binary.

const GM_KEY = 'e2e-gm-key-ms5-0123456789abcdef';
let server: RunningServer;

test.beforeAll(async () => {
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

test('the GM console shows the join URL and QR, without the GM key', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await page.getByLabel('Campaign name').fill('Join test');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  const port = new URL(server.url).port;
  await expect(page.getByTestId('join-url')).toHaveText(new RegExp(`^http://.+:${port}/?$`));
  const qr = page.getByRole('img', { name: /QR code for http/ });
  await expect(qr).toBeVisible();
  const src = (await qr.getAttribute('src')) ?? '';
  expect(src.startsWith('data:image/svg+xml')).toBe(true);
  expect(decodeURIComponent(src)).not.toContain(GM_KEY);
  await expect(page.getByTestId('join-url')).not.toContainText(GM_KEY);
  expect(errors).toEqual([]);
});
