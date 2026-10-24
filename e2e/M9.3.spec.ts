import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.3 Import with approval (WIP): a bad file shows errors and changes
// nothing; a good file is previewed, the GM ticks entries, and they apply.

const GM_KEY = 'e2e-gm-key-m93-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.3');
const examples = path.resolve(import.meta.dirname, '../docs/content-examples');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});
test.afterAll(async () => {
  await server.stop();
});

test('the GM previews a content file and applies the ticked entries', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Import Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  const input = panel.getByLabel('Content file (.json)');

  await input.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      '{"format":"the-system/content","version":1,"skills":[{"name":"","rarty":"rare"}]}',
    ),
  });
  await expect(panel.getByRole('alert', { name: 'Problems in the file' })).toContainText(
    'skills[0]',
  );

  await input.setInputFiles(path.join(examples, 'library.json'));
  await expect(panel.getByRole('checkbox')).toHaveCount(3);
  await panel.getByRole('checkbox').nth(1).uncheck();
  await panel.screenshot({ path: path.join(shots, 'gm-import-preview-1366x768.png') });
  await panel.getByRole('button', { name: 'Apply 2' }).click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 entries');
  // The ticked item and title are in the libraries; the unticked item is not.
  const items = gm.locator('section[aria-labelledby="item-library"]');
  await expect(items).toContainText('Pale Hide Bracers');
  await expect(items).not.toContainText('Canyon Salt');
  await gm.close();
});
