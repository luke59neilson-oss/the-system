import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M6.A milestone acceptance (DESIGN §4 "Bonuses", §7 "Items", "Titles"): the
// economy end to end, all from the UI. The GM builds two items, grants the
// party currency, rolls a loot table for Jake and gives him copies from the
// library; Jake gifts one to Kim and trades her the loot for currency; Kim
// equips it; the GM awards Kim a library title. Each player sees only their
// own notices, the ledger records the trade, and no player receives the item
// library's unheld items, the loot tables, the ledger or the title library.

const GM_KEY = 'e2e-gm-key-m6a-0123456789abcdef6a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M6.A');
const TITLE_TEXT = 'You have propagated through the Host faster than any before you.';
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

/** Runs one GM command over the GM page's own origin (for setups the UI cannot make). */
async function gmCommand(gm: Page, command: Record<string, unknown>): Promise<void> {
  const result = await gm.evaluate(
    ({ key, command }) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
        );
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
          if (m.type === 'hello') ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
          if (m.type === 'joined')
            ws.send(JSON.stringify({ type: 'command', requestId: 'x', command }));
          if (m.type === 'result') {
            ws.close();
            resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
          }
        };
      }),
    { key: GM_KEY, command },
  );
  expect(result).toBe('ok');
}

test('give, trade, loot roll and title award end to end', async ({ browser }) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Economy');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const watch = async (name: string, width: number, height: number) => {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = watchErrors(page);
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    return { page, frames, errors: pageErrors, inv: page.getByTestId('inventory') };
  };
  const jake = await watch('Jake', 1366, 768);
  const kim = await watch('Kim', 390, 844);

  // Item library: an equippable charm (+5 Vitality) and a plain fang.
  const items = gm.locator('section[aria-labelledby="item-library"]');
  const itemForm = items.locator('form[aria-labelledby="item-library-form"]');
  await itemForm.getByLabel('Item name').fill('Bone Charm');
  await itemForm.getByLabel('Slot').selectOption({ label: 'Necklace' });
  await itemForm.getByLabel('Vitality').fill('5');
  await itemForm.getByRole('button', { name: 'Add to library' }).click();
  await expect(items.getByRole('status')).toHaveText('[Bone Charm] added to the library');
  await itemForm.getByLabel('Item name').fill('Hunter Fang');
  await itemForm.getByRole('button', { name: 'Add to library' }).click();
  await expect(items.getByRole('status')).toHaveText('[Hunter Fang] added to the library');
  await itemForm.getByLabel('Item name').fill('Secret Blade');
  await itemForm.getByRole('button', { name: 'Add to library' }).click();
  await expect(items.getByRole('status')).toHaveText('[Secret Blade] added to the library');

  // Currency: 50 each.
  const credits = gm.locator('section[aria-labelledby="currency-ledger"]');
  await credits.getByRole('button', { name: 'Everyone' }).click();
  await credits.getByLabel('Credits each').fill('50');
  await credits.getByLabel('Reason (the player sees this)').fill('Bounty on the pale hunter');
  await credits.getByRole('button', { name: 'Grant' }).click();
  await expect(credits.getByRole('status')).toHaveText('Granted 50 Credits to Jake, Kim');
  await expect(jake.inv.getByTestId('currency')).toHaveText('50');
  await expect(kim.inv.getByTestId('currency')).toHaveText('50');

  // Loot roll: a one-entry table always drops the charm.
  const loot = gm.locator('section[aria-labelledby="loot-tables"]');
  const lootForm = loot.locator('form[aria-labelledby="loot-table-form"]');
  await lootForm.getByLabel('Table name').fill('Pale hunter drop');
  const entry = lootForm.getByRole('group', { name: 'Entry 1' });
  await entry.getByLabel('Kind').selectOption({ label: 'Item' });
  await entry.getByLabel('Item', { exact: true }).selectOption({ label: 'Bone Charm' });
  await lootForm.getByRole('button', { name: 'Add table' }).click();
  await expect(loot.getByRole('status')).toHaveText('[Pale hunter drop] added');
  await loot
    .getByRole('list', { name: 'Loot tables' })
    .getByRole('button', { name: /Pale hunter drop/ })
    .click();
  const roll = loot.getByRole('group', { name: 'Roll [Pale hunter drop]' });
  await roll.getByLabel('Roll for').selectOption({ label: 'Jake' });
  await roll.getByRole('button', { name: 'Roll' }).click();
  await expect(loot.getByRole('status')).toHaveText('Rolled [Pale hunter drop] for Jake');
  await expect(jake.page.getByTestId('ding-toast')).toContainText(
    'You received [Bone Charm] from the GM',
  );
  await expect(jake.inv).toContainText('Bone Charm');

  // The GM gives Jake two fangs from the library.
  await items
    .getByRole('list', { name: 'Library items' })
    .getByRole('button', { name: /Hunter Fang/ })
    .click();
  const giveFang = items.getByRole('group', { name: 'Give or take [Hunter Fang]' });
  await giveFang.getByLabel('Character').selectOption({ label: 'Jake' });
  await giveFang.getByLabel('Count').fill('2');
  await giveFang.getByRole('button', { name: 'Give' }).click();
  await expect(items.getByRole('status')).toHaveText('Gave 2 × [Hunter Fang] to Jake');
  await expect(jake.inv).toContainText('[Hunter Fang (Inferior)] ×2');
  // The holder hears about it, like loot (review M2).
  await expect(jake.page.getByTestId('ding-toast')).toContainText(
    'You received [Hunter Fang] ×2 from the GM',
  );

  // Give: Jake gifts Kim one fang.
  await jake.inv.getByRole('button', { name: 'Give Hunter Fang' }).click();
  const gift = jake.inv.getByTestId('give-form');
  await gift.getByLabel('To').selectOption({ label: 'Kim' });
  await gift.getByLabel('How many').fill('1');
  await gift.getByRole('button', { name: 'Give' }).click();
  await expect(kim.page.getByTestId('ding-toast')).toContainText(
    'You received [Hunter Fang] from Jake',
  );
  await expect(kim.inv).toContainText('Hunter Fang');

  // The GM takes Jake's last fang back; he is told what left.
  await giveFang.getByLabel('Count').fill('1');
  await giveFang.getByRole('button', { name: 'Take' }).click();
  await expect(items.getByRole('status')).toHaveText('Took 1 × [Hunter Fang] from Jake');
  await expect(jake.page.getByTestId('ding-toast')).toContainText('The GM took [Hunter Fang]');
  await expect(jake.inv.getByRole('button', { name: 'Give Hunter Fang' })).toHaveCount(0);

  // Trade: Jake offers Kim the charm for 10 Credits; she accepts.
  await jake.inv.getByRole('button', { name: 'Propose a trade' }).click();
  const tf = jake.inv.getByTestId('trade-form');
  await tf.getByLabel('With').selectOption({ label: 'Kim' });
  await tf.getByLabel('and item').selectOption({ label: '[Bone Charm (Inferior)]' });
  await tf.getByLabel('How many').fill('1');
  await tf.getByLabel(/You ask for/).fill('10');
  await tf.getByRole('button', { name: 'Offer' }).click();
  await expect(kim.page.getByTestId('ding-toast')).toContainText('Jake offers you a trade');
  const offer = kim.inv.getByTestId('trade-incoming');
  await offer.scrollIntoViewIfNeeded();
  await kim.page.screenshot({ path: path.join(shots, 'player-trade-offer-390x844.png') });
  await offer.getByRole('button', { name: '[Accept]' }).click();
  await expect(kim.inv.getByTestId('currency')).toHaveText('40');
  await expect(jake.inv.getByTestId('currency')).toHaveText('60');
  await expect(jake.page.getByTestId('ding-toast')).toContainText('Kim accepted your trade');
  await expect(jake.inv.getByRole('button', { name: 'Give Bone Charm' })).toHaveCount(0);

  // Kim wears the charm: +0.5 Vitality, capped at 20% of base (0.2).
  await kim.inv.getByRole('button', { name: 'Equip Bone Charm' }).click();
  await expect(kim.page.getByTestId('bonus-vitality')).toHaveText(' (+0.2, capped)');
  await expect(kim.page.getByTestId('pool-hp')).toContainText('120/120');

  // Title award: +10% Vitality on top: (10 + 2) × 1.1 = 13.2, rounded to 13 → HP max 130.
  const titles = gm.locator('section[aria-labelledby="title-library"]');
  const titleForm = titles.locator('form[aria-labelledby="title-library-form"]');
  await titleForm.getByLabel('Title name').fill('Rapid Spread');
  await titleForm.getByLabel('System text (the holder sees this)').fill(TITLE_TEXT);
  await titleForm.getByLabel('Vitality percent').fill('10');
  await titleForm.getByRole('button', { name: 'Add title' }).click();
  await expect(titles.getByRole('status')).toHaveText('[Rapid Spread] added to the library');
  await titles
    .getByRole('list', { name: 'Library titles' })
    .getByRole('button', { name: /Rapid Spread/ })
    .click();
  const award = titles.getByRole('group', { name: 'Award [Rapid Spread]' });
  await award.getByLabel('Character to award').selectOption({ label: 'Kim' });
  await award.getByRole('button', { name: 'Award title' }).click();
  await expect(titles.getByRole('status')).toHaveText('Kim earned [Rapid Spread]');
  await expect(kim.page.getByTestId('ding-toast')).toContainText(
    `*'DING!' Title earned: [Rapid Spread] - ${TITLE_TEXT}*`,
  );
  await expect(kim.page.getByTestId('title-text')).toHaveText(TITLE_TEXT);
  await expect(kim.page.getByTestId('pool-hp')).toContainText('130/130');
  // The sheet says what items and what titles add (review M1): 1.0 + 0.2 + 0.1.
  await expect(kim.page.getByTestId('bonus-vitality')).toHaveText(
    ' (items +0.2, capped; titles +0.1)',
  );
  await expect(kim.page.getByTestId('stat-vitality')).toContainText('1.3');
  await kim.page.getByTestId('titles').scrollIntoViewIfNeeded();
  await kim.page.screenshot({ path: path.join(shots, 'player-kim-390x844.png') });

  // Jake already holds "Forerunner" as plain text (say, from an import). Adding
  // it to the library warns the GM and DINGs Jake, whose Agility rises (review M3).
  const list = (await (await fetch(`${server.url}/api/characters`)).json()) as {
    id: string;
    name: string;
  }[];
  const jakeId = list.find((c) => c.name === 'Jake')?.id ?? 'missing';
  await gmCommand(gm, { type: 'title.award', characterId: jakeId, title: 'Forerunner' });
  await titles.getByRole('button', { name: 'New title' }).click();
  await titleForm.getByLabel('Title name').fill('forerunner');
  await titleForm.getByLabel('System text (the holder sees this)').fill('First to set foot.');
  await titleForm.getByLabel('Agility percent').fill('50');
  await expect(titleForm.getByTestId('title-new-holders')).toHaveText(
    'Jake already holds [forerunner]: saving gives them its bonuses and tells them.',
  );
  await titleForm.getByTestId('title-new-holders').scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-title-holders-1366x768.png') });
  await titleForm.getByRole('button', { name: 'Add title' }).click();
  await expect(titles.getByRole('status')).toHaveText(
    '[forerunner] added to the library · Jake now gets its bonuses',
  );
  await expect(jake.page.getByTestId('ding-toast')).toContainText(
    `*'DING!' Title earned: [forerunner] - First to set foot.*`,
  );
  await expect(jake.page.getByTestId('bonus-agility')).toHaveText(' (titles +0.5)');

  // The GM ledger records the grant and the trade.
  // Newest first: the trade (one row per side, with balances), then the grants.
  const rows = credits.getByTestId('ledger-row');
  await expect(rows).toHaveCount(4);
  const trade = rows.filter({ hasText: 'Trade' });
  await expect(trade).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Trade');
  await expect(rows.nth(1)).toContainText('Trade');
  const side = (name: string) => trade.filter({ has: gm.getByRole('cell', { name, exact: true }) });
  await expect(side('Jake')).toContainText('+10');
  await expect(side('Jake').getByRole('cell').last()).toHaveText('60');
  await expect(side('Kim')).toContainText('10');
  await expect(side('Kim').getByRole('cell').last()).toHaveText('40');
  await expect(rows.filter({ hasText: 'Bounty on the pale hunter' })).toHaveCount(2);
  await credits.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-economy-1366x768.png') });
  await jake.page.screenshot({ path: path.join(shots, 'player-jake-1366x768.png') });

  // Nothing GM-only, and nothing of the other player's, reached a player.
  for (const p of [jake, kim]) {
    expect(p.frames.length).toBeGreaterThan(0);
    expect(
      p.frames.some(
        (f) =>
          f.includes('Secret Blade') ||
          f.includes('Pale hunter drop') ||
          f.includes('"ledger"') ||
          f.includes('"titleLibrary"') ||
          f.includes('"lootTables"') ||
          f.includes(GM_KEY),
      ),
    ).toBe(false);
    expect(p.errors).toEqual([]);
  }
  expect(jake.frames.some((f) => f.includes('propagated'))).toBe(false);
  await expect(jake.page.locator('body')).not.toContainText('propagated');
  expect(errors).toEqual([]);
});
