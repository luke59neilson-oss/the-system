import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal as revealWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.2 bestiary and NPCs (DESIGN §7 "Identify", D84, D123, D181; MV.3): the
// GM adds an entry with grade, level, stats, one Identify text and notes, is
// warned that its label gives away an out-of-range target, renames the
// label and marks it identified by Jake while out of range: he sees only the
// label and `[??? – lvl ???]`, and keeps that after the GM edits its level
// down, until the GM marks it again. Stats, notes and the GM name never
// reach him.

const GM_KEY = 'e2e-gm-key-m72-0123456789abcdef72';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M7.2');
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

test('the GM keeps a bestiary; players see only labels and what Identify told them', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Beasts');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await revealWindow(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const win = gm.locator('section[aria-labelledby="bestiary"]');
  await openWindow(gm, 'bestiary');
  await expect(win).toContainText('Nothing in the bestiary yet.');
  const form = win.locator('form[aria-labelledby="bestiary-form"]');
  await form.getByLabel('Name (GM only)').fill('SECRET Pale hunter');
  await form.getByLabel('Grade').selectOption('F');
  await form.getByLabel('Level').fill('12');
  await form.getByLabel('Strength').fill('31337');
  await form.getByLabel('Vitality').fill('45');
  await form.getByLabel(/^Identify text/).fill('[A pale shape]');
  await form.getByLabel('Notes (GM only)').fill('SECRET hunts in pairs');
  // The label defaults to the name, which a G-grade player could read.
  await expect(form.getByTestId('bestiary-label-leak')).toContainText('Jake, Kim cannot Identify');
  await form.getByLabel('Label players see (blank: the name)').fill('Pale stalker (F)');
  await expect(form.getByTestId('bestiary-label-leak')).toBeVisible();
  await form.getByTestId('bestiary-label-leak').scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-bestiary-label-warning-1366x768.png') });
  await form.getByLabel('Label players see (blank: the name)').fill('Pale stalker');
  await expect(form.getByTestId('bestiary-label-leak')).toHaveCount(0);
  await form.getByRole('button', { name: 'Add entry' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET Pale hunter added to the bestiary');
  const list = win.getByRole('list', { name: 'Bestiary entries' });
  await expect(list).toHaveText(
    'SECRET Pale hunter players see “Pale stalker” · (F) lvl 12 · Uncategorized · identified by nobody',
  );

  // Jake identifies it out of range: the label and [??? – lvl ???], no text.
  await list.getByRole('button', { name: /Pale hunter/ }).click();
  await expect(form.getByLabel('Strength')).toHaveValue('31337');
  const by = win.getByRole('group', { name: /Identified by/ });
  await by.getByLabel('Jake').check();
  await by.getByRole('button', { name: 'Mark identified' }).click();
  await expect(win.getByRole('status')).toHaveText(
    'Jake sees [??? – lvl ???] (out of Identify range)',
  );
  await expect(list).toContainText('identified by Jake (???)');
  const notice = page.getByTestId('identify-notice');
  await expect(notice).toContainText('Pale stalker');
  await expect(notice).toContainText('[??? – lvl ???]');
  await expect(notice.getByTestId('identify-text')).toHaveCount(0);
  await notice.getByRole('button', { name: 'Close' }).click();
  await expect(notice).toHaveCount(0);
  const identify = page.getByTestId('identify');
  await identify.getByRole('button', { name: 'Pale stalker' }).click();
  await expect(identify.getByTestId('identify-header')).toHaveText('[??? – lvl ???]');
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-bestiary-1366x768.png') });

  // Edit it down to G-grade level 0: the kept result does not change...
  await form.getByLabel('Grade').selectOption('G');
  await form.getByLabel('Level').fill('0');
  await form.getByRole('button', { name: 'Save entry' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET Pale hunter saved');
  await expect(form.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  await expect(identify.getByTestId('identify-header')).toHaveText('[??? – lvl ???]');
  await expect(identify).not.toContainText('[A pale shape]');
  // ...until the GM marks it again (Jake looks again): now he reads the text.
  await by.getByLabel('Jake').check();
  await by.getByRole('button', { name: 'Mark identified' }).click();
  await expect(win.getByRole('status')).toHaveText('Jake identified Pale stalker');
  await expect(notice).toContainText('[A pale shape]');
  await notice.getByRole('button', { name: 'Close' }).click();
  await expect(identify.getByTestId('identify-text')).toHaveText('[A pale shape]');
  await identify.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-identify-390x844.png') });

  for (const secret of ['SECRET', '31337', 'hunts in pairs', GM_KEY]) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
