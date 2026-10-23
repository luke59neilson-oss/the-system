import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.8 Change log and undo (in progress): the GM sees events in words and undoes one.

const GM_KEY = 'e2e-gm-key-m48-0123456789abcdef48';
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
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
  await expect(row).toContainText('(undone)');
  // M1.3 rules: Jake's creation cannot be undone while later events depend on him.
  await form.getByLabel('Message').fill('Only Jake.');
  await form.getByLabel('Recipients').selectOption({ label: 'Jake' });
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(log.getByRole('listitem').filter({ hasText: 'Only Jake.' })).toHaveCount(1);
  const created = log.getByRole('listitem').filter({ hasText: 'Jake' }).last();
  await created.getByRole('button', { name: 'Undo' }).click();
  await expect(log.getByRole('alert')).toBeVisible();
  await log.getByLabel('Filter').fill('only jake');
  await expect(log.getByRole('listitem')).toHaveCount(1);
});
