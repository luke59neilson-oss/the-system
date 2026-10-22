import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.1 Join screen: character list with portrait, name and grade; pick one;
// the browser remembers it (localStorage, and still works when storage throws).

const GM_KEY = 'e2e-gm-key-m31-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.1');
let server: RunningServer;

test.describe.configure({ mode: 'serial' });

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

const joinLinks = (page: Page) => page.getByTestId('characters').getByRole('link');

test('players pick a character from the list and the browser remembers it', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Join Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Ada Lovelace', exact: true })).toBeVisible();

  // The demo party spans grades G–D, so the list shows four grade metals.
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  const errors = watchErrors(phone);
  const listBodies: string[] = [];
  phone.on('response', (r) => {
    if (r.url().endsWith('/api/characters')) void r.text().then((t) => listBodies.push(t));
  });
  await phone.goto(server.url);
  await expect(phone.getByRole('heading', { name: 'Choose your character' })).toBeVisible();
  await expect(joinLinks(phone)).toHaveText([
    /Jake.*Grade D/,
    /Miranda.*Grade E/,
    /Casper.*Grade F/,
    /Sultan.*Grade G/,
  ]);
  // A portrait for every character: a monogram ringed in the grade's metal.
  await expect(phone.getByTestId('characters').getByTestId('portrait')).toHaveText([
    'J',
    'M',
    'C',
    'S',
  ]);
  await expect(phone.getByTestId('join-demo-jake').getByTestId('portrait')).toHaveClass(
    /theme-silver/,
  );
  await expect(phone.getByTestId('join-demo-sultan').getByTestId('portrait')).toHaveClass(
    /theme-aluminum/,
  );
  // Nothing to continue yet in a fresh browser.
  await expect(phone.getByTestId('continue')).toHaveCount(0);
  await phone.screenshot({ path: path.join(shots, 'join-390x844.png'), fullPage: true });

  // The public list carries only id, name, grade, grade theme and portrait URL.
  expect(listBodies.length).toBeGreaterThan(0);
  for (const body of listBodies) {
    for (const row of JSON.parse(body) as Record<string, unknown>[]) {
      expect(Object.keys(row).sort()).toEqual(['grade', 'id', 'name', 'portrait', 'theme']);
    }
  }

  // Pick Miranda; the status screen opens for her.
  await phone.getByRole('link', { name: /Miranda/ }).click();
  await expect(phone).toHaveURL(/\/play\/demo-miranda$/);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('name')).toHaveText('Miranda');

  // Back on the join screen (and after a reload), Miranda is offered first.
  await phone.getByRole('link', { name: 'Switch character' }).click();
  await expect(phone.getByTestId('continue')).toHaveText(/Continue as Miranda/);
  await expect(phone.getByTestId('join-demo-miranda')).toContainText('Last played');
  await expect(phone.getByText('Last played')).toHaveCount(1);
  await phone.reload();
  await expect(phone.getByTestId('continue')).toHaveText(/Continue as Miranda/);
  await phone.screenshot({ path: path.join(shots, 'join-remembered-390x844.png'), fullPage: true });
  await phone.getByTestId('continue').click();
  await expect(phone.getByTestId('name')).toHaveText('Miranda');

  // Picking someone else replaces the remembered character.
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Casper/ }).click();
  await expect(phone.getByTestId('name')).toHaveText('Casper');
  await phone.goto(server.url);
  await expect(phone.getByTestId('continue')).toHaveText(/Continue as Casper/);

  // Laptop layout of the same screen.
  const laptop = await context.newPage();
  const laptopErrors = watchErrors(laptop);
  await laptop.setViewportSize({ width: 1366, height: 768 });
  await laptop.goto(server.url);
  await expect(laptop.getByTestId('continue')).toHaveText(/Continue as Casper/);
  await laptop.screenshot({ path: path.join(shots, 'join-1366x768.png') });

  // The GM's View-as panes (on the host browser) never overwrite what it remembers.
  await phone.goto(`${server.url}/play/demo-jake?pane=1`);
  await expect(phone.getByTestId('name')).toHaveText('Jake');
  await phone.goto(server.url);
  await expect(phone.getByTestId('continue')).toHaveText(/Continue as Casper/);

  // Back on the real campaign the remembered demo character is not listed,
  // so nothing is offered; the list refreshes on demand.
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toHaveCount(0);
  await phone.getByRole('button', { name: 'Refresh' }).click();
  await expect(joinLinks(phone)).toHaveText([/Ada Lovelace.*Grade G/]);
  await expect(phone.getByTestId('continue')).toHaveCount(0);
  await phone.reload();
  await expect(joinLinks(phone)).toHaveText([/Ada Lovelace.*Grade G/]);
  await expect(phone.getByTestId('continue')).toHaveCount(0);
  await expect(phone.getByTestId('portrait')).toHaveText(['AL']);

  expect(errors).toEqual([]);
  expect(laptopErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
  await context.close();
});

test('the join screen works when the browser blocks localStorage', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    // Runs in the page; the e2e tsconfig has no DOM lib, hence globalThis.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(server.url);
  const access = await page.evaluate(() => {
    try {
      Reflect.get(globalThis, 'localStorage');
      return 'open';
    } catch {
      return 'blocked';
    }
  });
  expect(access).toBe('blocked');
  await expect(joinLinks(page)).toHaveText([/Ada Lovelace.*Grade G/]);
  await page.getByRole('link', { name: /Ada Lovelace/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  await expect(page.getByTestId('name')).toHaveText('Ada Lovelace');
  await page.getByRole('link', { name: 'Switch character' }).click();
  await expect(joinLinks(page)).toHaveText([/Ada Lovelace/]);
  await expect(page.getByTestId('continue')).toHaveCount(0);
  expect(errors).toEqual([]);
  await context.close();
});
