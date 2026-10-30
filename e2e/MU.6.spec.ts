import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.6 Primal Hunter reference lists (DESIGN §9a, L23): a searchable,
// GM-only Reference view in Library & settings; god-tied rows flagged and
// hideable; nothing of it reaches a player.

const GM_KEY = 'e2e-gm-key-mu6-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.6');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

test('the GM searches the reference; players never receive it', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Reference Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await expect(gm.getByRole('tablist', { name: 'Console tabs' })).toBeVisible();

  // A player is connected throughout, watching every frame and response.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  const seen: string[] = [];
  player.on('websocket', (ws) => ws.on('framereceived', (f) => seen.push(String(f.payload))));
  player.on('response', (r) => {
    if (r.url().includes('/api/'))
      void r
        .text()
        .then((t) => seen.push(t))
        .catch(() => undefined);
  });

  await openWindow(gm, 'reference');
  const ref = gm.locator('section[aria-labelledby="reference"]');
  await expect(ref.getByRole('heading', { name: 'Reference' })).toBeVisible();
  await expect(ref.getByTestId('reference-count')).toContainText('Showing 60 of');

  await ref.getByLabel('Search the reference').fill('boar');
  await expect(ref.getByTestId('reference-row').first()).toContainText('boar', {
    ignoreCase: true,
  });
  await expect(ref.getByTestId('reference-results')).toContainText('Irontusk Boar');
  await ref.getByLabel('List').selectOption('items');
  await expect(ref.getByTestId('reference-results')).not.toContainText('Irontusk Boar');
  await ref.getByLabel('List').selectOption('creatures');
  await expect(ref.getByTestId('reference-results')).toContainText('Irontusk Boar');
  await ref.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-reference-search-1366x768.png') });

  // God-tied rows are flagged, and hidden on request.
  await ref.getByLabel('List').selectOption('');
  await ref.getByLabel('Search the reference').fill('viper');
  await expect(ref.getByTestId('reference-god-tied-flag').first()).toBeVisible();
  await ref.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-reference-god-tied-1366x768.png') });
  await ref.getByLabel('Show god-tied').uncheck();
  await expect(ref.getByTestId('reference-count')).not.toHaveText('');
  await expect(ref.getByTestId('reference-god-tied-flag')).toHaveCount(0);
  await ref.getByLabel('Search the reference').fill('zzzz nothing');
  await expect(ref.getByTestId('reference-count')).toHaveText('Nothing matches.');

  // The player joins (a character exists) and sees nothing of it.
  await gm.getByRole('tab', { name: 'Home' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  const anon = await player.request.get(`${server.url}/api/gm/reference?q=boar`);
  expect(anon.status()).toBe(403);
  const all = seen.join('\n') + (await player.content());
  expect(all).not.toContain('Irontusk');
  expect(all).not.toContain('Malefic Viper');

  expect(gmErrors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
