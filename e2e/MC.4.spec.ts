import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.4 (DESIGN §11 "Loading screen"): while the co-DM generates, the GM can
// show players a pinned System loading screen. With "Clear it when I approve
// the content" it comes down when the GM applies the generation; without it,
// it stays until the GM removes it. The fake AI stands in for the API.

const GM_KEY = 'e2e-gm-key-mc4-0123456789abcdef04';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.4');
const LOADING = '[System] [The System is constructing the area…]';
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' });
});

test.afterEach(async () => {
  await server.stop();
});

test('a loading screen shows while the co-DM generates and clears on approval', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mc4-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const banners = page.getByTestId('broadcast-banner');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await codm.getByLabel('Show players a loading screen while the co-DM works').check();
  await expect(codm.getByLabel('Loading text')).toHaveValue(
    '[The System is constructing the area…]',
  );
  await expect(codm.getByLabel('Clear it when I approve the content')).toBeChecked();
  await codm.getByLabel('Generate').selectOption('shop');
  await codm.getByLabel('What the table needs').fill('An herbalist in the Crown camp');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(banners).toHaveText([LOADING]);
  await expect(codm.getByTestId('codm-message')).toHaveText(
    'Shop ready: check it in Import content',
  );
  await codm.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-loading-screen-1366x768.png') });
  await page.screenshot({ path: path.join(shots, 'player-loading-screen-390x844.png') });
  // Still up while the GM reads the generation.
  await expect(banners).toHaveText([LOADING]);

  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');
  await expect(banners).toHaveCount(0);

  // Without "clear on approval" the loading screen stays until the GM removes it.
  await codm.getByLabel('Clear it when I approve the content').uncheck();
  await codm.getByLabel('Loading text').fill('[The System is weaving a tale…]');
  gm.once('dialog', (d) => void d.accept());
  await codm.getByRole('button', { name: 'Regenerate' }).click();
  await expect(banners).toHaveText(['[System] [The System is weaving a tale…]']);
  // The region already exists, so that entry cannot apply; the rest can.
  await expect(codm.getByTestId('codm-message')).toContainText('Shop ready');
  await imp.getByRole('button', { name: 'Apply 3' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 3 entries');
  await expect(banners).toHaveText(['[System] [The System is weaving a tale…]']);
  const live = gm.locator('section[aria-labelledby="live-banners"]');
  await live.getByRole('button', { name: /Remove the banner/ }).click();
  await expect(banners).toHaveCount(0);
  await gm.close();
  await page.close();
});
