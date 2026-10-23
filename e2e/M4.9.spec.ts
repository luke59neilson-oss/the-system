import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.9 Rules settings: the GM edits a rules value as an event, the player sees
// it live, a bad value is refused with the reason, and reset brings the
// defaults back; every change shows in the change log.

const GM_KEY = 'e2e-gm-key-m49-0123456789abcdef49';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.9');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m49-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('the GM edits, validates and resets the rules; players see the change live', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Rules Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  const inventory = player.getByTestId('inventory');
  await expect(inventory).toContainText('Credits');

  const panel = gm.locator('section[aria-labelledby="rules-settings"]');
  const save = panel.getByRole('button', { name: 'Save rules' });
  await expect(save).toBeDisabled();
  await panel.locator('summary', { hasText: 'Economy' }).click();
  await panel.getByLabel('Currency name').fill('Shards');
  await save.click();
  await expect(panel.getByRole('status')).toHaveText('Rules saved.');
  await expect(inventory).toContainText('Shards');
  await expect(save).toBeDisabled();

  // Ids stay fixed in a running campaign: shown, not editable.
  await expect(panel.locator('#rules-economy-equipmentSlots-0-id')).toHaveAttribute('readonly', '');

  // Validation: a negative bonus is refused with the reason; nothing changes.
  await panel.locator('summary', { hasText: 'Xp' }).click();
  await panel.getByLabel('Above level bonus per level').fill('-1');
  await save.click();
  await expect(panel.getByRole('alert')).toContainText('Invalid rules');
  await expect(panel.getByRole('alert')).toContainText('aboveLevelBonusPerLevel');
  await panel.screenshot({ path: path.join(shots, 'gm-rules-1366x768.png') });
  await panel.getByRole('button', { name: 'Discard changes' }).click();
  await expect(panel.getByLabel('Above level bonus per level')).toHaveValue('0.1');
  await expect(panel.getByRole('alert')).toHaveCount(0);

  // Reset asks first, then brings the defaults back everywhere.
  await panel.getByRole('button', { name: 'Reset to defaults' }).click();
  await panel.getByRole('button', { name: 'Keep my rules' }).click();
  await expect(panel.getByLabel('Currency name')).toHaveValue('Shards');
  await panel.getByRole('button', { name: 'Reset to defaults' }).click();
  await panel.getByRole('button', { name: 'Confirm reset' }).click();
  await expect(panel.getByRole('status')).toHaveText('Rules reset to the defaults.');
  await expect(panel.getByLabel('Currency name')).toHaveValue('Credits');
  await expect(inventory).toContainText('Credits');

  const log = gm.locator('section[aria-labelledby="change-log"]');
  await expect(log.getByRole('listitem').filter({ hasText: 'Rules settings changed' })).toHaveCount(
    2,
  );
  await player.screenshot({ path: path.join(shots, 'player-390x844.png') });
  await gm.screenshot({ path: path.join(shots, 'gm-1366x768.png') });
});
