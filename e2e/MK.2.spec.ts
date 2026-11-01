import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MK.2 (DESIGN §7 "Dice"): the GM switches the campaign to d20 + modifier;
// the sheet shows each stat's modifier; a contest with one die thrown at the
// table and typed in and one rolled by the app shows each die, modifier,
// total and how it was rolled on the GM console and on the player's phone.

const GM_KEY = 'e2e-gm-key-mk2-0123456789abcdef0002';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MK.2');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('a d20 contest with a typed and an app die reaches both screens', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  // App odds: no modifiers on the sheet.
  await expect(phone.getByTestId('stat-perception')).toBeVisible();
  await expect(phone.getByTestId('mod-perception')).toHaveCount(0);

  // The setting in rules settings.
  await openWindow(gm, 'rules-settings');
  const rolls = gm.getByTestId('rules-rolls').getByRole('combobox');
  await expect(rolls).toHaveValue('odds');
  await rolls.selectOption('d20');
  await expect(gm.locator('section[aria-labelledby="rules-settings"]')).toContainText(
    'Rolls: d20 + modifier.',
  );
  await gm.screenshot({ path: path.join(shots, 'gm-rules-rolls-1366x768.png') });

  // Every stat starts at 10: +0 on the sheet.
  await expect(phone.getByTestId('mod-perception')).toHaveText('[+0]');
  await expect(phone.getByTestId('mod-strength')).toHaveText('[+0]');
  await phone.screenshot({ path: path.join(shots, 'player-sheet-390x844.png') });

  // Jake's Perception (typed 18) against a custom stalker at 20 (+3, app die).
  await openWindow(gm, 'encounter');
  const roller = gm.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByLabel('Who').selectOption('custom');
  await sideB.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByRole('textbox', { name: 'Value', exact: true }).fill('20');
  await sideB.getByRole('textbox', { name: 'Players see', exact: true }).fill('Pale stalker');
  await expect(roller.getByTestId('contest-chance')).toContainText('d20');
  await expect(roller.getByTestId('contest-chance')).toContainText('Pale stalker +3 (64%)');
  const dice = roller.getByTestId('contest-dice');
  // A die outside 1–20 is refused before rolling.
  await dice.getByRole('textbox').first().fill('21');
  await expect(dice).toContainText('1 to 20');
  await expect(roller.getByRole('button', { name: 'Roll' })).toBeDisabled();
  await dice.getByRole('textbox').first().fill('18');
  await roller.getByRole('button', { name: 'Roll' }).click();
  const result = roller.getByTestId('contest-result');
  await expect(result).toContainText('18 typed +0 = 18');
  await expect(result).toContainText(/Pale stalker \d+ app \+3 = \d+/);
  await gm.screenshot({ path: path.join(shots, 'gm-contest-1366x768.png') });
  await roller.getByRole('button', { name: 'Share with the table' }).click();

  // The phone shows each die, modifier, total and how it was rolled.
  const popup = phone.getByTestId('contest-popup');
  await expect(popup).toBeVisible();
  const lines = popup.getByTestId('contest-dice-line');
  await expect(lines.first()).toContainText('You: d20 18 (typed) +0 = 18');
  await expect(lines.last()).toContainText(/They: d20 \d+ \(app\) \+3 = \d+/);
  await phone.screenshot({ path: path.join(shots, 'player-contest-390x844.png') });

  // Canary: the custom side's stat value stays on the GM's side.
  expect(frames.join('\n')).not.toContain('"value":20');
});
