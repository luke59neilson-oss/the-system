import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M6.1 item library (DESIGN §7 "Items"): the GM creates and edits items
// (flat bonuses only), changes a rarity (every copy follows), and gives and
// takes copies; the player's inventory follows live.

const GM_KEY = 'e2e-gm-key-m61-0123456789abcdef61';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M6.1');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
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

test('the GM creates, edits, gives and takes an item; the player sees it live', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Items');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const library = gm.locator('section[aria-labelledby="item-library"]');
  await expect(library).toContainText('No items yet.');
  const form = library.locator('form[aria-labelledby="item-library-form"]');
  await form.getByLabel('Name').fill('Bone Charm');
  await form.getByLabel('Slot').selectOption({ label: 'Necklace' });
  await form.getByLabel('Description (players see this)').fill('A knuckle on a cord.');
  await form.getByLabel('Vitality').fill('1.5');
  await expect(form.getByRole('button', { name: 'Add to library' })).toBeDisabled();
  await form.getByLabel('Vitality').fill('5');
  await form.getByRole('button', { name: 'Add to library' }).click();
  await expect(library.getByRole('status')).toHaveText('[Bone Charm] added to the library');
  const list = library.getByRole('list', { name: 'Library items' });
  await expect(list).toHaveText('[Bone Charm] (Inferior)');

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');

  // Give two, take one.
  await list.getByRole('button', { name: /Bone Charm/ }).click();
  const give = library.getByRole('group', { name: 'Give or take [Bone Charm]' });
  await expect(give.getByTestId('item-held')).toHaveText('Jake holds 0');
  await give.getByLabel('Count').fill('2');
  await give.getByRole('button', { name: 'Give' }).click();
  await expect(library.getByRole('status')).toHaveText('Gave 2 × [Bone Charm] to Jake');
  await expect(give.getByTestId('item-held')).toHaveText('Jake holds 2');
  await give.getByLabel('Count').fill('1');
  await give.getByRole('button', { name: 'Take' }).click();
  await expect(library.getByRole('status')).toHaveText('Took 1 × [Bone Charm] from Jake');
  await expect(give.getByTestId('item-held')).toHaveText('Jake holds 1');
  await expect(player.getByTestId('inventory')).toContainText('Bone Charm');

  // A rarity change reaches every copy.
  await form.getByLabel('Rarity').selectOption({ label: 'Rare' });
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(library.getByRole('status')).toHaveText('[Bone Charm] saved');
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(list).toHaveText('[Bone Charm] (Rare)');
  await expect(player.getByTestId('inventory')).toContainText('Rare');
  await library.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-item-library-1366x768.png') });
  await player.getByTestId('inventory').scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-inventory-390x844.png') });

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
