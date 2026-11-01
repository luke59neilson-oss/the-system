import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ML.3 (DESIGN §7 "Dice", Q95): meets beats. A tied d20 contest goes to the
// attacker (the side that acts, named on the contest form, side A by
// default), with no re-roll. (The re-rating words are pinned in QF.57.)

const GM_KEY = 'e2e-gm-key-ml3-0123456789abcdef0003';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ML.3');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('a tie lands for the attacker, whichever side acts', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Ties');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'rules-settings');
  await gm.getByTestId('rules-rolls').getByRole('combobox').selectOption('d20');
  await expect(phone.getByTestId('mod-perception')).toHaveText('[+0]');

  // Jake's Perception 10 (+0) against a stalker at 10 (+0), both dice typed 10.
  await openWindow(gm, 'encounter');
  const roller = gm.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByLabel('Who').selectOption('custom');
  await sideB.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByRole('textbox', { name: 'Value', exact: true }).fill('10');
  await sideB.getByRole('textbox', { name: 'Players see', exact: true }).fill('Pale stalker');
  const attacker = roller.getByTestId('contest-attacker');
  await expect(attacker).toHaveValue('a');
  // Even match: the attacker has 52.5% (rounded to 53%).
  await expect(roller.getByTestId('contest-chance')).toContainText('(53%)');
  const dice = roller.getByTestId('contest-dice').getByRole('textbox');
  await dice.first().fill('10');
  await dice.last().fill('10');
  await roller.getByRole('button', { name: 'Roll' }).click();
  const result = roller.getByTestId('contest-result');
  await expect(result).toContainText('a tie: the attacker wins');
  await expect(result).toContainText(/^Jake · Perception wins/);
  await gm.screenshot({ path: path.join(shots, 'gm-tie-attacker-a-1366x768.png') });
  await roller.getByRole('button', { name: 'Share with the table' }).click();
  const popup = phone.getByTestId('contest-popup');
  await expect(popup).toContainText('Success.');
  await expect(popup.getByTestId('contest-dice-line')).toHaveCount(1);
  await phone.screenshot({ path: path.join(shots, 'player-tie-won-390x844.png') });

  // The stalker acts: the same tie goes to it.
  await attacker.selectOption('b');
  await dice.first().fill('10');
  await dice.last().fill('10');
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(result).toContainText(/^Pale stalker wins/);
  await expect(result).toContainText('a tie: the attacker wins');
});
