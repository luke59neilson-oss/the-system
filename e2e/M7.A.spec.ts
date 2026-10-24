import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.A milestone acceptance: a sample encounter end to end (a bestiary foe, a
// shared contest, damage, a clock and its montage with the player's focus, a
// World Stability action from the fight, XP for the target), and World
// Stability visible to players only while its gauge is toggled on.

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
  test.setTimeout(150_000);
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
  // The foe: a same-grade bestiary entry, so the contest is a real roll.
  const bestiary = gm.locator('form[aria-labelledby="bestiary-form"]');
  await bestiary.getByLabel('Name (GM only)').fill('SECRET Pale Hunter');
  await bestiary.getByLabel('Label players see (blank: the name)').fill('Pale hunter');
  await bestiary.getByLabel('Grade').selectOption('G');
  await bestiary.getByLabel('Level').fill('2');
  await bestiary.getByLabel('Agility').fill('17');
  await bestiary.getByLabel('Common', { exact: true }).fill('[A pale shape]');
  await bestiary.getByRole('button', { name: 'Add entry' }).click();

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
  // While hidden, no player frame carries the stability value.
  expect(frames.some((f) => f.includes('"stability":100'))).toBe(false);

  // Toggle the gauge on: the player now sees World Stability.
  const list = qm.getByRole('list', { name: 'Quest list' });
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await form.getByLabel('Players see the World Stability gauge').check();
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] saved');
  await expect(quest.getByTestId('stability-value')).toHaveText('100%');

  // The fight opens with a contest against the foe, shared with the table.
  const win = gm.locator('section[aria-labelledby="encounter"]');
  const roller = win.locator('form[aria-labelledby="contest-roller"]');
  const sideA = roller.getByRole('group', { name: 'Side A' });
  const sideB = roller.getByRole('group', { name: 'Side B' });
  await sideA.getByLabel('Who').selectOption({ label: 'Jake' });
  await sideA.getByLabel('Stat').selectOption({ label: 'Agility' });
  await sideB.getByLabel('Who').selectOption({ label: 'SECRET Pale Hunter (bestiary)' });
  await sideB.getByLabel('Stat').selectOption({ label: 'Agility' });
  await expect(sideB.getByRole('textbox', { name: 'Value', exact: true })).toHaveValue('17');
  await expect(sideB.getByRole('textbox', { name: 'Players see', exact: true })).toHaveValue(
    'Pale hunter',
  );
  // Same grade: plain ratio odds, 10 against 17.
  await expect(roller.getByTestId('contest-chance')).toHaveText(
    'Jake · Agility: 37% · Pale hunter: 63%',
  );
  await roller.getByRole('button', { name: 'Roll' }).click();
  await expect(roller.getByTestId('contest-result')).toContainText('(Jake · Agility 37%, rolled');
  await roller.getByRole('button', { name: 'Share with the table' }).click();
  const popup = page.getByTestId('contest-popup');
  await expect(popup).toContainText('[Jake · Agility] vs [Pale hunter]');
  await expect(popup).toContainText('Your chance: 37%');
  await expect(popup).toContainText(/Success\.|Failure\./);
  await page.screenshot({ path: path.join(shots, 'player-contest-popup-390x844.png') });
  await popup.getByRole('button', { name: 'OK' }).click();
  await expect(popup).toHaveCount(0);

  // The foe hits back: Jake takes 30 HP.
  const pools = win.locator('form[aria-labelledby="pool-tool"]');
  await pools.getByLabel('Character').selectOption({ label: 'Jake' });
  await pools.getByLabel('Points', { exact: true }).fill('30');
  await pools.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('pool-hp')).toContainText('70/100');

  // A clock for the chase; half full with no failures offers a montage.
  const clocks = win.locator('[aria-labelledby="clocks"]');
  await clocks.getByLabel('Clock name').fill('Run it down');
  await clocks.getByLabel('Segments').fill('4');
  await clocks.getByRole('button', { name: 'Start clock' }).click();
  const clock = clocks.getByRole('listitem', { name: '[Run it down]' });
  await clock.getByRole('button', { name: 'Success +1' }).click();
  await clock.getByRole('button', { name: 'Success +1' }).click();
  await expect(clock).toContainText('2/4');
  await clock.getByRole('button', { name: 'Offer montage' }).click();
  await clock.getByLabel('Players see').fill('Hunting the pale hunter');
  await clock.getByRole('checkbox', { name: 'Kim' }).uncheck();
  await clock.getByRole('button', { name: 'Offer', exact: true }).click();
  await expect(clock).toContainText('Montage “Hunting the pale hunter”: waiting on Jake');
  const montage = page.getByTestId('practice').getByTestId('montage');
  await expect(montage).toContainText('Hunting the pale hunter');
  await montage.getByTestId('montage-form-action').fill('Track it through the canyon');
  await montage.getByTestId('montage-form-stat').selectOption({ label: 'Perception' });
  await montage.getByTestId('montage-form-submit').click();
  await expect(montage.getByTestId('montage-focus')).toContainText('Track it through the canyon');
  await expect(clock).not.toContainText('waiting on Jake');
  await clocks.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-encounter-1366x768.png') });
  await roller.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-encounter-roller-1366x768.png') });

  // The fight crossed a curse zone (cleanse, -5), then the kill was a
  // System-placed beast (+2): the player's gauge follows both.
  const stab = qm.getByRole('group', { name: 'World Stability of [The world is dying]' });
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await stab.getByRole('combobox', { name: /^Action/ }).selectOption('cleanse');
  await stab.getByRole('button', { name: 'Apply action' }).click();
  await expect(stab.getByTestId('quest-stability-value')).toHaveText('95%');
  await expect(quest.getByTestId('stability-value')).toHaveText('95%');
  await stab.getByRole('combobox', { name: /^Action/ }).selectOption('system beast');
  await stab.getByRole('button', { name: 'Apply action' }).click();
  await expect(quest.getByTestId('stability-value')).toHaveText('97%');

  // XP for the fight: 340 split evenly (170 each), the foe two levels above:
  // +20% makes 204, level 2 (without the bonus 170 would stop at level 1).
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Amount').fill('340');
  await award.getByLabel('Target’s grade').selectOption('G');
  await award.getByRole('checkbox', { name: 'Above-level bonus' }).check();
  await award.getByLabel('Target’s level').fill('2');
  await award.getByLabel('Reason (GM only)').fill('SECRET reason: the pale hunter');
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(page.getByTestId('class')).toHaveText(/lvl 2\]/);
  // The roller follows Jake's new Agility from the level-ups (no stale odds).
  await expect(sideA.getByRole('textbox', { name: 'Value', exact: true })).not.toHaveValue('10');
  await page.getByTestId('quest').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-after-fight-390x844.png') });

  // Hide the gauge again: the player loses it and later changes never arrive.
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await form.getByLabel('Players see the World Stability gauge').uncheck();
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] saved');
  await expect(quest.getByTestId('stability-value')).toHaveCount(0);
  await expect(quest).toContainText('The world is dying');
  const afterHide = frames.length;
  await stab.getByLabel('Nudge by').fill('-14');
  await stab.getByRole('button', { name: 'Nudge' }).click();
  await expect(stab.getByTestId('quest-stability-value')).toHaveText('83%');
  await expect(quest.getByTestId('stability-value')).toHaveCount(0);
  // A visible edit after the nudge: once it arrives, any nudge frame has too.
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await form.getByLabel('Quest text (players see this)').fill('Find what is killing it. Hurry.');
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(quest).toContainText('Hurry.');
  expect(frames.slice(afterHide).some((f) => f.includes('"stability":83'))).toBe(false);

  for (const secret of [GM_KEY, 'system beast', 'SECRET', '"cleanse"']) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
