import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal as revealWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MV.3 (DESIGN §7 "Identify"): the GM makes a bestiary category, files a
// creature under it and marks it identified by Kim. Kim's phone shows the
// Identify notification front and centre; she closes it and finds the
// creature under that category in her Bestiary. Jake, not ticked, never gets
// it, and no GM name, notes or unused category reach either phone.

const GM_KEY = 'e2e-gm-key-mv3-0123456789abcdefmv3';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MV.3');
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

test('Identified by… notifies Kim and files the creature in her bestiary', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await revealWindow(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const phones: Record<string, { page: Page; frames: string[]; errors: string[] }> = {};
  for (const name of ['Kim', 'Jake']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    const pageErrors = watchErrors(page);
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    phones[name] = { page, frames, errors: pageErrors };
  }
  const kim = phones['Kim']!.page;
  const jake = phones['Jake']!.page;

  const win = gm.locator('section[aria-labelledby="bestiary"]');
  await openWindow(gm, 'bestiary');
  const cats = win.getByRole('group', { name: 'Bestiary categories' });
  for (const name of ['Beasts', 'SECRET Antibodies']) {
    await cats.getByPlaceholder('New category').fill(name);
    await cats.getByRole('button', { name: 'Add category' }).click();
    await expect(win.getByRole('status')).toHaveText(`Category ${name} added`);
  }
  const form = win.locator('form[aria-labelledby="bestiary-form"]');
  await form.getByLabel('Name (GM only)').fill('SECRET Pale stalker (immune cell)');
  await form.getByLabel('Label players see (blank: the name)').fill('Pale stalker');
  await form.getByLabel('Category').selectOption({ label: 'Beasts' });
  await form.getByLabel('Grade').selectOption('G');
  await form.getByLabel('Level').fill('0');
  await form
    .getByLabel(/^Identify text/)
    .fill('[Pale Stalker – lvl 0] A blind hunter of the warm.');
  await form.getByLabel('Notes (GM only)').fill('SECRET hunts by body heat');
  await form.getByRole('button', { name: 'Add entry' }).click();
  await expect(win.getByRole('status')).toHaveText(
    'SECRET Pale stalker (immune cell) added to the bestiary',
  );
  const list = win.getByRole('list', { name: 'Bestiary entries' });
  await list.getByRole('button', { name: /Pale stalker/ }).click();
  const by = win.getByRole('group', { name: /Identified by/ });
  await by.getByLabel('Kim').check();
  await by.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-identified-by-1366x768.png') });
  await by.getByRole('button', { name: 'Mark identified' }).click();
  await expect(win.getByRole('status')).toHaveText('Kim identified Pale stalker');
  await expect(list).toContainText('Beasts · identified by Kim');

  // Kim: the notification is front and centre until she closes it.
  const notice = kim.getByTestId('identify-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Pale stalker');
  // The tier's own "[Pale Stalker – lvl 0]" repeats the header, so it shows once (QF.62).
  await expect(notice).toContainText('[Pale stalker (G) – lvl 0]A blind hunter of the warm.');
  await kim.screenshot({ path: path.join(shots, 'player-identify-notice-390x844.png') });
  await notice.getByRole('button', { name: 'Close' }).click();
  await expect(notice).toHaveCount(0);
  const bestiary = kim.getByTestId('identify');
  await expect(bestiary.getByRole('heading', { name: 'Bestiary' })).toBeVisible();
  const beasts = bestiary.getByRole('group', { name: 'Beasts' });
  await beasts.getByRole('button', { name: 'Pale stalker' }).click();
  await expect(bestiary.getByTestId('identify-text')).toHaveText('A blind hunter of the warm.');
  await bestiary.scrollIntoViewIfNeeded();
  await kim.screenshot({ path: path.join(shots, 'player-bestiary-390x844.png') });
  // A reload keeps it closed (closing is recorded, not a local dismissal).
  await kim.reload();
  await expect(kim.getByTestId('connection')).toHaveText('Connected');
  await expect(kim.getByTestId('identify').getByRole('group', { name: 'Beasts' })).toBeVisible();
  await expect(kim.getByTestId('identify-notice')).toHaveCount(0);

  // Jake was not ticked: nothing in his bestiary, no notification.
  await expect(jake.getByTestId('identify')).toContainText('Nothing identified yet.');
  await expect(jake.getByTestId('identify-notice')).toHaveCount(0);

  for (const name of ['Kim', 'Jake']) {
    const { frames, errors: pageErrors } = phones[name]!;
    for (const secret of ['SECRET', 'immune cell', 'body heat', GM_KEY]) {
      expect(
        frames.filter((f) => f.includes(secret)),
        `${name}: ${secret}`,
      ).toEqual([]);
    }
    if (name === 'Jake') expect(frames.filter((f) => f.includes('Pale stalker'))).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
  expect(errors).toEqual([]);
});
