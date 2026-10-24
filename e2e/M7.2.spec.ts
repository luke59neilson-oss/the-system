import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.2 bestiary and NPCs (DESIGN §7 "Identify", D84, D123, D181): the GM adds
// an entry with grade, level, stats, Identify tiers and notes, is warned that
// its label gives away an out-of-range target, renames the label, reveals it
// to one character and edits its level. The player sees only the label and
// `[??? – lvl ???]` while out of range; stats, notes and the GM name never
// reach them.

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

test('the GM keeps a bestiary; players see only labels and unlocked tiers', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Beasts');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
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
  await expect(win).toContainText('Nothing in the bestiary yet.');
  const form = win.locator('form[aria-labelledby="bestiary-form"]');
  await form.getByLabel('Name (GM only)').fill('SECRET Pale hunter');
  await form.getByLabel('Grade').selectOption('F');
  await form.getByLabel('Level').fill('12');
  await form.getByLabel('Strength').fill('31337');
  await form.getByLabel('Vitality').fill('45');
  await form.getByLabel('Common', { exact: true }).fill('[A pale shape]');
  await form.getByLabel('Rare', { exact: true }).fill('SECRET [Immune cell]');
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
    'SECRET Pale hunter players see “Pale stalker” · (F) lvl 12 · known by nobody',
  );

  // Reveal to Jake: he sees the label out of range, no text.
  await list.getByRole('button', { name: /Pale hunter/ }).click();
  await expect(form.getByLabel('Strength')).toHaveValue('31337');
  const reveal = win.getByRole('group', { name: 'Reveal SECRET Pale hunter' });
  await reveal.getByLabel('Reveal to').selectOption({ label: 'Jake' });
  await reveal.getByRole('button', { name: 'Reveal' }).click();
  await expect(win.getByRole('status')).toHaveText('Jake can now Identify Pale stalker');
  const identify = page.getByTestId('identify');
  await expect(identify).toContainText('Pale stalker');
  await identify.getByRole('button', { name: /Pale stalker/ }).click();
  await expect(identify).toContainText('[??? – lvl ???]');
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-bestiary-1366x768.png') });

  // Edit it down to G-grade level 0: in range, Jake reads the Common tier.
  await form.getByLabel('Grade').selectOption('G');
  await form.getByLabel('Level').fill('0');
  await form.getByRole('button', { name: 'Save entry' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET Pale hunter saved');
  await expect(identify).toContainText('[A pale shape]');
  await expect(form.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  await identify.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-identify-390x844.png') });

  for (const secret of ['SECRET', '31337', 'hunts in pairs', GM_KEY]) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
