import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.27 (sweep C, UX): with three pinned banners on a phone, [Answer] in the
// status window must bring the end-of-scene prompt's heading and field to
// rest below the sticky banner stack, not under it.

const GM_KEY = 'e2e-gm-key-qf27-0123456789abcdef27';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.27');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('[Answer] scrolls the scene prompt clear of three pinned banners', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await expect(jake.getByTestId('connection')).toHaveText('Connected');

  const form = gm.locator('form[aria-labelledby="broadcast"]');
  const banners = jake.getByTestId('broadcast-banner');
  for (const text of [
    '[The System is constructing the area…]',
    'A storm gathers over the Crown.',
    'The tide turns in the Red Rivers.',
  ]) {
    await form.getByLabel('Message').fill(text);
    await form.getByLabel('Show').selectOption('pinned');
    await form.getByRole('button', { name: 'Send broadcast' }).click();
    await expect(banners.filter({ hasText: text })).toHaveCount(1);
  }
  await expect(banners).toHaveCount(3);

  const win = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await win.getByRole('button', { name: 'End scene: log practice' }).click();
  await jake.getByTestId('scene-pending').getByRole('button', { name: '[Answer]' }).click();

  const prompt = jake.getByTestId('player-scene-prompt');
  const field = prompt.getByTestId('scene-practice-form-action');
  await expect(field).toBeFocused();
  // Let the scroll settle, then compare boxes in the viewport.
  await expect
    .poll(async () => {
      const stack = await jake.getByTestId('broadcast-banners').boundingBox();
      const top = await prompt.boundingBox();
      return stack && top ? Math.round(top.y - (stack.y + stack.height)) : -1;
    })
    .toBeGreaterThanOrEqual(0);
  const stack = await jake.getByTestId('broadcast-banners').boundingBox();
  const fieldBox = await field.boundingBox();
  expect(stack).not.toBeNull();
  expect(fieldBox).not.toBeNull();
  if (stack && fieldBox) {
    expect(fieldBox.y).toBeGreaterThanOrEqual(stack.y + stack.height);
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(844);
  }
  await expect(prompt).toContainText('[End of scene] What did you practise?');
  await jake.screenshot({ path: path.join(shots, 'player-answer-below-banners-390x844.png') });
});
