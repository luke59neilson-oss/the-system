import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.1 quest manager (DESIGN §7 "Quests", D67, D122, D180): the GM creates a
// quest with a timer and World Stability rules, moves stability by a tagged
// action, a nudge and a practice entry's tag (the D67 offer), creates a
// hidden quest aimed at one character, hides the gauge and completes the
// quest. Players see only what is visible, never the rules or hidden details.

const GM_KEY = 'e2e-gm-key-m71-0123456789abcdef71';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M7.1');
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

test('the GM runs quests and World Stability; players see only what is visible', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Quests');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await reveal(gm, create);
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const watch = async (name: string, width: number, height: number) => {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = watchErrors(page);
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await page.goto(server.url);
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    return { page, frames, errors: pageErrors };
  };
  const jake = await watch('Jake', 390, 844);
  const kim = await watch('Kim', 1366, 768);

  // Create a visible quest with a timer and World Stability the players see.
  const qm = gm.locator('section[aria-labelledby="quest-manager"]');
  await openWindow(gm, 'quest-manager');
  await expect(qm).toContainText('No quests yet.');
  const form = qm.locator('form[aria-labelledby="quest-form"]');
  await form.getByLabel('Quest title').fill('The world is dying');
  await form
    .getByLabel('Quest text (players see this)')
    .fill('Find what is killing it. Delve to the heart of the world.');
  await form.getByLabel('Timer in days (blank: none)').fill('30');
  await form.getByLabel(/World Stability rules/).fill('cleanse: -5\nzone: oops');
  await expect(form.getByTestId('quest-problem')).toContainText('tag: delta');
  await expect(form.getByRole('button', { name: 'Add quest' })).toBeDisabled();
  await form.getByLabel(/World Stability rules/).fill('Cleanse: -5\nsystem beast: +2');
  await form.getByLabel('Players see the World Stability gauge').check();
  await form.getByRole('button', { name: 'Add quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] added');
  const list = qm.getByRole('list', { name: 'Quest list' });
  await expect(list).toHaveText('[The world is dying] 30 days left · Stability 100%');

  const jakeQuest = jake.page.getByRole('article', { name: 'The world is dying' });
  await expect(jakeQuest).toContainText('Find what is killing it.');
  await expect(jakeQuest.getByTestId('quest-time')).toContainText('30 days');
  await expect(jakeQuest.getByTestId('stability-value')).toHaveText('100%');

  // Apply a tagged action twice, then nudge.
  await list.getByRole('button', { name: /The world is dying/ }).click();
  const stab = qm.getByRole('group', { name: 'World Stability of [The world is dying]' });
  await stab.getByRole('combobox', { name: /^Action/ }).selectOption('cleanse');
  await stab.getByLabel('Times').fill('2');
  await stab.getByLabel('Action reason (optional)').fill('Two curse zones');
  await stab.getByRole('button', { name: 'Apply action' }).click();
  await expect(qm.getByRole('status')).toHaveText('Applied "cleanse" × 2 to [The world is dying]');
  await expect(stab.getByTestId('quest-stability-value')).toHaveText('90%');
  await expect(jakeQuest.getByTestId('stability-value')).toHaveText('90%');
  await stab.getByLabel('Nudge by').fill('0');
  await stab.getByRole('button', { name: 'Nudge' }).click();
  await expect(qm.getByRole('alert')).toHaveText('Nudge by a whole number other than 0');
  await stab.getByLabel('Nudge by').fill('+3');
  await stab.getByRole('button', { name: 'Nudge' }).click();
  await expect(qm.getByRole('status')).toHaveText('Nudged [The world is dying] by +3');
  await expect(jakeQuest.getByTestId('stability-value')).toHaveText('93%');
  // Moving stability is not an edit made elsewhere: no stale warning.
  await expect(form.getByRole('note')).toHaveCount(0);
  await qm.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-quest-manager-1366x768.png') });
  await stab.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-quest-stability-1366x768.png') });

  // A practice entry tagged with a quest's action offers its stability rule.
  const practice = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  const quick = practice.getByRole('form', { name: 'Quick-add practice' });
  await openWindow(gm, 'practice-capture');
  await quick.getByLabel('Character').selectOption({ label: 'Jake' });
  await quick.getByLabel(/^Action \(Alt/).fill('Burned out a curse zone');
  await quick.getByLabel('Stat').selectOption('strength');
  await quick.getByLabel(/^Quest tags/).fill('Cleanse, fire');
  await quick.getByRole('button', { name: 'Log practice' }).click();
  const offers = practice.getByTestId('stability-offers');
  await expect(offers).toBeVisible();
  const offer = offers.getByRole('button', {
    name: 'Apply "cleanse" (-5) to [The world is dying]',
  });
  await expect(offer).toBeVisible();
  // The next entry (no quest tag) offers nothing new and keeps the pending offer.
  await quick.getByLabel('Character').selectOption({ label: 'Kim' });
  await quick.getByLabel(/^Action \(Alt/).fill('Climbed a canyon wall');
  await quick.getByLabel('Stat').selectOption('agility');
  await quick.getByRole('button', { name: 'Log practice' }).click();
  await expect(practice.getByRole('status')).toHaveText('Logged for Kim: Climbed a canyon wall');
  await expect(offers.getByRole('listitem')).toHaveCount(1);
  await expect(offers.getByRole('listitem')).toContainText('Jake: Burned out a curse zone');
  await offers.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-practice-stability-offer-1366x768.png') });
  await offer.click();
  await expect(practice.getByRole('status')).toHaveText(
    'Applied "cleanse" (-5) to [The world is dying]',
  );
  await expect(offers).toHaveCount(0);
  await expect(jakeQuest.getByTestId('stability-value')).toHaveText('88%');

  await jakeQuest.scrollIntoViewIfNeeded();
  await jake.page.screenshot({ path: path.join(shots, 'player-quest-390x844.png') });

  // A hidden quest told to Kim only.
  await openWindow(gm, 'quest-manager');
  await qm.getByRole('button', { name: 'New quest' }).click();
  await form.getByLabel('Quest title').fill('SECRET Heart of the Host');
  await form.getByLabel('Quest text (players see this)').fill('SECRET reach the Drum.');
  await form.getByLabel('Players see this quest').uncheck();
  await form.getByLabel('Only these characters').check();
  await expect(form.getByTestId('quest-notice-nobody')).toBeVisible();
  await form.getByRole('group', { name: 'Characters told' }).getByLabel('Kim').check();
  await form.getByLabel(/World Stability rules/).fill('secret-tag: -7');
  await form.getByRole('button', { name: 'Add quest' }).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-hidden-quest-1366x768.png') });
  await form.getByRole('button', { name: 'Add quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[SECRET Heart of the Host] added');
  await expect(list.getByRole('listitem').nth(1)).toHaveText(
    '[SECRET Heart of the Host] hidden · No timer · Stability 100% (GM only)',
  );
  await expect(kim.page.getByTestId('hidden-quests')).toHaveText(
    '[Hidden quest] A hidden quest exists and can be triggered.',
  );
  await expect(jake.page.getByTestId('hidden-quests')).toHaveCount(0);
  // Widening the notice to everyone tells Jake too.
  await list.getByRole('button', { name: /SECRET Heart/ }).click();
  await form.getByLabel('Every character (and characters created later)').check();
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[SECRET Heart of the Host] saved');
  await expect(jake.page.getByTestId('hidden-quests')).toHaveText(
    '[Hidden quest] A hidden quest exists and can be triggered.',
  );
  await expect(form.getByRole('button', { name: 'Save quest' })).toBeDisabled();

  // Editing: hide the first quest's gauge, then complete it.
  await list.getByRole('button', { name: /The world is dying/ }).click();
  await expect(form.getByLabel('Quest title')).toHaveValue('The world is dying');
  await expect(form.getByRole('button', { name: 'Save quest' })).toBeDisabled();
  await form.getByLabel('Players see the World Stability gauge').uncheck();
  await form.getByRole('button', { name: 'Save quest' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] saved');
  await expect(jakeQuest.getByTestId('stability')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Save quest' })).toBeDisabled();
  const status = qm.getByRole('group', { name: 'Status of [The world is dying]' });
  await status.getByRole('button', { name: 'Mark completed' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] completed');
  await expect(status.getByTestId('quest-manager-status')).toHaveText('completed');
  await expect(jake.page.getByTestId('finished-quests')).toContainText('The world is dying');
  await expect(stab.getByRole('button', { name: 'Apply action' })).toHaveCount(0);
  await status.getByRole('button', { name: 'Reopen' }).click();
  await expect(qm.getByRole('status')).toHaveText('[The world is dying] reopened');
  await expect(jakeQuest.getByTestId('quest-time')).toContainText('30 days');

  // Nothing GM-only reached either player: no hidden quest details, no
  // stability rules (tags or deltas), no practice tags.
  for (const p of [jake, kim]) {
    expect(p.frames.length).toBeGreaterThan(0);
    for (const secret of ['SECRET', 'secret-tag', 'system beast', '"cleanse"', '"fire"', GM_KEY]) {
      expect(p.frames.filter((f) => f.includes(secret))).toEqual([]);
    }
    expect(p.errors).toEqual([]);
  }
  await expect(kim.page.locator('body')).not.toContainText('SECRET');
  expect(errors).toEqual([]);
});
