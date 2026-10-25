import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.6 Broadcasts last a set time or stay pinned (DESIGN §7, Q60): sending
// stays immediate; a broadcast can also show as a banner on players' screens
// for N seconds or minutes, or until the GM removes it.

const GM_KEY = 'e2e-gm-key-mt6-0123456789abcdef6';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.6');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('timed and pinned banners reach players; the GM removes a pinned one', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Banners');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await expect(jake.getByTestId('connection')).toHaveText('Connected');

  const form = gm.locator('form[aria-labelledby="broadcast"]');
  // A timed banner: 5 seconds, then it comes down by itself; the message stays.
  await form.getByLabel('Message').fill('The ground trembles.');
  await form.getByLabel('Show').selectOption('timed');
  await form.getByLabel('Banner time', { exact: true }).fill('3');
  await expect(form.getByRole('alert')).toHaveText('A banner shows for 5 seconds to 24 hours.');
  await expect(form.getByRole('button', { name: 'Send broadcast' })).toBeDisabled();
  await form.getByLabel('Banner time', { exact: true }).fill('5');
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  const banners = jake.getByTestId('broadcast-banner');
  await expect(banners).toHaveText(['[System] The ground trembles.']);
  await expect(gm.getByRole('heading', { name: 'Banners on players’ screens' })).toBeVisible();
  await expect(banners).toHaveCount(0, { timeout: 10_000 });
  await expect(jake.getByTestId('messages')).toContainText('The ground trembles.');

  // A pinned banner stays (also after a reload) until the GM removes it.
  await form.getByLabel('Message').fill('[The System is constructing the area…]');
  await form.getByLabel('Show').selectOption('pinned');
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(banners).toHaveText(['[System] [The System is constructing the area…]']);
  await jake.reload();
  await expect(jake.getByTestId('connection')).toHaveText('Connected');
  await expect(banners).toHaveText(['[System] [The System is constructing the area…]']);
  await jake.screenshot({ path: path.join(shots, 'player-pinned-banner-390x844.png') });
  const live = gm.locator('section[aria-labelledby="live-banners"]');
  await live.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-live-banners-1366x768.png') });
  await live.getByRole('button', { name: /Remove the banner/ }).click();
  await expect(banners).toHaveCount(0);
  await expect(live).toHaveCount(0);
  await expect(jake.getByTestId('messages')).toContainText('constructing the area');

  expect(errors).toEqual([]);
  expect(jakeErrors).toEqual([]);
});
