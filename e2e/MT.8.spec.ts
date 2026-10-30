import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.8 (Q69, DESIGN §7): factions are GM-only until the GM reveals one; a
// revealed faction shows players its name and standing, never its head
// count, base region or notes. Hiding it again takes it off players' screens.

const GM_KEY = 'e2e-gm-key-mt8-0123456789abcdef08';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.8');
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

test('the GM reveals a faction: players see its name and standing only', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const win = gm.locator('section[aria-labelledby="trackers"]');
  const regionForm = win.getByRole('form', { name: 'New region' });
  await openWindow(gm, 'trackers');
  await regionForm.getByLabel('Region name').fill('HIDDEN-BASE Rake Canyons');
  await regionForm.getByRole('button', { name: 'Add region' }).click();
  await expect(win.getByRole('status')).toHaveText('HIDDEN-BASE Rake Canyons added');

  const factions = win.getByRole('group', { name: 'Survivor factions' });
  const form = factions.getByRole('form', { name: 'New faction' });
  await form.getByLabel('Faction name').fill('Canyon Watch');
  await form.getByLabel('Based in').selectOption({ label: 'HIDDEN-BASE Rake Canyons' });
  await form.getByLabel('Survivors').fill('4217');
  await form.getByLabel('Standing toward the party').fill('Wary');
  await form.getByLabel('Faction notes').fill('HIDDEN-NOTE led by a former nurse');
  await form.getByRole('button', { name: 'Add faction' }).click();
  await expect(win.getByRole('status')).toHaveText('Canyon Watch added');
  await form.getByLabel('Faction name').fill('UNREVEALED Pale Choir');
  await form.getByLabel('Standing toward the party').fill('UNREVEALED-STANDING');
  await form.getByRole('button', { name: 'Add faction' }).click();
  await expect(win.getByRole('status')).toHaveText('UNREVEALED Pale Choir added');

  // Nothing reaches the player before a reveal.
  await expect(page.getByTestId('quests')).toBeVisible();
  await expect(page.getByTestId('factions')).toHaveCount(0);
  expect(frames.filter((f) => f.includes('Canyon Watch'))).toEqual([]);

  await factions.getByRole('button', { name: 'Reveal Canyon Watch to players' }).click();
  await expect(win.getByRole('status')).toHaveText('Canyon Watch revealed to players');
  await expect(factions.getByTestId('faction-revealed')).toHaveCount(1);
  const shown = page.getByTestId('factions');
  await expect(shown.getByRole('list', { name: 'Factions' })).toHaveText('[Canyon Watch] · Wary');

  // An edit to a revealed faction reaches players live.
  await factions.getByRole('button', { name: /^Canyon Watch/ }).click();
  const edit = factions.getByRole('form', { name: 'Edit Canyon Watch' });
  await expect(edit.getByTestId('faction-live-note')).toBeVisible();
  await edit.getByLabel('Standing toward the party').fill('Friendly');
  await edit.getByRole('button', { name: 'Save faction' }).click();
  await expect(win.getByRole('status')).toHaveText('Canyon Watch saved');
  await expect(shown.getByRole('list', { name: 'Factions' })).toHaveText(
    '[Canyon Watch] · Friendly',
  );

  await factions.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-factions-1366x768.png') });
  await shown.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-factions-390x844.png') });

  await factions.getByRole('button', { name: 'Hide Canyon Watch from players' }).click();
  await expect(win.getByRole('status')).toHaveText('Canyon Watch hidden from players');
  await expect(page.getByTestId('factions')).toHaveCount(0);
  await expect(factions.getByTestId('faction-revealed')).toHaveCount(0);

  for (const secret of ['HIDDEN', 'UNREVEALED', '4217', 'nurse', GM_KEY]) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
