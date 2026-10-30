import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M6.2 loot tables (DESIGN §7 "Items"): the GM defines a weighted table, rolls
// it into a character's inventory (a gift from the GM, live on the player's
// screen), edits it and rolls it for the GM only. Players never see tables or rolls.

const GM_KEY = 'e2e-gm-key-m62-0123456789abcdef62';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M6.2');
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

test('the GM defines and rolls a loot table; the player receives the roll live', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Loot');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  // Two items in the library to draw from.
  const library = gm.locator('section[aria-labelledby="item-library"]');
  const itemForm = library.locator('form[aria-labelledby="item-library-form"]');
  await openWindow(gm, 'item-library');
  for (const name of ['Whale Louse Pelt', 'Hunter Fang']) {
    await itemForm.getByLabel('Item name').fill(name);
    await itemForm.getByRole('button', { name: 'Add to library' }).click();
    await expect(library.getByRole('status')).toHaveText(`[${name}] added to the library`);
  }

  const loot = gm.locator('section[aria-labelledby="loot-tables"]');
  await expect(loot).toContainText('No loot tables yet.');
  const form = loot.locator('form[aria-labelledby="loot-table-form"]');
  await form.getByLabel('Table name').fill('Pale hunter drop');
  const entry = (n: number) => form.getByRole('group', { name: `Entry ${n}` });
  // The form opened before any item existed, so its first entry pays currency.
  await expect(entry(1).getByLabel('Kind')).toHaveValue('currency');
  await entry(1).getByLabel('Kind').selectOption({ label: 'Item' });
  await entry(1).getByLabel('Item', { exact: true }).selectOption({ label: 'Whale Louse Pelt' });
  await entry(1).getByLabel('Min').fill('2');
  await entry(1).getByLabel('Max').fill('2');
  // A second entry shows the odds; a min above max blocks the save.
  await form.getByRole('button', { name: 'Add entry' }).click();
  await entry(2).getByLabel('Item', { exact: true }).selectOption({ label: 'Hunter Fang' });
  await entry(2).getByLabel('Weight').fill('3');
  await expect(form.getByTestId('loot-chance')).toHaveText(['25% per pick', '75% per pick']);
  await entry(2).getByLabel('Min').fill('3');
  await expect(form.getByRole('note')).toContainText('Entry 2');
  await expect(form.getByRole('button', { name: 'Add table' })).toBeDisabled();
  await entry(2).getByRole('button', { name: 'Remove entry 2' }).click();
  await expect(form.getByTestId('loot-chance')).toHaveText(['100% per pick']);
  await form.getByRole('button', { name: 'Add table' }).click();
  await expect(loot.getByRole('status')).toHaveText('[Pale hunter drop] added');
  const list = loot.getByRole('list', { name: 'Loot tables' });
  await expect(list).toHaveText('[Pale hunter drop] (1 entry, 1 pick)');

  // The player is watching when the loot lands.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  const playerFrames: string[] = [];
  player.on('websocket', (ws) =>
    ws.on('framereceived', (f) => playerFrames.push(String(f.payload))),
  );
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'loot-tables');
  await list.getByRole('button', { name: /Pale hunter drop/ }).click();
  const roll = loot.getByRole('group', { name: 'Roll [Pale hunter drop]' });
  await roll.getByLabel('Roll for').selectOption({ label: 'Jake' });
  await roll.getByRole('button', { name: 'Roll' }).click();
  await expect(loot.getByRole('status')).toHaveText('Rolled [Pale hunter drop] for Jake');
  await expect(loot.getByTestId('loot-roll')).toHaveText([
    '[Pale hunter drop] for Jake: 2 × [Whale Louse Pelt]',
  ]);
  await expect(player.getByTestId('ding-toast')).toContainText(
    'You received [Whale Louse Pelt] ×2 from the GM',
  );
  await expect(player.getByTestId('inventory')).toContainText('Whale Louse Pelt');
  await player.getByTestId('inventory').scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-loot-gift-390x844.png') });

  // Edit the table to pay currency, then roll it for the GM's eyes only.
  await entry(1).getByLabel('Kind').selectOption({ label: 'Credits' });
  await entry(1).getByLabel('Min').fill('10');
  await entry(1).getByLabel('Max').fill('10');
  // A roll uses the saved table, so it waits for the save.
  await expect(roll.getByRole('button', { name: 'Roll' })).toBeDisabled();
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(loot.getByRole('status')).toHaveText('[Pale hunter drop] saved');
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await roll.getByLabel('Roll for').selectOption({ label: 'GM only (nobody gets it)' });
  await roll.getByRole('button', { name: 'Roll' }).click();
  await expect(loot.getByTestId('loot-roll')).toHaveText([
    '[Pale hunter drop] GM only: 10 Credits',
    '[Pale hunter drop] for Jake: 2 × [Whale Louse Pelt]',
  ]);
  await loot.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-loot-tables-1366x768.png') });
  // The GM-only roll gave Jake nothing.
  await expect(player.getByTestId('currency')).toHaveText('0');

  expect(playerFrames.length).toBeGreaterThan(0);
  expect(
    playerFrames.some(
      (f) => f.includes('Pale hunter drop') || f.includes('lootTable') || f.includes('lootLog'),
    ),
  ).toBe(false);
  await expect(player.locator('body')).not.toContainText('Pale hunter drop');
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
