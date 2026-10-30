import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.25 (sweep B, UX): the GM's level/XP/grade override keeps keyboard focus.
// Review override, Cancel and Apply each unmount the focused button, so focus
// moves on purpose: to the warning, back to Review override, or to the outcome.

const GM_KEY = 'e2e-gm-key-qf25-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.25');
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

test('keyboard focus follows the override warning from Review to Cancel and Apply', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Focus');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  const party = gm.locator('section[aria-labelledby="party"]');
  const card = party.locator('[data-testid^="row-"]', { hasText: 'Jake' });
  await openWindow(gm, 'party');
  await card.getByRole('button', { name: 'Edit sheet' }).click();
  const box = card.getByRole('group', { name: 'Level, XP and grade override' });
  const review = box.getByRole('button', { name: 'Review override' });
  const warning = box.getByRole('alertdialog', { name: 'Override warning' });

  await box.getByLabel('Class level').fill('3');
  // Keyboard only from here: focus Review override and press Enter.
  await review.focus();
  await gm.keyboard.press('Enter');
  await expect(warning).toBeFocused();
  // Tab reaches the warning's own buttons, not the top of the page.
  await gm.keyboard.press('Tab');
  await expect(warning.getByRole('button', { name: 'Apply override' })).toBeFocused();
  await gm.keyboard.press('Tab');
  await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await gm.keyboard.press('Enter');
  await expect(warning).toHaveCount(0);
  await expect(review).toBeFocused();

  await gm.keyboard.press('Enter');
  await expect(warning).toBeFocused();
  await gm.keyboard.press('Tab');
  await gm.keyboard.press('Enter');
  const outcome = box.getByRole('status');
  await expect(outcome).toContainText('Level, XP and grade set');
  await expect(outcome).toBeFocused();
  await gm.screenshot({ path: path.join(shots, 'gm-override-focus-1366x768.png') });
  expect(errors).toEqual([]);
});
