import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.3 Import with approval: a bad file shows errors and changes nothing; a
// good file is previewed, the GM ticks entries, and only those apply. Entries
// that cannot apply are shown and cannot be ticked; if the campaign changes
// after the preview, Apply stops at the first refusal and says so.

const GM_KEY = 'e2e-gm-key-m93-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.3');
const examples = path.resolve(import.meta.dirname, '../docs/content-examples');
let server: RunningServer;

// One server per test: no test depends on another's campaign.
test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});
test.afterEach(async () => {
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

test('entries that cannot apply are shown; a changed campaign stops the apply', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Import Clash');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  const input = panel.getByLabel('Content file (.json)');

  // A duplicate skill and an offer to a character who is not in the campaign.
  const skill = { name: 'Twice Told', rarity: 'rare' };
  await input.setInputFiles({
    name: 'mixed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'the-system/content',
        version: 1,
        skills: [skill, skill],
        skillOffers: [{ character: 'Nobody', level: 5, options: [skill] }],
      }),
    ),
  });
  await expect(panel.getByRole('alert', { name: 'Entries that cannot apply' })).toContainText(
    'skillOffers[0].character',
  );
  await expect(panel.getByRole('checkbox')).toHaveCount(2);
  await expect(panel.getByRole('checkbox').nth(0)).toBeChecked();
  await expect(panel.getByRole('checkbox').nth(1)).toBeDisabled();
  await expect(panel.getByRole('checkbox').nth(1)).not.toBeChecked();
  await expect(panel.getByRole('button', { name: 'Apply 1' })).toBeEnabled();

  // Preview the library file here, then apply it from a second GM window.
  await input.setInputFiles(path.join(examples, 'library.json'));
  await expect(panel.getByRole('button', { name: 'Apply 3' })).toBeEnabled();
  const other = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await other.goto(`${server.url}/gm#key=${GM_KEY}`);
  const otherPanel = other.locator('section[aria-labelledby="import-heading"]');
  await otherPanel
    .getByLabel('Content file (.json)')
    .setInputFiles(path.join(examples, 'library.json'));
  await otherPanel.getByRole('button', { name: 'Apply 3' }).click();
  await expect(otherPanel.getByRole('status')).toHaveText('Applied 3 entries');

  // The first window's preview is stale. Items may share names, so the two
  // items apply again; the title is refused, the apply stops there, the
  // applied entries leave the list and the rest are checked again.
  await panel.getByRole('button', { name: 'Apply 3' }).click();
  await expect(panel.getByRole('status')).toContainText('Applied 2; titles[0] failed');
  await expect(panel.getByRole('status')).toContainText('check the entries above again');
  await expect(panel.getByRole('checkbox')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Apply 1' })).toBeDisabled();
  await expect(panel.getByText('Untick the entries marked above')).toBeVisible();
  await panel.screenshot({ path: path.join(shots, 'gm-import-stale-1366x768.png') });

  // Previewing the file again notes that the items would be second copies.
  await input.setInputFiles(path.join(examples, 'library.json'));
  await expect(panel.getByText('already has an item named [Pale Hide Bracers]')).toBeVisible();
  await other.close();
  await gm.close();
});
