import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
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
  await openTab(gm, 'session');
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
  // The region already exists, so that entry cannot apply; the rest can (the
  // shop sells the new copies of its wares, QF.29).
  await expect(codm.getByTestId('codm-message')).toContainText('Shop ready');
  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');
  await expect(banners).toHaveText(['[System] [The System is weaving a tale…]']);
  const live = gm.locator('section[aria-labelledby="live-banners"]');
  await live.getByRole('button', { name: /Remove the banner/ }).click();
  await expect(banners).toHaveCount(0);
  await gm.close();
  await page.close();
});

// Review round 1: a regeneration replaces the loading screen still up, and a
// generation that fails or is cancelled takes its own screen down, even when
// it fails before the banner has reached the GM's state.
test('a regeneration replaces the loading screen; a failure or cancel takes it down', async ({
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
  await openTab(gm, 'session');
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
  const message = codm.getByTestId('codm-message');

  await codm.getByLabel('Show players a loading screen while the co-DM works').check();
  await codm.getByLabel('Generate').selectOption('shop');
  await codm.getByLabel('What the table needs').fill('An herbalist in the Crown camp');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(message).toHaveText('Shop ready: check it in Import content');
  await expect(banners).toHaveText([LOADING]);

  // Regenerating before approval replaces the screen: one banner, the new text.
  await codm.getByLabel('Loading text').fill('[The System is weaving a tale…]');
  gm.once('dialog', (d) => void d.accept());
  await codm.getByRole('button', { name: 'Regenerate' }).click();
  await expect(banners).toHaveText(['[System] [The System is weaving a tale…]']);
  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');
  await expect(banners).toHaveCount(0);

  // A reply that is not content: the generation fails and its screen comes down.
  await codm.getByLabel('Loading text').fill('[The System falters…]');
  await codm.getByLabel('What the table needs').fill('say hello');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(message).toContainText('no JSON object');
  await expect(banners).toHaveCount(0);

  // A cancelled generation takes its screen down too.
  await codm.getByLabel('Loading text').fill('[The System is thinking…]');
  await codm.getByLabel('What the table needs').fill('slow please');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(banners).toHaveText(['[System] [The System is thinking…]']);
  await codm.getByRole('button', { name: 'Cancel' }).click();
  await expect(message).toHaveText('Cancelled: nothing was generated');
  await expect(banners).toHaveCount(0);
  const live = gm.locator('section[aria-labelledby="live-banners"]');
  await expect(live.getByRole('button', { name: /Remove the banner/ })).toHaveCount(0);

  // Round 2: approving a generation sent without a screen leaves an earlier
  // generation's screen up for the GM to remove.
  await codm.getByLabel('Loading text').fill('[The System is constructing the area…]');
  await codm.getByLabel('Generate').selectOption('npc');
  await codm.getByLabel('What the table needs').fill('A guide');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(message).toContainText('NPC ready');
  await expect(banners).toHaveText([LOADING]);
  await codm.getByLabel('Show players a loading screen while the co-DM works').uncheck();
  await codm.getByLabel('Generate').selectOption('item');
  await codm.getByLabel('What the table needs').fill('A charm');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(message).toContainText('Item ready');
  await imp.getByRole('button', { name: /^Apply \d+$/ }).click();
  await expect(imp.getByRole('status')).toContainText('Applied');
  await expect(banners).toHaveText([LOADING]);
  await gm.close();
  await page.close();
});

// QF.30 (sweep D): with no API key the panel says what it needs, and a click
// on Generate sends players no loading screen (no banner, no toast, nothing
// in their Notifications) for a call that cannot run.
test('with no API key the co-DM sends players no loading screen', async ({ browser }) => {
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

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const banners = page.getByTestId('broadcast-banner');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const message = codm.getByTestId('codm-message');
  const noKey = /No API key is set: the co-DM needs your Anthropic API key/;
  await expect(message).toHaveText(noKey);
  await codm.getByLabel('Show players a loading screen while the co-DM works').check();
  await codm.getByLabel('What the table needs').fill('An herbalist in the Crown camp');
  const generations: string[] = [];
  gm.on('request', (r) => {
    if (r.url().endsWith('/api/gm/ai/generate')) generations.push(r.url());
  });
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(message).toHaveText(noKey);
  await expect(codm.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
  expect(generations).toEqual([]);
  const history = page.getByTestId('history');
  await history.getByLabel('Show').selectOption('broadcast');
  await expect(page.getByTestId('dings').getByText('constructing')).toHaveCount(0);
  await expect(banners).toHaveCount(0);
  await expect(page.getByTestId('ding-toast')).toHaveCount(0);

  // Once a key is saved the same click shows the screen, so the check above
  // was not passing for want of a working broadcast.
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mc4-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(banners).toHaveText([LOADING]);
  await expect(message).toHaveText('Shop ready: check it in Import content');
  expect(generations).toHaveLength(1);
  await gm.close();
  await page.close();
});
