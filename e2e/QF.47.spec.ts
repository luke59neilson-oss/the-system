import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.47 (D182): a contest roll stays private until the GM shares it. Its
// practice entry is logged at once, so it names only the character's own
// stat, never the other side or the other side's stat.

const GM_KEY = 'e2e-gm-key-qf47-0123456789abcdef47';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.47');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('an unshared contest names no opponent on any phone', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Ambush');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await reveal(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const phones = [];
  for (const who of ['Jake', 'Kim']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(who) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    phones.push({ page, frames });
  }
  const [jake, kim] = phones as [(typeof phones)[number], (typeof phones)[number]];

  const win = gm.locator('section[aria-labelledby="encounter"]');
  const roller = win.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  const logged = win.locator(':scope > p[role="status"]');
  await openWindow(gm, 'encounter');

  // Jake's Perception against a custom ambusher, not shared.
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByLabel('Who').selectOption('custom');
  await sideB.getByLabel('Stat').selectOption({ label: 'Strength' });
  await sideB.getByRole('textbox', { name: 'Value', exact: true }).fill('12');
  await sideB.getByRole('textbox', { name: 'Players see', exact: true }).fill('Hooded Ambusher');
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(logged).toHaveText('Contest logged as practice');

  // Jake's Strength against Kim's Agility, not shared.
  await sideB.getByLabel('Who').selectOption({ label: 'Kim' });
  await sideB.getByLabel('Stat').selectOption({ label: 'Agility' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Strength' });
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(logged).toHaveText('Contest logged as practice');

  // Each phone has its own entries, naming its own stat only.
  const jakeLog = jake.page.getByTestId('practice');
  await expect(jakeLog).toContainText('Contest roll (Perception)');
  await expect(jakeLog).toContainText('Contest roll (Strength)');
  await expect(kim.page.getByTestId('practice')).toContainText('Contest roll (Agility)');
  await jakeLog.scrollIntoViewIfNeeded();
  await jake.page.screenshot({ path: path.join(shots, 'player-practice-390x844.png') });
  await gm.screenshot({ path: path.join(shots, 'gm-encounter-1366x768.png') });

  const jakeSaw = jake.frames.join('\n');
  const kimSaw = kim.frames.join('\n');
  expect(jakeSaw).not.toContain('Hooded Ambusher');
  expect(jakeSaw).not.toContain('Kim · Agility');
  expect(jakeSaw).not.toMatch(/Contest roll[^"]*Agility/);
  expect(kimSaw).not.toContain('Hooded Ambusher');
  expect(kimSaw).not.toContain('Jake · Strength');
  expect(kimSaw).not.toMatch(/Contest roll[^"]*(Strength|Perception)/);
});
