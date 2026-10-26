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

  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
