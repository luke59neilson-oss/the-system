import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.5 GM override for level, XP and grade (DESIGN §7, Q59): the GM sheet sets
// them directly after a warning that lists what the change skips; the change
// is one logged event that the change log can undo.

const GM_KEY = 'e2e-gm-key-mt5-0123456789abcdef5';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.5');
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

test('the GM sets level, XP and grade after a warning, and can undo it', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Override');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('race')).toHaveText('[Human (G) – lvl 0]');

  const party = gm.locator('section[aria-labelledby="party"]');
  const card = party.locator('[data-testid^="row-"]', { hasText: 'Jake' });
  const jakeId = (await card.getAttribute('data-testid'))!.slice(4);
  await card.getByRole('button', { name: 'Edit sheet' }).click();
  const box = card.getByRole('group', { name: 'Level, XP and grade override' });
  const review = box.getByRole('button', { name: 'Review override' });
  // Nothing changed yet: nothing to review.
  await expect(review).toBeDisabled();

  await box.getByLabel('Grade').selectOption('F');
  await box.getByLabel('Class level').fill('12');
  await box.getByLabel('Class XP').fill('40');
  await expect(box.getByLabel('Profession level')).toBeDisabled();
  await review.click();
  const warning = box.getByRole('alertdialog', { name: 'Override warning' });
  await expect(warning.getByTestId('override-changes').getByRole('listitem')).toHaveText([
    'Grade G → F',
    'Class level 0 → 12',
    'Race level 0 → 12',
    'Class XP 0 → 40',
  ]);
  await expect(warning.getByTestId('override-skips').getByRole('listitem')).toHaveText([
    'The evolution to F-grade: no evolution stat bonus, skill re-rating, pool refill or profession offer',
    '56 class spread points (base stats stay as they are)',
    'No skills are granted: the selections at class level 5 and 10 become due, for you to offer as usual',
    '32 free points (no new batches to assign)',
  ]);
  await warning.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-override-warning-1366x768.png') });

  // Cancel leaves everything as it was.
  await warning.getByRole('button', { name: 'Cancel' }).click();
  await expect(warning).toHaveCount(0);
  await expect(card.getByTestId(`class-level-${jakeId}`)).toHaveText('0');

  // A value the rules refuse comes back as a readable error.
  await box.getByLabel('Class level').fill('15');
  await review.click();
  await expect(warning.getByRole('alert')).toContainText('above the F-grade top of 14');
  await expect(warning.getByRole('button', { name: 'Apply override' })).toBeDisabled();

  await box.getByLabel('Class level').fill('12');
  await review.click();
  await warning.getByRole('button', { name: 'Apply override' }).click();
  await expect(box.getByRole('status')).toContainText('Level, XP and grade set');
  await expect(card.getByTestId(`class-level-${jakeId}`)).toHaveText('12');
  await expect(card.getByTestId(`xp-${jakeId}`)).toHaveText('40 / 300');
  await expect(card.getByTestId(`flags-${jakeId}`)).toContainText('Selection (lvl 5)');

  // The player sees the new levels live, with no 'DING!' for levels not earned.
  await expect(player.getByTestId('race')).toHaveText('[Human (F) – lvl 12]');
  await expect(player.getByText(/DING!/)).toHaveCount(0);
  await player.screenshot({ path: path.join(shots, 'player-after-override-390x844.png') });

  // One change-log row, undone like any other event.
  const log = gm.locator('section[aria-labelledby="change-log"]');
  const row = log.getByRole('listitem').filter({ hasText: "The GM set Jake's level" });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Undo' }).click();
  await row.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(row).toContainText('(undone)');
  await expect(card.getByTestId(`class-level-${jakeId}`)).toHaveText('0');
  await expect(player.getByTestId('race')).toHaveText('[Human (G) – lvl 0]');
  // The open editor reloads the live values, so the undone override is not
  // one click from coming back.
  await expect(box.getByLabel('Grade')).toHaveValue('G');
  await expect(box.getByLabel('Class level')).toHaveValue('0');
  await expect(review).toBeDisabled();

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
