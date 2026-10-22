import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.4 Free points: a player spreads one batch, reviews, confirms; the batch
// locks (DESIGN §4, D38) and the stats update live.

const GM_KEY = 'e2e-gm-key-m34-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.4');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

async function award(gm: Page, amount: number) {
  const form = gm.locator('form[aria-labelledby="award-xp"]');
  await gm.getByLabel('Amount').fill(String(amount));
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(form.getByRole('status').or(form.getByRole('alert'))).toHaveText('XP awarded');
}

test('a player assigns a free-point batch, which then locks', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Points Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();
  // Two race levels: two batches of 2 points.
  await award(gm, 200);

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  await expect(laptop.getByTestId('free-points')).toHaveText('4');
  const agility = laptop.getByTestId('stat-agility');
  const agilityBefore = (await agility.locator('strong').innerText()).trim();

  await laptop.getByRole('button', { name: '[Assign]' }).click();
  const panel = laptop.getByTestId('assign');
  await expect(panel).toContainText('Race level 1: 2 points (1 more batch waiting)');
  await expect(laptop.getByTestId('points-left')).toHaveText('Points left: 2');
  const review = panel.getByRole('button', { name: 'Review' });
  await expect(review).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Remove a point from Agility' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Add a point to Agility' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await expect(laptop.getByTestId('points-left')).toHaveText('Points left: 0');
  // Nothing left to add; a point can be taken back.
  await expect(panel.getByRole('button', { name: 'Add a point to Strength' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Remove a point from Perception' }).click();
  await panel.getByRole('button', { name: 'Add a point to Agility' }).click();
  await expect(panel.getByTestId('assign-agility')).toContainText('(+2)');
  await laptop.screenshot({ path: path.join(shots, 'player-assign-1366x768.png') });
  await review.click();
  await expect(laptop.getByTestId('assign-review')).toHaveText(
    'Assign +2 Agility? Assigned points lock; only the GM can change them.',
  );
  await panel.getByRole('button', { name: 'Confirm' }).click();

  // Locked: the stat rose live, the batch is listed as assigned.
  await expect(panel).toHaveCount(0);
  await expect(laptop.getByTestId('free-points')).toHaveText('2');
  await expect(agility.locator('strong')).not.toHaveText(agilityBefore);
  const locked = laptop.getByTestId('locked-points');
  await locked.getByText('Assigned points (locked)').click();
  await expect(locked).toContainText('Race level 1: +2 Agility');

  // Cancel leaves the next batch alone.
  await laptop.getByRole('button', { name: '[Assign]' }).click();
  await expect(panel).toContainText('Race level 2: 2 points');
  await panel.getByRole('button', { name: 'Add a point to Willpower' }).click();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toHaveCount(0);
  await expect(laptop.getByTestId('free-points')).toHaveText('2');

  // A reload keeps the lock; the second batch goes to Perception.
  await laptop.reload();
  await expect(laptop.getByTestId('free-points')).toHaveText('2');
  await laptop.getByRole('button', { name: '[Assign]' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await panel.getByRole('button', { name: 'Review' }).click();
  await panel.getByRole('button', { name: 'Confirm' }).click();
  await expect(laptop.getByTestId('free-points')).toHaveText('0');
  await expect(laptop.getByRole('button', { name: '[Assign]' })).toHaveCount(0);
  await locked.getByText('Assigned points (locked)').click();
  await expect(locked).toContainText('Race level 2: +2 Perception');
  await laptop.screenshot({ path: path.join(shots, 'player-1366x768.png') });

  // Phone: a new batch, assigned on a 390-wide screen without sideways scroll.
  await award(gm, 100);
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(laptop.url());
  await expect(phone.getByTestId('free-points')).toHaveText('2');
  await phone.getByRole('button', { name: '[Assign]' }).click();
  const phonePanel = phone.getByTestId('assign');
  await phonePanel.getByRole('button', { name: 'Add a point to Strength' }).click();
  await phonePanel.getByRole('button', { name: 'Add a point to Endurance' }).click();
  const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phonePanel.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-assign-390x844.png'), fullPage: true });
  await phonePanel.getByRole('button', { name: 'Review' }).click();
  await phonePanel.getByRole('button', { name: 'Confirm' }).click();
  await expect(phone.getByTestId('free-points')).toHaveText('0');
  // The laptop sees it too.
  await expect(laptop.getByTestId('free-points')).toHaveText('0');

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
