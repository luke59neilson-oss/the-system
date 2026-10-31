import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.48 (D287): End session closes the open end-of-scene prompt, so a player
// can never answer it once the session (and its marks) is over.

const GM_KEY = 'e2e-gm-key-qf48-0123456789abcdef48';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.48');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('End session closes the scene prompt on the phone', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Over');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const panel = gm.locator('section[aria-labelledby="session-heading"]');
  await openWindow(gm, 'session');
  await panel.getByRole('button', { name: 'Start session 1' }).click();
  const capture = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await openWindow(gm, 'practice-capture');
  await capture.getByRole('button', { name: 'End scene: log practice' }).click();
  const prompt = page.getByTestId('player-scene-prompt');
  await expect(prompt).toContainText('[End of scene] What did you practise?');

  await openWindow(gm, 'session');
  await panel.getByRole('button', { name: 'End session…' }).click();
  await panel.getByRole('button', { name: 'End session 1' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Session 1 ended: backup saved, report written',
  );
  await expect(prompt).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, 'player-after-session-390x844.png') });
  await openWindow(gm, 'practice-capture');
  await expect(capture.getByTestId('scene-waiting')).toHaveCount(0);
  await gm.screenshot({ path: path.join(shots, 'gm-practice-capture-1366x768.png') });
});
