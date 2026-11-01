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

  // Jake's Perception (typed 3) against a custom stalker at 20 (+3, app die).
  // Jake's total 3 is below the stalker's lowest (1 + 3), so it never ties and
  // the result stays one round with the typed die (an 18 tied 1 in 20: CI red
  // on c4da9455).
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
  await expect(roller.getByTestId('contest-chance')).toContainText('Pale stalker +3 (62%)');
  const dice = roller.getByTestId('contest-dice');
  // A die outside 1–20 is refused before rolling.
  await dice.getByRole('textbox').first().fill('21');
  await expect(dice).toContainText('1 to 20');
  await expect(roller.getByRole('button', { name: 'Roll' })).toBeDisabled();
  await dice.getByRole('textbox').first().fill('3');
  await roller.getByRole('button', { name: 'Roll' }).click();
  const result = roller.getByTestId('contest-result');
  await expect(result).toContainText('3 typed +0 = 3');
  await expect(result).toContainText(/Pale stalker \d+ app \+3 = \d+/);
  await gm.screenshot({ path: path.join(shots, 'gm-contest-1366x768.png') });
  await roller.getByRole('button', { name: 'Share with the table' }).click();

  // The phone shows each die, modifier, total and how it was rolled.
  const popup = phone.getByTestId('contest-popup');
  await expect(popup).toBeVisible();
  const lines = popup.getByTestId('contest-dice-line');
  await expect(lines.first()).toContainText('You: d20 3 (typed) +0 = 3');
  await expect(lines.last()).toContainText(/They: d20 \d+ \(app\) \+3 = \d+/);
  await phone.screenshot({ path: path.join(shots, 'player-contest-390x844.png') });

  // Canary: the custom side's stat value stays on the GM's side.
  expect(frames.join('\n')).not.toContain('"value":20');
});

test("the GM asks the player's phone for a d20; it rolls, and the NPC's die is typed", async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openWindow(gm, 'rules-settings');
  await gm.getByTestId('rules-rolls').getByRole('combobox').selectOption('d20');
  await expect(gm.locator('section[aria-labelledby="rules-settings"]')).toContainText(
    'Rolls: d20 + modifier.',
  );

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('roll-prompt')).toHaveCount(0);

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
  // Only Jake's side can be rolled on a phone; the custom side has no player.
  await expect(roller.getByTestId('phone-roll-b')).toHaveCount(0);
  await roller.getByRole('button', { name: "Ask Jake's phone for a d20" }).click();
  await expect(roller.getByTestId('phone-roll-a')).toContainText("Waiting for Jake's d20");

  // The phone asks; Jake taps Roll and the app rolls the die.
  const prompt = phone.getByTestId('roll-prompt');
  await expect(prompt).toContainText('Roll d20 for Perception (+0)');
  await phone.screenshot({ path: path.join(shots, 'player-roll-prompt-390x844.png') });
  await prompt.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(prompt.getByTestId('roll-answer')).toContainText(
    /You rolled (\d+) \(app\) \+0 = \1\. The GM has it\./,
  );
  const answer = (await prompt.getByTestId('roll-answer').textContent()) ?? '';
  const die = /You rolled (\d+)/.exec(answer)?.[1] ?? '';
  await expect(roller.getByTestId('phone-roll-a')).toContainText(`Jake threw ${die} (app)`);
  await gm.screenshot({ path: path.join(shots, 'gm-phone-roll-1366x768.png') });

  // The GM types the stalker's die thrown at the table and rolls.
  // (Never a tie, so the result is one round: Jake's die is the app's.)
  const theirs = die === '7' ? 5 : 4;
  await roller.getByTestId('contest-dice').getByRole('textbox').nth(1).fill(String(theirs));
  await roller.getByRole('button', { name: 'Roll' }).click();
  const result = roller.getByTestId('contest-result');
  await expect(result).toContainText(`${die} app +0 = ${die}`);
  await expect(result).toContainText(`Pale stalker ${theirs} typed +3 = ${theirs + 3}`);
  // The phone's request closes once its die is used.
  await expect(prompt).toHaveCount(0);
  await roller.getByRole('button', { name: 'Share with the table' }).click();
  // MK.A review M1: the GM's list of shared rolls shows the d20 totals.
  await expect(roller.locator('.contest-recent')).toContainText(
    `d20: Jake · Perception ${die} vs Pale stalker ${theirs + 3}`,
  );

  const popup = phone.getByTestId('contest-popup');
  await expect(popup).toBeVisible();
  await expect(popup.getByTestId('contest-dice-line').first()).toContainText(
    `You: d20 ${die} (app) +0 = ${die}`,
  );
  await expect(popup).toContainText(`They: d20 ${theirs} (typed) +3 = ${theirs + 3}`);
  await phone.screenshot({ path: path.join(shots, 'player-phone-contest-390x844.png') });
  // Canary: the custom side's value stays with the GM.
  expect(frames.join('\n')).not.toContain('"value":20');
});

