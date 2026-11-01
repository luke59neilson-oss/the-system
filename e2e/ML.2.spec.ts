import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab, openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ML.2 (DESIGN §2 "The GM lays these out in the library", Q93): the GM lays
// out Archer's points per class level at G (+1 Str, +2 Agi, +3 Int, 2 free),
// with the budget reminder and a warning until they total 8; a character
// created from it takes those points when it levels up.

const GM_KEY = 'e2e-gm-key-ml2-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ML.2');
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

test('the GM lays out Archer’s points at G; a new Archer levels up by them', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Points Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  const lib = gm.locator('section[aria-labelledby="origin-library"]');
  await openWindow(gm, 'origin-library');
  const classes = lib.getByRole('list', { name: 'Library classes' });
  await classes.getByRole('button', { name: /\[Archer\]/ }).click();
  await expect(lib.getByRole('heading', { name: 'Edit [Archer]' })).toBeVisible();

  const points = lib.getByTestId('entry-points');
  const budget = lib.getByTestId('points-budget');
  const warning = lib.getByTestId('points-warning');
  // A class from before ML.2 shows its weights as converted points: 8 at G.
  await expect(budget).toHaveText('G-grade budget for a class level: 8 · these total 8');
  await expect(warning).toHaveCount(0);
  await expect(lib.getByTestId('weights-unused')).toHaveCount(0);

  // Lay out Luke's example from scratch.
  for (const input of await points.locator('input').all()) await input.fill('');
  await expect(warning).toContainText('No points set');
  await lib.getByTestId('points-strength').fill('1');
  await lib.getByTestId('points-agility').fill('2');
  await expect(budget).toHaveText('G-grade budget for a class level: 8 · these total 3');
  await expect(warning).toContainText('These total 3; the G-grade budget for a class level is 8');
  await lib.getByTestId('points-intelligence').fill('3');
  await expect(warning).toContainText('These total 6');
  await lib.getByTestId('points-free').fill('2');
  await expect(warning).toHaveCount(0);
  await expect(budget).toHaveText('G-grade budget for a class level: 8 · these total 8');
  await points.scrollIntoViewIfNeeded();
  await lib.screenshot({ path: path.join(shots, 'gm-archer-points-1366x768.png') });
  await lib.getByRole('button', { name: 'Save changes' }).click();
  await expect(lib.getByRole('status')).toHaveText('[Archer] saved');

  // The card shows the points, and the weights say they are not in use.
  await expect(
    classes.getByRole('button', { name: /\[Archer\]/ }).getByTestId('entry-points-summary'),
  ).toHaveText('Per level: Intelligence +3 · Agility +2 · Strength +1 · +2 free');

  // Reopening it reads the points back.
  await classes.getByRole('button', { name: /\[Archer\]/ }).click();
  await expect(lib.getByTestId('points-intelligence')).toHaveValue('3');
  await expect(lib.getByTestId('points-free')).toHaveValue('2');
  await expect(lib.getByTestId('weights-unused')).toBeVisible();

  // Races remind of the race budget.
  await lib
    .getByRole('group', { name: 'Library' })
    .getByRole('button', { name: /^Races/ })
    .click();
  await lib
    .getByRole('list', { name: 'Library races' })
    .getByRole('button', { name: /\[Human\]/ })
    .click();
  await expect(budget).toHaveText('G-grade budget for a race level: 5 · these total 0');
  await expect(warning).toContainText('all free points (Human)');

  // A new Archer takes the entry's points.
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByLabel('Starting class').selectOption({ label: 'Archer' });
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  const stat = (id: string) => phone.getByTestId(`stat-${id}`).locator('strong');
  await expect(stat('strength')).toHaveText(/^1\.0$|^10$/);

  // One class level (100 XP at G).
  await openTab(gm, 'session');
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Amount').fill('100');
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(award.getByRole('status')).toHaveText('Awarded 100 class XP to Jake.');

  // Class level 1: +1 Str +2 Agi +3 Int +2 free; before a profession, the
  // profession's 5 by the class's shape (+1 Str +1 Agi +2 Int +1 free);
  // race level 1: 5 free (Human).
  await expect(stat('strength')).toHaveText(/^1\.2$|^12$/);
  await expect(stat('agility')).toHaveText(/^1\.3$|^13$/);
  await expect(stat('intelligence')).toHaveText(/^1\.5$|^15$/);
  await expect(stat('perception')).toHaveText(/^1\.0$|^10$/);
  await expect(phone.getByTestId('free-points')).toHaveText('8');
  await phone.screenshot({ path: path.join(shots, 'player-after-level-390x844.png') });

  expect(gmErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
