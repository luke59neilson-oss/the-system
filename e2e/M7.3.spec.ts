import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.3 encounter panel (DESIGN §7, D88, D115): the GM rolls a contest with the
// grade-gap mode and shares it (the player gets a result pop-up; an NPC's GM
// name and stats never reach them), applies damage to a pool, runs a progress
// clock to its montage trigger and offers the montage.

const GM_KEY = 'e2e-gm-key-m73-0123456789abcdef73';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M7.3');
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

test('the GM rolls and shares contests, deals damage and runs a clock', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Fights');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await reveal(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  // An E-grade bestiary entry: two grades above the G-grade party.
  const bestiary = gm.locator('form[aria-labelledby="bestiary-form"]');
  await openWindow(gm, 'bestiary');
  await bestiary.getByLabel('Name (GM only)').fill('SECRET Beast Lord');
  await bestiary.getByLabel('Label players see (blank: the name)').fill('Beast Lord');
  await bestiary.getByLabel('Grade').selectOption('E');
  await bestiary.getByLabel('Level').fill('20');
  await bestiary.getByLabel('Strength').fill('31337');
  await bestiary.getByLabel('Common', { exact: true }).fill('[A looming shape]');
  await bestiary.getByRole('button', { name: 'Add entry' }).click();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const win = gm.locator('section[aria-labelledby="encounter"]');
  const roller = win.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  await openWindow(gm, 'encounter');
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });
  await expect(sideA.getByRole('textbox', { name: 'Value', exact: true })).toHaveValue('10');
  await expect(sideA.getByRole('textbox', { name: 'Players see', exact: true })).toHaveValue(
    'Jake · Perception',
  );

  // A grade wall: two grades above, no roll, the higher grade wins.
  await openWindow(gm, 'bestiary');
  await sideB.getByLabel('Who').selectOption({ label: 'SECRET Beast Lord (bestiary)' });
  await sideB.getByLabel('Stat').selectOption({ label: 'Strength' });
  await expect(sideB.getByRole('textbox', { name: 'Value', exact: true })).toHaveValue('31337');
  await expect(sideB.getByLabel('Grade')).toHaveValue('E');
  await expect(sideB.getByRole('textbox', { name: 'Players see', exact: true })).toHaveValue(
    'Beast Lord',
  );
  await expect(roller.getByTestId('contest-chance')).toHaveText(
    'Grade wall: Beast Lord succeeds, no roll',
  );
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(roller.getByTestId('contest-result')).toContainText(
    'Beast Lord wins: a grade wall, no roll',
  );
  await expect(page.getByTestId('contest-popup')).toHaveCount(0);
  await roller.getByRole('button', { name: 'Share with the table' }).click();
  await openWindow(gm, 'encounter');
  await expect(win.getByRole('status').last()).toHaveText('Shared with the table');
  const popup = page.getByTestId('contest-popup');
  await expect(popup).toContainText('[Jake · Perception] vs [Beast Lord]');
  await expect(popup).toContainText('A grade wall decides it: no roll.');
  await expect(popup).toContainText('Failure.');
  await page.screenshot({ path: path.join(shots, 'player-contest-popup-390x844.png') });
  await popup.getByRole('button', { name: 'OK' }).click();
  await expect(popup).toHaveCount(0);

  // Same grade, pure ratio odds: Jake's Perception 1.0 against Kim's Agility 1.0.
  await sideB.getByLabel('Who').selectOption({ label: 'Kim' });
  await sideB.getByLabel('Stat').selectOption({ label: 'Agility' });
  await roller.getByLabel('Grade-gap mode').selectOption('none');
  await expect(roller.getByTestId('contest-chance')).toHaveText(
    'Jake · Perception: 50% · Kim · Agility: 50%',
  );
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(roller.getByTestId('contest-result')).toContainText(
    '(Jake · Perception 50%, rolled',
  );
  await roller.getByRole('button', { name: 'Share with the table' }).click();
  await expect(popup).toContainText('[Jake · Perception] vs [Kim · Agility]');
  await expect(popup).toContainText('Your chance: 50%');
  await expect(popup).toContainText(/Success\.|Failure\./);
  await expect(win.getByRole('list', { name: 'Shared rolls' }).getByRole('listitem')).toHaveCount(
    2,
  );
  await popup.getByRole('button', { name: 'OK' }).click();

  // Damage: 30 to Jake's HP at full damage.
  const pools = win.locator('form[aria-labelledby="pool-tool"]');
  await openWindow(gm, 'encounter');
  await pools.getByLabel('Character').selectOption({ label: 'Jake' });
  await pools.getByLabel('Points', { exact: true }).fill('30');
  await expect(pools.getByTestId('pool-preview')).toHaveText(
    'Health Points (HP) 100 → 70 / 100 · full damage',
  );
  await pools.getByRole('button', { name: 'Apply' }).click();
  await expect(win.getByRole('status').last()).toHaveText(
    'Jake took 30 Health Points (HP) (70/100)',
  );
  await expect(page.getByTestId('pool-hp')).toContainText('70/100');

  // A clock reaches half with no failures: the montage trigger appears.
  const clocks = win.locator('[aria-labelledby="clocks"]');
  await clocks.getByLabel('Clock name').fill('Cross the marsh');
  await clocks.getByLabel('Segments').fill('4');
  await clocks.getByRole('button', { name: 'Start clock' }).click();
  const clock = clocks.getByRole('listitem', { name: '[Cross the marsh]' });
  await expect(clock).toContainText('0/4');
  await expect(clock.getByRole('button', { name: 'Offer montage' })).toHaveCount(0);
  await clock.getByRole('button', { name: 'Success +1' }).click();
  await expect(clock).toContainText('1/4');
  await clock.getByRole('button', { name: 'Success +1' }).click();
  await expect(clock).toContainText('2/4');
  await clock.getByRole('button', { name: 'Offer montage' }).click();
  await clock.getByLabel('Players see').fill('Crossing the black marsh');
  await clock.getByRole('checkbox', { name: 'Kim' }).uncheck();
  await clock.getByRole('button', { name: 'Offer', exact: true }).click();
  await expect(win.getByRole('status').last()).toHaveText('Montage offered to Jake');
  await expect(clock).toContainText('Montage “Crossing the black marsh”: waiting on Jake');
  await expect(page.getByText('Crossing the black marsh')).toBeVisible();
  await clocks.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-encounter-clocks-1366x768.png') });
  await roller.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-encounter-roller-1366x768.png') });
  await clock.getByRole('button', { name: 'Close montage' }).click();
  await expect(clock).not.toContainText('Montage “');
  await expect(page.getByText('Crossing the black marsh')).toHaveCount(0);

  // The NPC's GM name and stats never reached the player.
  for (const secret of ['SECRET', '31337']) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