test('the phone shows the modifier of a contest one grade apart (QF.71)', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openWindow(gm, 'rules-settings');
  await gm.getByTestId('rules-rolls').getByRole('combobox').selectOption('d20');
  await expect(gm.locator('section[aria-labelledby="rules-settings"]')).toContainText(
    'Rolls: d20 + modifier.',
  );
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'encounter');
  const roller = gm.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByLabel('Who').selectOption('custom');
  await sideB.getByLabel('Grade').selectOption('F');
  await sideB.getByLabel('Stat').selectOption({ label: 'Perception' });
  await sideB.getByRole('textbox', { name: 'Value', exact: true }).fill('10');
  await sideB.getByRole('textbox', { name: 'Players see', exact: true }).fill('Pale stalker');
  await roller.getByLabel('Grade-gap mode').selectOption('gradeWalls');
  await roller.getByRole('button', { name: "Ask Jake's phone for a d20" }).click();
  // The sheet says +0; one grade below, this contest takes the penalty.
  await expect(phone.getByTestId('roll-prompt')).toContainText('Roll d20 for Perception (−5)');
  // QF.72: a request announces itself to a player reading elsewhere on the page;
  // the tap brings the prompt into view, and the notice leaves.
  await phone.getByRole('heading', { name: 'Notes' }).first().scrollIntoViewIfNeeded();
  await expect(phone.getByTestId('roll-prompt')).not.toBeInViewport();
  const call = phone.getByTestId('roll-call');
  await expect(call).toBeInViewport();
  await expect(call).toContainText('Roll d20 for Perception (−5)');
  await phone.screenshot({ path: 'docs/screens/QF.72/phone-roll-call-390x844.png' });
  await call.click();
  await expect(phone.getByTestId('roll-prompt')).toBeInViewport();
  await expect(call).toHaveCount(0);
  // Review M1: a mode that moves the modifier ends the request; none goes stale.
  await roller.getByLabel('Grade-gap mode').selectOption('none');
  await expect(phone.getByTestId('roll-prompt')).toHaveCount(0);
});

test("a phone die belongs to its contest; a console die closes the phone's request", async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openWindow(gm, 'rules-settings');
  await gm.getByTestId('rules-rolls').getByRole('combobox').selectOption('d20');
  await expect(gm.locator('section[aria-labelledby="rules-settings"]')).toContainText(
    'Rolls: d20 + modifier.',
  );
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

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
  await roller.getByRole('button', { name: "Ask Jake's phone for a d20" }).click();
  const prompt = phone.getByTestId('roll-prompt');
  await prompt.getByRole('textbox').fill('19');
  await prompt.getByRole('button', { name: 'Send die' }).click();
  await expect(roller.getByTestId('phone-roll-a')).toContainText('Jake threw 19 (typed)');

  // Tweaking the other side keeps Jake's die (round 2 M1).
  await sideB.getByRole('textbox', { name: 'Value', exact: true }).fill('30');
  await expect(roller.getByTestId('phone-roll-a')).toContainText('Jake threw 19 (typed)');
  // Changing Jake's own side makes it a different roll: the request closes,
  // so his phone stops asking (MK.A review M3), and nothing stale remains.
  await sideA.getByLabel('Stat').selectOption({ label: 'Agility' });
  await expect(prompt).toHaveCount(0);
  await expect(roller.getByTestId('phone-roll-stale-a')).toHaveCount(0);
  await sideA.getByLabel('Stat').selectOption({ label: 'Perception' });

  // Asked again and still waiting, the GM types Jake's die on the console:
  // Roll uses it and the phone stops asking.
  await roller.getByRole('button', { name: "Ask Jake's phone for a d20" }).click();
  await expect(prompt).toContainText('Roll d20 for Perception (+0)');
  const dice = roller.getByTestId('contest-dice').getByRole('textbox');
  await dice.nth(0).fill('12');
  await dice.nth(1).fill('3');
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(roller.getByTestId('contest-result')).toContainText('12 typed +0 = 12');
  await expect(prompt).toHaveCount(0);
  await expect(roller.getByTestId('phone-roll-a')).toContainText("Ask Jake's phone for a d20");
});
