import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.2 Status screen: the DESIGN §9 layout in order, rarity-coloured skills
// with nicknames, the grade metal as the frame, and live updates.

const GM_KEY = 'e2e-gm-key-m32-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.2');
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

test('status screens follow DESIGN §9 and update live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Status Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // Jake (D-grade, profession, titles, a nickname) on a laptop.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const laptopErrors = watchErrors(laptop);
  await laptop.goto(`${server.url}/play/demo-jake`);
  const status = laptop.getByTestId('status');
  await expect(laptop.getByTestId('connection')).toHaveText('Connected');
  await expect(status.locator('dt')).toHaveText([
    'Name',
    'Race',
    'Class',
    'Profession',
    'Health Points (HP)',
    'Mana Points (MP)',
    'Stamina',
    'Free points',
    'Titles',
  ]);
  await expect(status.locator('h2, h3')).toHaveText([
    'Status',
    'Stats',
    'Class Skills',
    'Profession Skills',
    'Race Skills',
  ]);
  await expect(laptop.getByTestId('race')).toHaveText('[Human (D) – lvl 51]');
  await expect(laptop.getByTestId('class')).toHaveText('[Tempest Warden – lvl 52]');
  await expect(laptop.getByTestId('profession')).toHaveText('[Alchemist – lvl 50]');
  await expect(laptop.getByTestId('title')).toHaveText(['[Forerunner]', '[Rapid Spread]']);
  await expect(laptop.getByTestId(/^stat-/)).toHaveCount(9);
  // The grade metal frames the window.
  await expect(status).toHaveClass(/theme-silver/);
  // Skills: bracketed official name with rarity, coloured by rarity; nickname beside.
  const classSkills = laptop.getByTestId('skills-class').getByTestId('skill');
  await expect(classSkills.first()).toHaveText(/^\[[^\]]+ \([A-Z][a-z]+\)\] “Old Faithful”$/);
  const epic = classSkills.filter({ hasText: '(Epic)]' });
  await expect(epic).toHaveCount(1);
  await expect(epic).toHaveClass(/rarity-epic/);
  // Rarity colours (placeholders until the M8.1 themes): Epic purple, Common white.
  await expect(epic.locator('.skill-name')).toHaveCSS('color', 'rgb(199, 155, 255)');
  await expect(laptop.getByTestId('skills-race').locator('.skill-name')).toHaveCSS(
    'color',
    'rgb(230, 236, 245)',
  );
  await expect(laptop.getByTestId('skills-race')).toHaveText('[Identify (Common)]');
  await laptop.screenshot({ path: path.join(shots, 'jake-1366x768.png'), fullPage: true });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('class')).toHaveText('[Tempest Warden – lvl 52]');
  // Single column at phone width: nothing wider than the screen.
  // (A string expression: the e2e tsconfig has no DOM lib.)
  const overflow = await phone.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await phone.screenshot({ path: path.join(shots, 'jake-390x844.png'), fullPage: true });

  // Sultan (G-grade): no profession rows; aluminum frame.
  const sultan = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const sultanErrors = watchErrors(sultan);
  await sultan.goto(`${server.url}/play/demo-sultan`);
  await expect(sultan.getByTestId('connection')).toHaveText('Connected');
  await expect(sultan.getByTestId('status')).toHaveClass(/theme-aluminum/);
  await expect(sultan.getByTestId('profession')).toHaveCount(0);
  await expect(sultan.getByText('Profession Skills')).toHaveCount(0);
  await expect(sultan.getByTestId('titles')).toHaveCount(0);
  await expect(sultan.getByTestId('class')).toHaveText('[Archer – lvl 0]');
  await expect(sultan.locator('.flash')).toHaveCount(0);
  await expect(sultan.getByTestId('free-points')).toHaveText('0');
  await expect(sultan.getByTestId('pool-stamina')).toHaveText('100/100');
  await expect(sultan.getByTestId('stat-endurance')).toContainText('1.0');

  // Live: the GM awards Sultan XP; his level changes and glows, nothing reloads.
  for (const name of ['Jake', 'Miranda', 'Casper']) {
    await openWindow(gm, 'award-xp');
    await gm.getByRole('checkbox', { name }).uncheck();
  }
  await gm.getByLabel('Amount').fill('100');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(sultan.getByTestId('class')).toHaveText('[Archer – lvl 1]');
  await expect(sultan.getByTestId('race')).toHaveText('[Human (G) – lvl 1]');
  await expect(sultan.locator('dd.flash').filter({ has: sultan.getByTestId('class') })).toHaveCount(
    1,
  );
  // The level's class spread and free points land too: stats, pool maximum,
  // pool bar and free points, each glowing.
  await expect(sultan.getByTestId('stat-endurance')).toContainText('1.1');
  await expect(sultan.getByTestId('stat-endurance').locator('strong.flash')).toHaveCount(1);
  // A full pool stays full as the maximum rises (MQ.2, D100).
  await expect(sultan.getByTestId('pool-stamina')).toHaveText('110/110');
  await expect(sultan.getByTestId('pool-bar-stamina')).toHaveAttribute('style', /width: 100%/);
  await expect(
    sultan.locator('dd.flash').filter({ has: sultan.getByTestId('pool-stamina') }),
  ).toHaveCount(1);
  await expect(sultan.getByTestId('free-points')).toHaveText('2');
  await expect(
    sultan.locator('dd.flash').filter({ has: sultan.getByTestId('free-points') }),
  ).toHaveCount(1);
  await sultan.screenshot({ path: path.join(shots, 'sultan-live-390x844.png'), fullPage: true });
  // Jake's own sheet did not change (his party view, M3.12, follows Sultan).
  await expect(laptop.getByTestId('class')).toHaveText('[Tempest Warden – lvl 52]');
  await expect(laptop.getByTestId('status').locator('.flash')).toHaveCount(0);

  // The GM's View-as pane (MS.3, compact) shows the same sheet without
  // sideways scrolling, even in a quarter-width Table-view pane.
  const pane = await browser.newPage({ viewport: { width: 340, height: 600 } });
  const paneErrors = watchErrors(pane);
  await pane.goto(`${server.url}/play/demo-jake?pane=1`);
  await expect(pane.getByTestId('class')).toHaveText('[Tempest Warden – lvl 52]');
  await expect(pane.getByTestId('skills-class').getByTestId('skill')).toHaveCount(10);
  expect(
    await pane.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  ).toBeLessThanOrEqual(0);
  await pane.screenshot({ path: path.join(shots, 'pane-340x600.png'), fullPage: true });
  expect(paneErrors).toEqual([]);

  expect(gmErrors).toEqual([]);
  expect(laptopErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(sultanErrors).toEqual([]);
});
