import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M6.3 currency (DESIGN §7 "Items"): the GM grants the party currency with a
// reason, fines one character, is refused a fine larger than a balance, and
// reads every change in the GM-only ledger. Each player is told of their own
// grant or fine (with the reason) and nobody else's; no player gets the ledger.

const GM_KEY = 'e2e-gm-key-m63-0123456789abcdef63';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M6.3');
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

test('the GM grants and fines currency; players see their own notices; the ledger stays GM-only', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Coin');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const watch = async (name: string) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = watchErrors(page);
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    return { page, frames, errors: pageErrors };
  };
  const jake = await watch('Jake');
  const kim = await watch('Kim');

  const win = gm.locator('section[aria-labelledby="currency-ledger"]');
  await expect(win.getByRole('heading', { level: 2 })).toHaveText('Credits');
  await expect(win).toContainText('No Credits has changed hands yet.');
  await expect(win.getByTestId('currency-balance')).toHaveText(['0 Credits', '0 Credits']);

  // A grant to everyone, with a reason each player sees.
  await win.getByRole('button', { name: 'Everyone' }).click();
  await win.getByLabel('Amount').fill('50');
  await win.getByLabel('Reason (the player sees this)').fill('Bounty on the pale hunter');
  await win.getByRole('button', { name: 'Grant' }).click();
  await expect(win.getByRole('status')).toHaveText('Granted 50 Credits to Jake, Kim');
  await expect(win.getByTestId('currency-balance')).toHaveText(['50 Credits', '50 Credits']);
  for (const p of [jake, kim]) {
    await expect(p.page.getByTestId('ding-toast')).toContainText(
      'You received 50 Credits from the GM: Bounty on the pale hunter',
    );
    await expect(p.page.getByTestId('currency')).toHaveText('50');
  }

  // A fine for Kim alone; Jake is not told.
  await win.getByRole('button', { name: 'Clear' }).click();
  await win.getByRole('checkbox', { name: /Kim/ }).check();
  await win.getByLabel('Amount').fill('20');
  await win.getByLabel('Reason (the player sees this)').fill('Broke the canyon bridge');
  await win.getByRole('button', { name: 'Fine' }).click();
  await expect(win.getByRole('status')).toHaveText('Fined Kim 20 Credits');
  await expect(kim.page.getByTestId('ding-toast')).toContainText(
    'Fined 20 Credits by the GM: Broke the canyon bridge',
  );
  await expect(kim.page.getByTestId('currency')).toHaveText('30');
  await kim.page.screenshot({ path: path.join(shots, 'player-fine-390x844.png') });

  // A fine above Kim's balance is refused before anything is sent.
  await win.getByLabel('Amount').fill('31');
  await win.getByRole('button', { name: 'Fine' }).click();
  await expect(win.getByRole('alert')).toHaveText('Not enough Credits: Kim has 30');
  await expect(win.getByTestId('currency-balance')).toHaveText(['50 Credits', '30 Credits']);

  // The ledger shows every change, newest first, and filters by character.
  const rows = win.getByTestId('ledger-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Kim');
  await expect(rows.nth(0)).toContainText('Fine · Broke the canyon bridge');
  await expect(rows.nth(0)).toContainText('−20');
  await expect(rows.nth(2)).toContainText('Grant · Bounty on the pale hunter');
  await win.getByLabel('Show').selectOption({ label: 'Jake' });
  await expect(rows).toHaveCount(1);
  await win.getByLabel('Show').selectOption({ label: 'Everyone' });
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-currency-1366x768.png') });

  // Jake never heard of Kim's fine; no player received the ledger.
  await expect(jake.page.locator('body')).not.toContainText('canyon bridge');
  expect(jake.frames.some((f) => f.includes('canyon bridge'))).toBe(false);
  for (const p of [jake, kim]) {
    expect(p.frames.length).toBeGreaterThan(0);
    expect(p.frames.some((f) => f.includes('"ledger"'))).toBe(false);
    expect(p.errors).toEqual([]);
  }
  expect(errors).toEqual([]);
});
