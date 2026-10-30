import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.10 (DESIGN §11 "Prepare ahead"): off by default; once the GM turns it
// on, the co-DM notices where the table is heading and drafts content for it
// in the background. The GM reviews the prepared draft in Import content and
// approves it; the shop then exists. The fake mic plays the synthesized
// table-talk WAV; the fake recognizer "hears" the herbalist line; the
// test-only fake fast model says the party is heading to an herbalist
// (e2ePrepareAhead) and the fixture strong model writes the shop.

const GM_KEY = 'e2e-gm-key-mc10-0123456789abcdef10';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.10');
const localChromium = '/opt/pw-browsers/chromium';
const speech = path.resolve(
  import.meta.dirname,
  '../apps/server/test/fixtures/speech/table-talk.wav',
);
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${speech}`,
    ],
  },
});
let server: RunningServer | null = null;
let dataDir: string;

test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc10-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('a draft prepared ahead is reviewed and approved', async ({ browser }) => {
  test.setTimeout(120_000);
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { dataDir });
  const gmContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await gmContext.grantPermissions(['microphone']);
  const gm = await gmContext.newPage();
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openTab(gm, 'session');
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mc10-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const ahead = codm.getByTestId('prepare-ahead');
  const toggle = ahead.getByLabel('Draft content for where the table is heading');
  // Off by default.
  await expect(toggle).not.toBeChecked();
  await expect(ahead.getByRole('button', { name: 'Look ahead now' })).toHaveCount(0);

  const listen = gm.locator('section[aria-labelledby="listen-heading"]');
  await listen.getByRole('button', { name: 'Start listening' }).click();
  await expect(listen.getByTestId('transcript')).toContainText('Jake nocks an arrow and waits.', {
    timeout: 30_000,
  });
  await listen.getByRole('button', { name: 'Stop listening' }).click();
  await expect(listen.getByTestId('listen-indicator')).toHaveText('Mic off');

  // The herbalist line is a player question, so the suggestion row takes its
  // own look (MD.2, D258); let that one call land before counting.
  const base = server.url;
  const calls = async () => {
    const res = await gm.request.get(`${base}/api/gm/ai`, {
      headers: { 'x-gm-key': GM_KEY },
    });
    return ((await res.json()) as { spend: { calls: number } }).spend.calls;
  };
  await expect(codm.getByTestId('suggestions').getByTestId('chip').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(calls).toBe(1);

  // The box follows the server's saved setting, so click and wait for it.
  await toggle.click();
  await expect(toggle).toBeChecked();
  await ahead.getByRole('button', { name: 'Look ahead now' }).click();
  const prepared = ahead.getByTestId('prepared');
  await expect(prepared).toHaveCount(1);
  await expect(prepared).toContainText('Prepared: Herbalist');
  await expect(prepared).toContainText('“We should find an herbalist before the canyon.”');
  // Both calls (the look ahead and the draft) are counted.
  expect(await calls()).toBe(3);
  await ahead.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-prepared-1366x768.png') });

  // Review opens it in Import content; nothing exists until the GM approves.
  await prepared.getByRole('button', { name: 'Review' }).click();
  // The draft stays listed until the GM dismisses it, so nothing is lost
  // before approval (review M1).
  await expect(prepared).toHaveCount(1);
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await expect(imp).toContainText('Sap & Sinew, herbalist');
  await expect(imp.getByTestId('import-generated-note')).toBeVisible();
  for (const f of frames) expect(f).not.toContain('Sap & Sinew');
  await imp.getByRole('button', { name: 'Apply 4' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 4 entries');
  const shops = gm.locator('section[aria-labelledby="shops-heading"]');
  const shop = shops.getByRole('article', { name: 'Sap & Sinew' });
  await expect(shop).toBeVisible();
  await prepared.getByRole('button', { name: 'Dismiss' }).click();
  await expect(prepared).toHaveCount(0);
  await shop.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-prepared-approved-1366x768.png') });

  // The prepared draft, its quote and the transcript never reach the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist before the canyon');
    expect(f).not.toContain('Prepared');
  }
  await gmContext.close();
  await page.close();
});
