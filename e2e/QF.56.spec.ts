import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.56: the home dashboard and phones work at the table.
const GM_KEY = 'e2e-gm-key-qf56-0123456789abcdef56';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.56');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('the join address and QR show without scrolling at 1366x768', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  // The demo load reconnects the socket; the demo party proves it is back.
  await expect(
    gm.getByRole('navigation', { name: 'View as' }).getByRole('button', { name: 'Jake' }),
  ).toBeVisible();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  const qr = gm.locator('.join-qr').first();
  await expect(qr).toBeVisible();
  const box = await qr.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height, 'QR bottom edge').toBeLessThanOrEqual(768);
  await expect(gm.getByTestId('join-url').first()).toBeInViewport();
  await gm.screenshot({ path: path.join(shots, 'home-1366x768.png') });
});
