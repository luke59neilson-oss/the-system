import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.4 Credits history for players (DESIGN §7, Q65): each player sees their
// own ledger entries (grants, fines, gifts, trades, loot) with the balance
// after, newest first, and nobody else's.

const GM_KEY = 'e2e-gm-key-mt4-0123456789abcdef4';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.4');
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

test("each player sees their own Credits history and nobody else's", async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Coin');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await reveal(gm, create);
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
  // Nothing has moved yet: no history to show.
  await expect(jake.page.getByTestId('credits-history')).toHaveCount(0);

  const win = gm.locator('section[aria-labelledby="currency-ledger"]');
  await openWindow(gm, 'currency-ledger');
  await win.getByRole('button', { name: 'Everyone' }).click();
  await win.getByLabel('Credits each').fill('50');
  await win.getByLabel('Reason (the player sees this)').fill('Bounty on the pale hunter');
  await win.getByRole('button', { name: 'Grant' }).click();
  await expect(win.getByRole('status')).toHaveText('Granted 50 Credits to Jake, Kim');
  await win.getByRole('button', { name: /^Kim/ }).click();
  await win.getByLabel('Credits each').fill('20');
  await win.getByLabel('Reason (the player sees this)').fill('KIM-ONLY broke the bridge');
  await win.getByRole('button', { name: 'Fine' }).click();
  await expect(win.getByRole('status')).toHaveText('Fined Kim 20 Credits');
  await win.getByRole('button', { name: /^Jake/ }).click();
  await win.getByLabel('Credits each').fill('5');
  await win.getByLabel('Reason (the player sees this)').fill('Lantern oil');
  await win.getByRole('button', { name: 'Fine' }).click();
  await expect(win.getByRole('status')).toHaveText('Fined Jake 5 Credits');

  // Jake: his own two entries, newest first, with the balance after each.
  await expect(jake.page.getByTestId('currency')).toHaveText('45');
  const jakeHistory = jake.page.getByTestId('credits-history');
  await jakeHistory.getByText('Credits history').click();
  await expect(jakeHistory.getByRole('listitem')).toHaveText([
    '−5 Credits, fined by the GM: Lantern oil · balance 45',
    '+50 Credits from the GM: Bounty on the pale hunter · balance 50',
  ]);
  await jakeHistory.scrollIntoViewIfNeeded();
  await jake.page.screenshot({ path: path.join(shots, 'player-credits-history-390x844.png') });

  // Kim: her own, including the fine Jake never hears about.
  await expect(kim.page.getByTestId('currency')).toHaveText('30');
  const kimHistory = kim.page.getByTestId('credits-history');
  await kimHistory.getByText('Credits history').click();
  await expect(kimHistory.getByRole('listitem')).toHaveText([
    '−20 Credits, fined by the GM: KIM-ONLY broke the bridge · balance 30',
    '+50 Credits from the GM: Bounty on the pale hunter · balance 50',
  ]);

  await kim.page.setViewportSize({ width: 1366, height: 768 });
  await kimHistory.scrollIntoViewIfNeeded();
  await kim.page.screenshot({ path: path.join(shots, 'player-credits-history-1366x768.png') });

  expect(jake.frames.filter((f) => f.includes('KIM-ONLY'))).toEqual([]);
  expect(jake.frames.filter((f) => f.includes('"balance":30'))).toEqual([]);
  expect(kim.frames.filter((f) => f.includes('Lantern oil'))).toEqual([]);
  expect(jake.errors).toEqual([]);
  expect(kim.errors).toEqual([]);
  expect(errors).toEqual([]);
});
