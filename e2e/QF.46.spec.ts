import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.46: after an award or a broadcast the form starts again from the whole
// table (so a table-wide one never goes to last time's subset), the result
// names who it went to, and an old status line goes when the form changes.

const GM_KEY = 'e2e-gm-key-qf46-0123456789abcdef0';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.46');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('Award XP and System broadcast reset after use and say who it went to', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors: string[] = [];
  gm.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Resets');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    await expect(create.getByRole('status')).toHaveText('Character created');
  }
  // Typing the next name clears the old line.
  await create.getByLabel('Name', { exact: true }).fill('A');
  await expect(create.getByRole('status')).toHaveCount(0);
  await create.getByLabel('Name', { exact: true }).fill('');

  // Award 300 XP to Jake alone, against a G-grade target.
  await openTab(gm, 'session');
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Amount').fill('300');
  await award.getByRole('checkbox', { name: 'Kim' }).uncheck();
  await award.getByLabel('Target’s grade').selectOption({ label: 'G-grade' });
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(award.getByRole('status')).toHaveText('Awarded 300 class XP to Jake.');
  // The next award starts from everyone, at no target grade.
  await expect(award.getByRole('checkbox', { name: 'Kim' })).toBeChecked();
  await expect(award.getByRole('checkbox', { name: 'Jake' })).toBeChecked();
  await expect(award.getByLabel('Target’s grade')).toHaveValue('');
  await award.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-award-reset-1366x768.png') });
  await award.getByLabel('Amount').fill('200');
  await expect(award.getByRole('status')).toHaveCount(0);
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(award.getByRole('status')).toHaveText('Awarded 200 class XP to Jake and Kim.');

  // A broadcast to Jake alone; the next one goes to everyone.
  await openWindow(gm, 'broadcast');
  const form = gm.locator('form[aria-labelledby="broadcast"]');
  await form.getByLabel('Message').fill('Only you hear it.');
  await form.getByLabel('Recipients').selectOption({ label: 'Jake' });
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(form.getByRole('status')).toHaveText('Broadcast sent to Jake.');
  await expect(form.getByLabel('Recipients')).toHaveValue('all');
  await form.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-broadcast-reset-1366x768.png') });
  // Changing the form clears the old line.
  await form.getByLabel('When').selectOption('day');
  await expect(form.getByRole('status')).toHaveCount(0);
  await form.getByLabel('When').selectOption('now');
  await form.getByLabel('Message').fill('Everyone hears it.');
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(form.getByRole('status')).toHaveText('Broadcast sent to everyone.');
  await form.getByLabel('Message').fill('x');
  await expect(form.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Import content, Encounter and Award XP lines clear when the form changes', async ({
  browser,
}) => {
  const examples = path.resolve(import.meta.dirname, '../docs/content-examples');
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Clears');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(create.getByRole('status')).toHaveText('Character created');
  // Changing another field (not the name) clears it too.
  await create.getByLabel('Starting class').selectOption({ index: 1 });
  await expect(create.getByRole('status')).toHaveCount(0);

  // Import: "Applied N" goes on the next file pick.
  await openWindow(gm, 'import');
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  const input = panel.getByLabel('Content file (.json)');
  await input.setInputFiles(path.join(examples, 'library.json'));
  await expect(panel.getByRole('checkbox')).toHaveCount(3);
  await panel.getByRole('checkbox').nth(1).uncheck();
  await panel.getByRole('button', { name: 'Apply 2' }).click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 entries');
  // The applied file's list closes; picking the next file clears the line.
  await input.setInputFiles(path.join(examples, 'library.json'));
  await expect(panel.getByRole('checkbox')).toHaveCount(3);
  await expect(panel.getByRole('status')).toHaveCount(0);

  // Encounter: a pool change's line goes when the pool form or a clock field changes.
  await openWindow(gm, 'encounter');
  const win = gm.locator('section[aria-labelledby="encounter"]');
  const line = win.locator(':scope > p[role="status"]');
  const pools = win.locator('form[aria-labelledby="pool-tool"]');
  await pools.getByLabel('Character').selectOption({ label: 'Jake' });
  await pools.getByLabel('Points', { exact: true }).fill('10');
  await pools.getByRole('button', { name: 'Apply' }).click();
  await expect(line).toHaveText('Jake took 10 Health Points (HP) (90/100)');
  await pools.getByLabel('Points', { exact: true }).fill('5');
  await expect(line).toHaveCount(0);
  await pools.getByRole('button', { name: 'Apply' }).click();
  await expect(line).toHaveText('Jake took 5 Health Points (HP) (85/100)');
  await win.locator('[aria-labelledby="clocks"]').getByLabel('Clock name').fill('Marsh');
  await expect(line).toHaveCount(0);

  // Award XP: amount, reason and track changes each clear the line.
  await openTab(gm, 'session');
  const award = gm.locator('form[aria-labelledby="award-xp"]');
  const awarded = award.getByRole('status');
  const give = async () => {
    await award.getByLabel('Amount').fill('50');
    await award.getByRole('button', { name: 'Award XP' }).click();
    await expect(awarded).toHaveText('Awarded 50 class XP to Jake.');
  };
  await give();
  await award.getByLabel('Reason (GM only)').fill('Scouting');
  await expect(awarded).toHaveCount(0);
  await give();
  await award.getByLabel('Amount').fill('5');
  await expect(awarded).toHaveCount(0);
  await give();
  await award.getByLabel('Track').selectOption('profession');
  await expect(awarded).toHaveCount(0);
});
