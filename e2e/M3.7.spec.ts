import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.7 Inventory, gifts, trades: the demo's equipped ring and bow on Jake's
// screen (D70), effective stats and pool maxima (D81), equip/unequip, a gift
// and a trade with the incoming notices.

const GM_KEY = 'e2e-gm-key-m37-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.7');
let server: RunningServer;

// One server per test: tests in a file may run in different workers (CI has
// more than one), so no test may depend on another's campaign state.
test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

/** A fresh campaign with the demo loaded (D70: Jake wears the ring and bow). */
async function loadDemo(gm: Page): Promise<void> {
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Inventory Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Runs one GM command over the GM page's own origin. */
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

test('inventory: gear, effective stats, gifts and trades', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await loadDemo(gm);

  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  const inv = jake.getByTestId('inventory');
  await expect(inv).toBeVisible();
  // The demo's gear (D70): the ring in Ring 1, the bow in the main hand.
  await expect(inv.getByTestId('slot-ring:0')).toContainText('[Ring of Haste (Rare)]');
  await expect(inv.getByTestId('slot-mainHand:0')).toContainText('[Whalebone Longbow (Uncommon)]');
  await expect(inv.getByTestId('currency')).toHaveText('120');
  await expect(inv.getByTestId('item-demo-potion')).toContainText('[Healing Potion (Common)] ×2');
  // Effective stats: the bow adds +0.3 Perception, the ring Agility.
  await expect(jake.getByTestId('bonus-perception')).toHaveText(' (+0.3)');
  await expect(jake.getByTestId('bonus-agility')).toBeVisible();
  await expect(jake.getByTestId('bonus-strength')).toHaveCount(0);
  await jake.screenshot({
    path: path.join(shots, 'player-inventory-1366x768.png'),
    fullPage: true,
  });

  // Unequip and re-equip the bow.
  const perception = jake.getByTestId('stat-perception').locator('strong');
  const withBow = await perception.textContent();
  await inv.getByRole('button', { name: 'Unequip Whalebone Longbow' }).click();
  await expect(inv.getByTestId('slot-mainHand:0')).toHaveCount(0);
  await expect(inv.getByTestId('item-demo-bow')).toBeVisible();
  await expect(jake.getByTestId('bonus-perception')).toHaveCount(0);
  const withoutBow = Number(await perception.textContent());
  expect(Number(withBow)).toBeCloseTo(withoutBow + 0.3, 5);
  await inv.getByRole('button', { name: 'Equip Whalebone Longbow' }).click();
  await expect(inv.getByTestId('slot-mainHand:0')).toBeVisible();
  await expect(jake.getByTestId('bonus-perception')).toHaveText(' (+0.3)');

  // Pool maxima follow effective stats (D81): a Vitality amulet raises max HP.
  const hp = jake.getByTestId('pool-hp');
  const [, hpMaxBefore] = ((await hp.textContent()) ?? '').match(/\/(\d+)/) ?? [];
  await gmCommand(gm, {
    type: 'item.define',
    id: 'amulet',
    name: 'Amulet of Vigor',
    rarity: 'rare',
    slot: 'necklace',
    bonuses: [{ stat: 'vitality', flat: 10 }],
  });
  await gmCommand(gm, {
    type: 'gift.give',
    characterId: null,
    to: 'demo-jake',
    items: { amulet: 1 },
  });
  await expect(jake.getByTestId('ding-toast')).toContainText(
    'You received [Amulet of Vigor] from the GM',
  );
  // A pool that is not full keeps its value when the maximum rises (MQ.2,
  // D100); unequipping clamps current HP to the new maximum.
  await gmCommand(gm, {
    type: 'character.setPools',
    characterId: 'demo-jake',
    pools: { hp: Number(hpMaxBefore) - 15 },
  });
  await expect(hp).toHaveText(`${Number(hpMaxBefore) - 15}/${hpMaxBefore}`);
  await inv.getByRole('button', { name: 'Equip Amulet of Vigor' }).click();
  await expect(hp).toHaveText(`${Number(hpMaxBefore) - 15}/${Number(hpMaxBefore) + 100}`);
  await gmCommand(gm, {
    type: 'character.setPools',
    characterId: 'demo-jake',
    pools: { hp: Number(hpMaxBefore) + 90 },
  });
  await expect(hp).toHaveText(`${Number(hpMaxBefore) + 90}/${Number(hpMaxBefore) + 100}`);
  await inv.getByRole('button', { name: 'Unequip Amulet of Vigor' }).click();
  await expect(hp).toHaveText(`${hpMaxBefore}/${hpMaxBefore}`);
  // Focus stays in the window after the clicked button disappears.
  await expect(jake.locator('#inventory-heading')).toBeFocused();

  // Jake gives Miranda a potion; she is told.
  const miranda = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mErrors = watchErrors(miranda);
  await miranda.goto(server.url);
  await miranda.getByRole('link', { name: /Miranda/ }).click();
  const mInv = miranda.getByTestId('inventory');
  await expect(mInv).toBeVisible();
  const mPotions = mInv.getByTestId('item-demo-potion');
  const mBefore =
    (await mPotions.count()) === 0
      ? 0
      : Number(((await mPotions.textContent()) ?? '').match(/×(\d+)/)?.[1] ?? 1);
  await inv.getByRole('button', { name: 'Give Healing Potion' }).click();
  const give = inv.getByTestId('give-form');
  await give.getByLabel('To').selectOption({ label: 'Miranda' });
  await give.getByLabel('How many').fill('1');
  await give.getByRole('button', { name: 'Give' }).click();
  await expect(inv.getByTestId('inventory-done')).toHaveText(
    'Gave [Healing Potion (Common)] to Miranda.',
  );
  await expect(inv.getByTestId('item-demo-potion')).not.toContainText('×2');
  await expect(miranda.getByTestId('ding-toast')).toContainText(
    'You received [Healing Potion] from Jake',
  );
  await expect(mPotions).toBeVisible();
  if (mBefore + 1 > 1) await expect(mPotions).toContainText(`×${mBefore + 1}`);

  // Miranda offers a potion for 10 Credits; Jake accepts; she is told.
  await mInv.getByRole('button', { name: 'Propose a trade' }).click();
  const tf = mInv.getByTestId('trade-form');
  await tf.getByLabel('With').selectOption({ label: 'Jake' });
  await tf.getByLabel('and item').selectOption({ label: '[Healing Potion (Common)]' });
  await tf.getByLabel('How many').fill('1');
  await tf.getByLabel(/You ask for/).fill('10');
  await miranda.screenshot({
    path: path.join(shots, 'player-trade-form-390x844.png'),
    fullPage: true,
  });
  await tf.getByRole('button', { name: 'Offer' }).click();
  await expect(mInv.getByTestId('trade-outgoing')).toContainText(
    'You offer Jake [Healing Potion (Common)] for 10 Credits',
  );
  await miranda.screenshot({ path: path.join(shots, 'player-trade-390x844.png'), fullPage: true });
  await expect(jake.getByTestId('ding-toast')).toContainText('Miranda offers you a trade');
  const offer = inv.getByTestId('trade-incoming');
  await expect(offer).toContainText('Miranda offers you [Healing Potion (Common)] for 10 Credits');
  await jake.screenshot({
    path: path.join(shots, 'player-trade-offer-1366x768.png'),
    fullPage: true,
  });
  await offer.getByRole('button', { name: '[Accept]' }).click();
  await expect(inv.getByTestId('currency')).toHaveText('110');
  await expect(inv.getByTestId('item-demo-potion')).toContainText('×2');
  await expect(inv.getByTestId('trade-incoming')).toHaveCount(0);
  await expect(miranda.getByTestId('ding-toast')).toContainText('Jake accepted your trade');
  await expect(mInv.getByTestId('past-trades')).toBeVisible();

  await expect(errors).toEqual([]);
  await expect(mErrors).toEqual([]);
  await expect(gmErrors).toEqual([]);
});

test('the GM View-as panes show the inventory read-only', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await loadDemo(gm);
  const bar = gm.getByRole('navigation', { name: 'View as' });
  await bar.getByRole('button', { name: 'Jake' }).click();
  const pane = gm.frameLocator('iframe[title="Jake (player view)"]:visible');
  const inv = pane.getByTestId('inventory');
  await expect(inv.getByTestId('slot-ring:0')).toContainText('[Ring of Haste (Rare)]');
  await expect(inv.getByRole('button')).toHaveCount(0);
  await gm.screenshot({ path: path.join(shots, 'gm-view-as-1920x1080.png') });
  expect(gmErrors).toEqual([]);
});
