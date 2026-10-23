import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.8 Change log and undo: the GM sees events in words, filters them, and
// undoes one; a player's action appears live and its undo reaches the player.

const GM_KEY = 'e2e-gm-key-m48-0123456789abcdef48';
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(path.resolve(import.meta.dirname, '../docs/screens/M4.8'), { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m48-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('the GM undoes a broadcast from the change log', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await page.getByLabel('Campaign name').fill('Log Test');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  const create = page.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  const form = page.locator('form[aria-labelledby="broadcast"]');
  await form.getByLabel('Message').fill('The Host stirs.');
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  const log = page.locator('section[aria-labelledby="change-log"]');
  const row = log.getByRole('listitem').filter({ hasText: 'The Host stirs.' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Undo' }).click();
  await row.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(row).toContainText('(undone)');
  // M1.3 rules: Jake's creation cannot be undone while later events depend on him.
  await form.getByLabel('Message').fill('Only Jake.');
  await form.getByLabel('Recipients').selectOption({ label: 'Jake' });
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(log.getByRole('listitem').filter({ hasText: 'Only Jake.' })).toHaveCount(1);
  const created = log.getByRole('listitem').filter({ hasText: 'Jake' }).last();
  await created.getByRole('button', { name: 'Undo' }).click();
  await created.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(log.getByRole('alert')).toHaveText(
    "Can't undo this: a later change depends on it. Undo the later changes first.",
  );
  await log.getByLabel('Filter').fill('only jake');
  await expect(log.getByRole('listitem')).toHaveCount(1);
  await log.getByLabel('Who').selectOption('player');
  await expect(log.getByRole('listitem')).toHaveCount(0);
  await log.getByLabel('Who').selectOption('all');
  await log.getByLabel('Filter').fill('');
  await log.screenshot({
    path: path.resolve(import.meta.dirname, '../docs/screens/M4.8/gm-change-log-1366x768.png'),
  });
});

test("a player's nickname shows up live in the log; the GM undoes it everywhere", async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Live Log');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await player.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ }).click();
  const detail = player.getByTestId('skill-detail');
  await detail.getByRole('button', { name: 'Add nickname' }).click();
  await detail.getByLabel('Nickname').fill('Pew');
  await detail.getByRole('button', { name: 'Save' }).click();
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: “Pew”');

  const log = gm.locator('section[aria-labelledby="change-log"]');
  const row = log.getByRole('listitem').filter({ hasText: 'Jake skill nicknamed (Basic Archery)' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('player');
  await log.getByLabel('Kind').selectOption({ label: 'Skills and practice' });
  await expect(log.getByRole('listitem')).toHaveCount(1);
  await log.getByLabel('Kind').selectOption({ label: 'Quests and Identify' });
  await expect(log.getByText('Nothing matches.')).toBeVisible();
  await log.getByLabel('Kind').selectOption({ label: 'Everything' });
  // Raw event types never show as row text.
  await expect(
    log.getByRole('listitem').filter({ hasText: /\b[a-z]+\.[a-z][A-Za-z]+\b/ }),
  ).toHaveCount(0);

  await row.getByRole('button', { name: 'Undo' }).click();
  await row.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(row).toContainText('(undone)');
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: none');
  await gm.screenshot({
    path: path.resolve(import.meta.dirname, '../docs/screens/M4.8/gm-1366x768.png'),
    fullPage: true,
  });
});
