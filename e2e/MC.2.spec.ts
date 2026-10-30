import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.2 (DESIGN §11): generate on demand. The GM asks the co-DM for a shop;
// the (recorded, fake) strong model writes a content file that opens in the
// Import window; the GM approves it and the items reach the library. A reply
// that breaks the rules is refused with its path. Players see nothing of it.
// The terminal server runs with the test-only fake (THE_SYSTEM_E2E_FAKE_AI).

const GM_KEY = 'e2e-gm-key-mc2-0123456789abcdef02';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.2');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' });
});

test.afterEach(async () => {
  await server.stop();
});

test('a generated shop opens in the import preview and is approved', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openTab(gm, 'session');
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mc2-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const imp = gm.locator('section[aria-labelledby="import-heading"]');

  // A reply that breaks the rules (a percentage item bonus) is refused.
  await codm.getByLabel('Generate').selectOption('item');
  await codm.getByLabel('What the table needs').fill('percent bonus please');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(imp.getByRole('alert', { name: 'Problems in the file' })).toContainText(
    'items[0].bonuses[0]',
  );
  await expect(codm.getByTestId('codm-message')).toHaveText(
    'Item broke the rules: see the problems in Import content',
  );

  // A reply with no content at all says so in the panel.
  await codm.getByLabel('What the table needs').fill('say hello');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(codm.getByTestId('codm-message')).toContainText('no JSON object');

  await codm.getByLabel('Generate').selectOption('shop');
  await codm.getByLabel('What the table needs').fill('An herbalist in the Crown camp');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(codm.getByTestId('codm-message')).toHaveText(
    'Shop ready: check it in Import content',
  );
  await expect(codm.getByTestId('codm-panel-spend')).toContainText('3 calls');
  await expect(imp).toContainText('Sap & Sinew, herbalist');
  await expect(imp.getByRole('checkbox')).toHaveCount(4);
  await expect(imp.getByTestId('import-generated-note')).toBeVisible();
  await codm.screenshot({ path: path.join(shots, 'gm-codm-panel-1366x768.png') });
  await imp.screenshot({ path: path.join(shots, 'gm-codm-import-1366x768.png') });

  // Nothing has applied yet.
  const items = gm.locator('section[aria-labelledby="item-library"]');
  await expect(items).not.toContainText('Bracers of the Grove');

  // The GM edits the draft (renames an item) and previews the edit.
  await codm.getByText('Edit the generated content').click();
  const json = codm.getByLabel('Content (JSON)');
  await json.fill((await json.inputValue()).replaceAll('Lungmoss Tea', 'Lungmoss Brew'));
  await codm.getByRole('button', { name: 'Preview my edits' }).click();
  await expect(imp).toContainText('Lungmoss Brew');

  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');
  await expect(items).toContainText('Bracers of the Grove');
  await expect(items).toContainText('Lungmoss Brew');

  // Regenerate asks again for the same kind, but first asks before it
  // throws away the GM's edits.
  gm.once('dialog', (d) => void d.dismiss());
  await codm.getByRole('button', { name: 'Regenerate' }).click();
  await expect(codm.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  await expect(codm.getByTestId('codm-panel-spend')).toContainText('3 calls');
  gm.once('dialog', (d) => {
    expect(d.message()).toContain('edits');
    void d.accept();
  });
  await codm.getByRole('button', { name: 'Regenerate' }).click();
  await expect(codm.getByTestId('codm-panel-spend')).toContainText('4 calls');
  await expect(imp.getByRole('checkbox')).toHaveCount(4);
  await expect(imp).toContainText('Lungmoss Tea');

  // A slow generation can be cancelled; nothing opens and nothing is counted.
  await codm.getByLabel('Generate').selectOption('place');
  await codm.getByLabel('What the table needs').fill('slow please');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(codm.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  await codm.getByRole('button', { name: 'Cancel' }).click();
  await expect(codm.getByTestId('codm-message')).toHaveText('Cancelled: nothing was generated');
  await expect(codm.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
  await expect(imp).toContainText('Lungmoss Tea');
  await expect(codm.getByTestId('codm-panel-spend')).toContainText('4 calls');

  // The shop's GM note and the generation never reached the player.
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  for (const text of frames) {
    expect(text).not.toContain('Old Brenna');
    expect(text).not.toContain('sk-ant');
  }
});
