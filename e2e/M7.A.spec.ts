import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.A milestone acceptance (work in progress, wip/M7.A): a sample encounter
// end to end, and World Stability visible to players only when toggled on.
// Done so far: setup, a quest whose gauge starts hidden, then toggled on.
// The fight has damage so far. Next: a bestiary foe, a shared contest,
// a clock and montage, a stability action from the fight), XP, screenshots.

const GM_KEY = 'e2e-gm-key-m7a-0123456789abcdef7a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M7.A');
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

test('a sample encounter end to end; stability reaches players only when shown', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Milestone Seven');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  // A quest with World Stability rules, gauge hidden from players.
  const qm = gm.locator('section[aria-labelledby="quest-manager"]');
  const form = qm.locator('form[aria-labelledby="quest-form"]');
  await form.getByLabel('Quest title').fill('The world is dying');
  await form.getByLabel('Quest text (players see this)').fill('Find what is killing it.');
  await form.getByLabel(/World Stability rules/).fill('cleanse: -5\nsystem beast: +2');
  await form.getByRole('button', { name: 'Add quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] added');
  const quest = page.getByTestId('quest');
  await expect(quest).toContainText('The world is dying');
  await expect(quest.getByTestId('stability-value')).toHaveCount(0);

  // Toggle the gauge on: the player now sees World Stability.
  const list = qm.getByRole('list', { name: 'Quest list' });
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await form.getByLabel('Players see the World Stability gauge').check();
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] saved');
  await expect(quest.getByTestId('stability-value')).toHaveText('100%');

  // The fight: Jake takes 30 HP.
  const win = gm.locator('section[aria-labelledby="encounter"]');
  const pools = win.locator('form[aria-labelledby="pool-tool"]');
  await pools.getByLabel('Character').selectOption({ label: 'Jake' });
  await pools.getByLabel('Points', { exact: true }).fill('30');
  await pools.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('pool-hp')).toContainText('70/100');

  for (const secret of [GM_KEY, 'system beast']) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
