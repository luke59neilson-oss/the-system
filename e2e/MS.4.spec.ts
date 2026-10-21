import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.4 Demo campaign: a GM menu entry loads a ready-made party in its own
// campaign; going back finds the real campaign exactly as it was.

const GM_KEY = 'e2e-gm-key-ms4-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MS.4');
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

const partyNames = (gm: Page) => gm.locator('[data-testid^="row-"] td:first-child').allInnerTexts();

test('the GM loads the demo campaign and returns to the real one untouched', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  const confirms: string[] = [];
  gm.on('dialog', (d) => {
    confirms.push(d.message());
    void d.accept();
  });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('My Real Campaign');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Ada');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Ada', exact: true })).toBeVisible();
  await gm.getByLabel('Amount').fill('150');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(gm.getByTestId('demo-badge')).toHaveCount(0);

  // A player of the real campaign is at the table.
  const ada = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const adaErrors = watchErrors(ada);
  await ada.goto(server.url);
  await ada.getByRole('link', { name: /Ada/ }).click();
  await expect(ada.getByTestId('class')).toHaveText('[Archer – lvl 1]');
  await expect(ada.getByTestId('dings').getByRole('listitem')).toHaveCount(2);
  const adaUrl = ada.url();

  // Load the demo: a different campaign with four characters at different levels.
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  expect(confirms).toHaveLength(1);
  // Ada's screen says what happened (and shows nothing of the demo).
  await expect(ada.getByRole('alert')).toContainText('switched to another campaign');
  await expect(ada.getByTestId('status')).toHaveCount(0);
  await expect(gm.getByRole('heading', { name: /Demo: The Whale/ })).toBeVisible();
  await expect.poll(() => partyNames(gm)).toEqual(['Jake', 'Miranda', 'Casper', 'Sultan']);
  const levels = await gm.locator('[data-testid^="class-level-"]').allInnerTexts();
  expect(levels).toEqual(['4', '3', '2', '0']);
  // Nothing of the real campaign shows in the demo (party, feed).
  await expect(gm.getByText('Ada')).toHaveCount(0);
  await gm.screenshot({ path: path.join(shots, 'gm-demo-1366x768.png') });

  // Players see the demo party and its System messages.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await expect(phone.getByRole('list').getByRole('link')).toHaveText([
    /Jake/,
    /Miranda/,
    /Casper/,
    /Sultan/,
  ]);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 4]');
  await expect(phone.getByTestId('demo-badge')).toBeVisible();
  await expect(phone.getByTestId('messages')).toContainText('The world is dying.');
  await phone.screenshot({ path: path.join(shots, 'player-demo-390x844.png'), fullPage: true });

  // The GM can play in the demo like any campaign.
  await gm.getByRole('checkbox', { name: 'Jake' }).uncheck();
  await gm.getByRole('checkbox', { name: 'Miranda' }).uncheck();
  await gm.getByRole('checkbox', { name: 'Casper' }).uncheck();
  await gm.getByLabel('Amount').fill('100');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(gm.getByTestId('class-level-demo-sultan')).toHaveText('1');

  // A player who (re)loads while the demo is open gets the notice too, and rejoins.
  const late = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const lateErrors = watchErrors(late);
  await late.goto(adaUrl);
  await expect(late.getByRole('alert')).toContainText('switched to another campaign');

  // Back to the real campaign: Ada exactly as she was, no demo anywhere.
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toHaveCount(0);
  await expect(gm.getByRole('heading', { name: /My Real Campaign/ })).toBeVisible();
  await expect.poll(() => partyNames(gm)).toEqual(['Ada']);
  await expect(gm.locator('[data-testid^="class-level-"]')).toHaveText(['1']);
  await expect(gm.getByText('Sultan')).toHaveCount(0);
  const exported = await gm.evaluate(
    (key) => fetch('/api/gm/export', { headers: { 'x-gm-key': key } }).then((r) => r.text()),
    GM_KEY,
  );
  expect(exported).toContain('Ada');
  expect(exported).not.toContain('demo-');
  expect(exported).not.toContain('Demo: The Whale');

  await expect(late.getByTestId('class')).toHaveText('[Archer – lvl 1]', { timeout: 8000 });
  // Ada's screen rejoins on its own with her sheet and DINGs, nothing of the demo.
  await expect(ada.getByTestId('class')).toHaveText('[Archer – lvl 1]', { timeout: 8000 });
  await expect(ada.getByTestId('demo-badge')).toHaveCount(0);
  await expect(ada.getByTestId('dings').getByRole('listitem')).toHaveCount(2);
  await expect(ada.getByTestId('messages')).toHaveCount(0);
  // The GM feed still holds the real campaign's DINGs (one hub per campaign).
  await expect(gm.getByRole('listitem').filter({ hasText: 'Ada' }).first()).toBeVisible();
  await expect(gm.getByRole('listitem').filter({ hasText: 'Sultan' })).toHaveCount(0);
  // The demo phone waits with a notice instead of falling back to real data.
  await expect(phone.getByRole('alert')).toContainText('switched to another campaign');
  await expect(phone.getByTestId('status')).toHaveCount(0);

  // Loading the demo again keeps what the GM did there; the demo phone rejoins.
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('class-level-demo-sultan')).toHaveText('1');
  await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 4]', { timeout: 8000 });
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect.poll(() => partyNames(gm)).toEqual(['Ada']);

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(adaErrors).toEqual([]);
  expect(lateErrors).toEqual([]);
  await Promise.all([gm.close(), phone.close(), ada.close(), late.close()]);
});
