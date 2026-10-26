import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.9 (Q63, DESIGN §7): "End scene" also asks each player what they
// practised; their entries go to the GM's review queue.

const GM_KEY = 'e2e-gm-key-mt9-0123456789abcdef09';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.9');
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

test('End scene asks each player; their answer reaches the GM review', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  await expect(page.getByTestId('player-scene-prompt')).toHaveCount(0);

  const win = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await win.getByRole('button', { name: 'End scene: log practice' }).click();
  await expect(win.getByTestId('scene-waiting')).toContainText('Jake, Kim');

  const prompt = page.getByTestId('player-scene-prompt');
  await expect(prompt).toContainText('[End of scene] What did you practise?');
  await prompt.scrollIntoViewIfNeeded();
  await prompt.getByTestId('scene-practice-form-action').fill('Climbed the rib under fire');
  await prompt.getByRole('checkbox').first().check();
  await page.screenshot({ path: path.join(shots, 'player-scene-prompt-390x844.png') });
  await prompt.getByRole('button', { name: 'Send to the GM' }).click();
  await expect(page.getByTestId('practice-notice')).toHaveText(
    'Practice sent to the GM for review.',
  );
  await expect(prompt).toHaveCount(0);
  await expect(win.getByTestId('scene-waiting')).toHaveText("Waiting on players' answers: Kim");
  await expect(win).toContainText('To review (1)');
  await expect(win).toContainText('Climbed the rib under fire');
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-scene-waiting-1366x768.png') });

  // Kim answers "Nothing this scene" from the status window's flag (review M3).
  const kim = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const kimErrors = watchErrors(kim);
  await kim.goto(server.url);
  await kim.getByRole('link', { name: /Kim/ }).click();
  await expect(kim.getByTestId('scene-badge')).toHaveText('What did you practise?');
  await kim.screenshot({ path: path.join(shots, 'player-scene-flag-390x844.png') });
  await kim.getByTestId('scene-pending').getByRole('button', { name: '[Answer]' }).click();
  const kimPrompt = kim.getByTestId('player-scene-prompt');
  await expect(kimPrompt).toBeInViewport();
  await kimPrompt.getByRole('button', { name: 'Nothing this scene' }).click();
  await expect(kim.getByTestId('practice-notice')).toHaveText('Nothing logged for this scene.');
  await expect(kimPrompt).toHaveCount(0);
  await expect(kim.getByTestId('scene-pending')).toHaveCount(0);
  await expect(win.getByTestId('scene-waiting')).toHaveCount(0);

  // The GM's own walk answers for anyone who has not (review M2, D222).
  await win.getByRole('button', { name: 'Nothing for Jake' }).click();
  await win.getByRole('button', { name: 'Nothing for Kim' }).click();
  await win.getByRole('button', { name: 'End scene: log practice' }).click();
  await expect(prompt).toBeVisible();
  await expect(win.getByTestId('scene-waiting')).toContainText('Jake, Kim');
  await win.getByRole('button', { name: 'Nothing for Jake' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(win.getByTestId('scene-waiting')).toHaveText("Waiting on players' answers: Kim");
  await expect(kimPrompt).toBeVisible();
  await win.getByLabel(/^Action/).fill('Held the line');
  await win.getByLabel('Stat').selectOption('endurance');
  await win.getByRole('button', { name: 'Log practice' }).click();
  await expect(kimPrompt).toHaveCount(0);
  await expect(win.getByTestId('scene-waiting')).toHaveCount(0);

  expect(kimErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test('End scene with answers outstanding resumes the walk, not a new prompt', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const win = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await win.getByRole('button', { name: 'End scene: log practice' }).click();
  await expect(win.getByTestId('scene-waiting')).toContainText('Jake');
  // Leave the walk without answering: reload drops the GM's local walk state.
  await gm.reload();
  await expect(win.getByRole('button', { name: 'Resume end of scene' })).toBeVisible();
  await win.getByRole('button', { name: 'Resume end of scene' }).click();
  await expect(win.getByTestId('scene-prompt')).toContainText('what did Jake practise?');
  await expect(win.getByTestId('scene-waiting')).toContainText('Jake');
});
