import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M6.4 titles (DESIGN §4 "Bonuses", §7 "Titles"): the GM defines a title in
// the library (System text, a percentage and a flat bonus), awards it, and the
// holder gets a DING with the text, the bonus on the sheet and in the pools.
// An edit reaches the holder live. Other players never receive the library or
// the title's text.

const GM_KEY = 'e2e-gm-key-m64-0123456789abcdef64';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M6.4');
const TEXT = 'You have propagated through the Host faster than any before you.';
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

test('the GM defines, awards and edits a title; only the holder sees its text and bonus', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Titles');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await reveal(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const watch = async (name: string, width: number, height: number) => {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = watchErrors(page);
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    return { page, frames, errors: pageErrors };
  };
  const jake = await watch('Jake', 390, 844);
  const kim = await watch('Kim', 1366, 768);
  await expect(jake.page.getByTestId('pool-hp')).toContainText('100/100');

  // Define a title: +10% Vitality and +5 flat Strength (0.5 on the sheet).
  const lib = gm.locator('section[aria-labelledby="title-library"]');
  await openWindow(gm, 'title-library');
  await expect(lib).toContainText('No titles yet.');
  const form = lib.locator('form[aria-labelledby="title-library-form"]');
  await form.getByLabel('Title name').fill('Rapid Spread');
  await form.getByLabel('System text (the holder sees this)').fill(TEXT);
  await form.getByLabel('Vitality percent').fill('ten');
  await expect(form.getByRole('button', { name: 'Add title' })).toBeDisabled();
  await form.getByLabel('Vitality percent').fill('10');
  await form.getByLabel('Strength flat').fill('5');
  await form.getByRole('button', { name: 'Add title' }).click();
  await expect(lib.getByRole('status')).toHaveText('[Rapid Spread] added to the library');
  const list = lib.getByRole('list', { name: 'Library titles' });
  await expect(list).toHaveText('[Rapid Spread] +0.5 Strength, +10% Vitality');

  // A second title with the same name in any case is refused.
  await form.getByLabel('Title name').fill('rapid spread');
  await form.getByRole('button', { name: 'Add title' }).click();
  await expect(lib.getByRole('alert')).toContainText('[Rapid Spread]');
  await form.getByLabel('Title name').fill('');

  // Award it to Jake.
  await list.getByRole('button', { name: /Rapid Spread/ }).click();
  const award = lib.getByRole('group', { name: /^Award \[Rapid Spread/ });
  await award.getByLabel('Character to award').selectOption({ label: 'Jake' });
  await award.getByRole('button', { name: 'Award title' }).click();
  await expect(lib.getByRole('status')).toHaveText('Jake earned [Rapid Spread]');
  await expect(award.getByRole('button', { name: 'Award title' })).toBeDisabled();
  await expect(award.getByTestId('title-already-held')).toHaveText(
    'Jake already holds [Rapid Spread]',
  );
  await expect(form.getByTestId('title-holders')).toHaveText(
    'Held by Jake. Edits reach every holder.',
  );

  await expect(jake.page.getByTestId('ding-toast')).toContainText(
    `*'DING!' Title earned: [Rapid Spread] - ${TEXT}*`,
  );
  const row = jake.page.getByTestId('title');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.skill-name')).toHaveText('[Rapid Spread]');
  await expect(jake.page.getByTestId('title-bonus')).toHaveText(' +0.5 Strength, +10% Vitality');
  await expect(jake.page.getByTestId('title-text')).toHaveText(TEXT);
  // Effective Vitality 10 × 1.1 = 11 → HP max 110; a full pool stays full.
  await expect(jake.page.getByTestId('pool-hp')).toContainText('110/110');
  await expect(jake.page.getByTestId('stat-strength').locator('strong')).toHaveText('1.5');
  await jake.page.getByTestId('titles').scrollIntoViewIfNeeded();
  await jake.page.screenshot({ path: path.join(shots, 'player-title-390x844.png') });

  // An edit reaches the holder live.
  await form.getByLabel('Vitality percent').fill('20');
  await form.getByRole('button', { name: 'Save title' }).click();
  await expect(lib.getByRole('status')).toHaveText('[Rapid Spread] saved');
  await expect(form.getByRole('button', { name: 'Save title' })).toBeDisabled();
  await expect(jake.page.getByTestId('title-bonus')).toHaveText(' +0.5 Strength, +20% Vitality');
  await expect(jake.page.getByTestId('pool-hp')).toContainText('120/120');

  // A rename follows the title to its holder, bonus and all.
  await form.getByLabel('Title name').fill('Rapid  Spread II');
  await form.getByRole('button', { name: 'Save title' }).click();
  await expect(lib.getByRole('status')).toHaveText('[Rapid Spread II] saved');
  await expect(row.locator('.skill-name')).toHaveText('[Rapid Spread II]');
  await expect(jake.page.getByTestId('title-bonus')).toHaveText(' +0.5 Strength, +20% Vitality');
  await expect(jake.page.getByTestId('pool-hp')).toContainText('120/120');
  await expect(form.getByTestId('title-holders')).toHaveText(
    'Held by Jake. Edits reach every holder.',
  );

  // Kim can be awarded it too; the GM sees the award control for her.
  await award.getByLabel('Character to award').selectOption({ label: 'Kim' });
  await expect(award.getByRole('button', { name: 'Award title' })).toBeEnabled();
  await lib.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-title-library-1366x768.png') });
  await award.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-title-award-1366x768.png') });

  // Kim holds no title: no Titles row, no text, no library in her frames.
  await expect(kim.page.getByTestId('titles')).toHaveCount(0);
  await expect(kim.page.getByTestId('pool-hp')).toContainText('100/100');
  await expect(kim.page.locator('body')).not.toContainText('propagated');
  expect(kim.frames.some((f) => f.includes('propagated'))).toBe(false);
  await kim.page.screenshot({ path: path.join(shots, 'player-no-title-1366x768.png') });
  for (const p of [jake, kim]) {
    expect(p.frames.length).toBeGreaterThan(0);
    expect(p.frames.some((f) => f.includes('"titleLibrary"') || f.includes(GM_KEY))).toBe(false);
    expect(p.errors).toEqual([]);
  }
  expect(errors).toEqual([]);
});
