import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.8 (DESIGN §11 "Suggestions"): the co-DM reads the table talk and offers
// chips with the quote behind each; Use fills in the generate request and the
// shop is generated into the import preview; a dismissed chip stays gone.
// The fake mic plays the synthesized table-talk WAV; the fake recognizer
// "hears" the herbalist and arrow lines; the test-only fake fast model turns
// them into a Generate shop chip and a Complication chip (e2eSuggestions).

const GM_KEY = 'e2e-gm-key-mc8-0123456789abcdef08';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.8');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc8-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('a suggestion chip from the table talk becomes a generated shop', async ({ browser }) => {
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
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mc8-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const listen = gm.locator('section[aria-labelledby="listen-heading"]');
  await listen.getByRole('button', { name: 'Start listening' }).click();
  await expect(listen.getByTestId('transcript')).toContainText('Jake nocks an arrow and waits.', {
    timeout: 30_000,
  });
  await listen.getByRole('button', { name: 'Stop listening' }).click();
  await expect(listen.getByTestId('listen-indicator')).toHaveText('Mic off');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const suggestions = codm.getByTestId('suggestions');
  await suggestions.getByRole('button', { name: 'Suggest now' }).click();
  const chips = suggestions.getByTestId('chip');
  await expect(chips).toHaveCount(2);
  const shop = chips.filter({ hasText: 'Generate: Herbalist shop' });
  await expect(shop).toContainText('“We should find an herbalist before the canyon.”');
  await suggestions.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-suggestions-1366x768.png') });

  // Dismissed: gone, and asking again by hand (too soon) brings nothing back.
  await chips
    .filter({ hasText: 'Pale hunters close in' })
    .getByRole('button', { name: 'Dismiss' })
    .click();
  await expect(chips).toHaveCount(1);

  // Use fills in the generate request; the shop lands in the import preview.
  await shop.getByRole('button', { name: 'Use' }).click();
  await expect(codm.getByLabel('Generate')).toHaveValue('shop');
  await expect(codm.getByLabel('What the table needs')).toHaveValue(
    'An herbalist the party can reach before the canyon',
  );
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await expect(imp).toContainText('Sap & Sinew, herbalist');

  // Chips, quotes and the transcript never reach the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist');
    expect(f).not.toContain('Pale hunters');
  }
  await gmContext.close();
  await page.close();
});
