import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { usePreMeRules } from './helpers/preMeRules';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MV.1 Assign any number of free points at once (DESIGN §4, L25): one panel
// over every waiting level-up; spend any amount, review, confirm once; the
// rest stays unassigned for later.

const GM_KEY = 'e2e-gm-key-mv1-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MV.1');
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

async function addCharacter(gm: Page, name: string) {
  await openWindow(gm, 'create-character');
  await gm.getByLabel('Name', { exact: true }).fill(name);
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
}

async function openPlayer(page: Page, name: string) {
  await page.goto(server.url);
  await page.getByRole('link', { name: new RegExp(name) }).click();
}

async function add(page: Page, stat: string, times: number) {
  const button = page.getByTestId('assign').getByRole('button', { name: `Add a point to ${stat}` });
  for (let i = 0; i < times; i += 1) await button.click();
}

test('three waiting level-ups in one confirm; another player keeps points back', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Points At Once');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  // The free-point numbers of a campaign created before ME (D300; ME.1.spec
  // covers the new budgets).
  await usePreMeRules(gm, GM_KEY);
  await addCharacter(gm, 'Jake');
  await addCharacter(gm, 'Kim');
  // 600 XP shared by both: 300 each, three class levels, three level-ups of 2.
  const form = gm.locator('form[aria-labelledby="award-xp"]');
  await openWindow(gm, 'award-xp');
  await gm.getByLabel('Amount').fill('600');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(form.getByRole('status').or(form.getByRole('alert'))).toHaveText(/^Awarded 600 /);

  // Jake spends all six points from three level-ups in one confirm.
  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const jakeErrors = watchErrors(jake);
  await openPlayer(jake, 'Jake');
  await expect(jake.getByTestId('free-points')).toHaveText('6');
  await jake.getByRole('button', { name: '[Assign]' }).click();
  const panel = jake.getByTestId('assign');
  await expect(panel.getByTestId('assign-total')).toHaveText(
    '6 points to assign from 3 level-ups. Spend any number; the rest wait for later.',
  );
  await add(jake, 'Agility', 3);
  await add(jake, 'Perception', 3);
  await expect(jake.getByTestId('points-left')).toHaveText('Points left: 0');
  await expect(panel.getByRole('button', { name: 'Add a point to Strength' })).toBeDisabled();
  const width = await jake.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await panel.scrollIntoViewIfNeeded();
  await jake.screenshot({ path: path.join(shots, 'player-assign-all-390x844.png') });
  await panel.getByRole('button', { name: 'Review' }).click();
  await expect(jake.getByTestId('assign-review')).toHaveText(
    'Assign +3 Agility, +3 Perception? Assigned points lock; only the GM can change them.',
  );
  await panel.getByRole('button', { name: 'Confirm' }).click();
  await expect(panel).toHaveCount(0);
  await expect(jake.getByTestId('free-points')).toHaveText('0');
  await expect(jake.getByRole('button', { name: '[Assign]' })).toHaveCount(0);
  await expect(jake.getByTestId('assign-notice')).toHaveCount(0);
  const locked = jake.getByTestId('locked-points');
  await locked.getByText('Assigned points (locked)').click();
  // History stays per level-up, oldest first.
  await expect(locked.getByRole('listitem')).toHaveText([
    'Race level 1: +2 Agility',
    'Race level 2: +1 Agility, +1 Perception',
    'Race level 3: +2 Perception',
  ]);
  await locked.scrollIntoViewIfNeeded();
  await jake.screenshot({ path: path.join(shots, 'player-assigned-390x844.png') });

  // Kim spends three and keeps three back.
  const kim = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const kimErrors = watchErrors(kim);
  await openPlayer(kim, 'Kim');
  await expect(kim.getByTestId('free-points')).toHaveText('6');
  await kim.getByRole('button', { name: '[Assign]' }).click();
  const kimPanel = kim.getByTestId('assign');
  await add(kim, 'Wisdom', 3);
  await expect(kim.getByTestId('points-left')).toHaveText('Points left: 3');
  await kimPanel.getByRole('button', { name: 'Review' }).click();
  await expect(kim.getByTestId('assign-review')).toHaveText(
    'Assign +3 Wisdom? Assigned points lock; only the GM can change them. 3 points stay unassigned for later.',
  );
  await kimPanel.scrollIntoViewIfNeeded();
  await kim.screenshot({ path: path.join(shots, 'player-keep-back-review-390x844.png') });
  await kimPanel.getByRole('button', { name: 'Confirm' }).click();
  await expect(kimPanel).toHaveCount(0);
  await expect(kim.getByTestId('free-points')).toHaveText('3');
  const kimLocked = kim.getByTestId('locked-points');
  await kimLocked.getByText('Assigned points (locked)').click();
  await expect(kimLocked.getByRole('listitem')).toHaveText([
    'Race level 1: +2 Wisdom',
    'Race level 2: +1 Wisdom (1 still to assign)',
  ]);
  // The rest later: the partly used level-up finishes first.
  await kim.getByRole('button', { name: '[Assign]' }).click();
  await expect(kimPanel.getByTestId('assign-total')).toHaveText(
    '3 points to assign from 2 level-ups. Spend any number; the rest wait for later.',
  );
  await add(kim, 'Intelligence', 1);
  await kimPanel.getByRole('button', { name: 'Review' }).click();
  await kimPanel.getByRole('button', { name: 'Confirm' }).click();
  await expect(kim.getByTestId('free-points')).toHaveText('2');
  await expect(kimLocked.getByRole('listitem')).toHaveText([
    'Race level 1: +2 Wisdom',
    'Race level 2: +1 Wisdom, +1 Intelligence',
  ]);
  await kim.screenshot({ path: path.join(shots, 'player-kept-back-390x844.png') });

  expect(gmErrors).toEqual([]);
  expect(jakeErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
});
