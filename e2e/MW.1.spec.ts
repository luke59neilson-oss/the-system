import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MW.1 (DESIGN §6 "Building an offer"): the chosen character's whole standing
// sits beside the skill-offer menu, and stays there while the menu scrolls.

const GM_KEY = 'e2e-gm-key-mw1-0123456789abcdef0002';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MW.1');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('the skill-offer builder shows the standing beside the menu', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Offers');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const builder = gm.locator('section[aria-labelledby="offer-builder"]');
  await openWindow(gm, 'offer-builder');
  await builder.getByLabel('Character').selectOption({ label: 'Jake' });
  const standing = builder.getByTestId('offer-standing');
  await expect(standing.getByTestId('standing-summary')).toContainText('Grade D');
  await expect(standing.getByTestId('standing-perception')).toBeVisible();
  await expect(standing.getByTestId('standing-free')).toContainText('Free points unassigned:');
  await expect(standing.getByTestId('standing-skills').getByRole('listitem').first()).toBeVisible();
  await expect(standing.getByTestId('standing-titles')).toContainText('Titles:');
  await expect(standing.getByTestId('standing-equipped')).toContainText('Equipped:');

  // Beside the menu, not under it.
  const menu = builder.getByRole('list', { name: 'Due selections' });
  const menuBox = (await menu.boundingBox())!;
  const standingBox = (await standing.boundingBox())!;
  expect(standingBox.x).toBeGreaterThan(menuBox.x + menuBox.width - 1);
  await builder.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-standing-1366x768.png') });

  // Far down the menu form, the standing is still on screen.
  const send = builder.getByRole('button', { name: /send/i }).last();
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  await expect(standing.getByTestId('standing-summary')).toBeInViewport();

  await gm.setViewportSize({ width: 1920, height: 1080 });
  await builder.scrollIntoViewIfNeeded();
  await expect(standing.getByTestId('standing-summary')).toBeInViewport();
  await gm.screenshot({ path: path.join(shots, 'gm-standing-1920x1080.png') });
});
