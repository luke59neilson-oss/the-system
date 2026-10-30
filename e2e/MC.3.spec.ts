import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.3 (DESIGN §11 "Shops"): the GM imports a shop (as the co-DM would write
// it), sees it in the Shops window, and sells a ware: "Sell" offers it to the
// chosen character as a GM trade at the listed price. Jake accepts on his
// screen; the item and the currency move. The shop itself (keeper, hook,
// price list) never reaches a player.

const GM_KEY = 'e2e-gm-key-mc3-0123456789abcdef03';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.3');
const examples = path.resolve(import.meta.dirname, '../docs/content-examples');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('the GM sells a shop ware to a player as a GM trade', async ({ browser }) => {
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
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const inv = page.getByTestId('inventory');

  // Jake has 40 Credits to spend.
  const ledger = gm.locator('section[aria-labelledby="currency-ledger"]');
  await ledger.getByRole('button', { name: 'Everyone' }).click();
  await ledger.getByLabel('Credits each').fill('40');
  await ledger.getByLabel('Reason (the player sees this)').fill('Pay');
  await ledger.getByRole('button', { name: 'Grant' }).click();
  await expect(inv.getByTestId('currency')).toHaveText('40');

  const shops = gm.locator('section[aria-labelledby="shops-heading"]');
  await expect(shops).toContainText('No shops yet.');

  // The shop example: two items, a region and the shop that sells them.
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await imp.getByLabel('Content file (.json)').setInputFiles(path.join(examples, 'shop.json'));
  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');

  const shop = shops.getByRole('article', { name: 'Sap & Sinew' });
  await expect(shop.getByRole('heading', { level: 3 })).toHaveText('[Sap & Sinew]');
  await expect(shop).toContainText('In The Crown Camp');
  await expect(shop).toContainText('Keeper: Old Brenna');
  await expect(shop).toContainText('[Clotleaf Salve] (Common) 15 Credits');
  await expect(shop).toContainText('[Bracers of the Grove] (Uncommon) 120 Credits');
  await expect(shop).toContainText('Hook: She pays well for pale-hunter glands.');

  await shops.getByLabel('Sell to').selectOption({ label: 'Jake' });
  await shop.getByRole('button', { name: 'Sell Clotleaf Salve' }).click();
  await expect(shops.getByRole('status')).toHaveText(
    'Offered [Clotleaf Salve] to Jake for 15 Credits: waiting for Jake to accept',
  );
  // One offer at a time per ware and character; the open offer is listed.
  await expect(shop.getByRole('button', { name: 'Sell Clotleaf Salve' })).toBeDisabled();
  const offers = shops.getByRole('list', { name: 'Your open offers' });
  await expect(offers).toHaveText(/To Jake: \[Clotleaf Salve\] for 15 Credits/);

  // A wrong offer is cancelled: it leaves Jake's screen.
  await shop.getByRole('button', { name: 'Sell Bracers of the Grove' }).click();
  await expect(page.getByTestId('trade-incoming')).toHaveCount(2);
  await shops.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-shops-1366x768.png') });
  await offers
    .getByRole('button', {
      name: 'Cancel the offer to Jake: [Bracers of the Grove] for 120 Credits',
    })
    .click();
  await expect(shops.getByRole('status')).toHaveText('Offer to Jake cancelled');
  await expect(page.getByTestId('trade-incoming')).toHaveCount(1);

  const offer = inv.getByTestId('trade-incoming');
  await expect(offer).toContainText('Clotleaf Salve');
  await offer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-shop-offer-390x844.png') });
  await offer.getByRole('button', { name: '[Accept]' }).click();
  await expect(inv.getByTestId('currency')).toHaveText('25');
  await expect(inv.getByTestId('items')).toContainText('Clotleaf Salve');
  await expect(offers).toHaveCount(0);
  await expect(shop.getByRole('button', { name: 'Sell Clotleaf Salve' })).toBeEnabled();

  // Removing the shop leaves its items in the library.
  gm.once('dialog', (d) => void d.accept());
  await shop.getByRole('button', { name: 'Remove shop' }).click();
  await expect(shops.getByRole('status')).toHaveText('[Sap & Sinew] removed');
  await expect(shops).toContainText('No shops yet.');
  await expect(gm.locator('section[aria-labelledby="item-library"]')).toContainText(
    'Bracers of the Grove',
  );

  // The shop is GM-side: no keeper, hook, shop name or place reached Jake
  // (he saw only the wares the GM offered him).
  const all = frames.join('\n');
  for (const secret of ['Brenna', 'pale-hunter glands', 'Sap & Sinew', 'The Crown Camp']) {
    expect(all).not.toContain(secret);
  }
  await gm.close();
  await page.close();
});
