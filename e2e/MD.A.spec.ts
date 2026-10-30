import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MD.A (ROADMAP MD): a fixture session uses all ten quick-response slots and
// keeps a legend. The fake mic plays the table talk; the test-only model
// answers keys 1–5 and offers the chips for keys 6–0; Keep saves the In
// character answer as GM lore, and players never see it.

const GM_KEY = 'e2e-gm-key-mda-0123456789abcdef0a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MD.A');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mda-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('a fixture session uses all ten slots and keeps a legend', async ({ browser }) => {
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

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const listen = gm.locator('section[aria-labelledby="listen-heading"]');
  await listen.getByRole('button', { name: 'Start listening' }).click();
  await expect(listen.getByTestId('transcript')).toContainText('Jake nocks an arrow and waits.', {
    timeout: 30_000,
  });
  await listen.getByRole('button', { name: 'Stop listening' }).click();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mda-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  // Keys 1–5: the fixed quick responses answer the line the GM points at.
  const quick = codm.getByTestId('quick-responses');
  const target = 'Jake nocks an arrow and waits.';
  await listen.getByRole('button', { name: target }).first().click();
  await expect(quick.getByTestId('quick-target')).toContainText(target);
  const answer = quick.getByTestId('quick-answer');
  const names = ['Yes, and…', 'Yes, but…', 'No, but…', 'In character', 'Twist'];
  for (const [i, name] of names.entries()) {
    await gm.locator('body').click({ position: { x: 5, y: 5 } });
    await gm.keyboard.press(String(i + 1));
    await expect(answer.getByTestId('quick-say')).toHaveText(`${name} to "${target}"`);
  }

  // Keep the In character answer as a legend (edited first): GM lore.
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('4');
  await expect(answer.getByTestId('quick-say')).toHaveText(`In character to "${target}"`);
  await answer.getByRole('button', { name: 'Keep' }).click();
  const editor = answer.getByRole('form', { name: 'Keep as lore' });
  await editor
    .getByLabel('Lore to keep (edit before saving)')
    .fill('LEGEND-MDA The first archer of the Crown never missed twice.');
  await editor.getByRole('button', { name: 'Save lore' }).click();
  await expect(answer.getByRole('status')).toHaveText('Kept as lore (GM only)');
  const lore = codm.getByTestId('lore-view');
  await lore.locator('summary').click();
  await expect(lore.getByTestId('lore-note')).toContainText('never missed twice');

  // Keys 6–0: the co-DM's five picks, each filling the generate request.
  const suggestions = codm.getByTestId('suggestions');
  await suggestions.getByRole('button', { name: 'Suggest now' }).click();
  const row = suggestions.getByRole('list', { name: 'Co-DM picks' });
  await expect(row.getByTestId('chip')).toHaveCount(5);
  const needs = codm.getByLabel('What the table needs');
  const seen = new Set<string>();
  for (const key of ['6', '7', '8', '9', '0']) {
    await needs.fill('');
    await gm.locator('body').click({ position: { x: 5, y: 5 } });
    await gm.keyboard.press(key);
    await expect(needs).not.toHaveValue('');
    seen.add(await needs.inputValue());
  }
  expect(seen.size).toBe(5);
  await quick.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-ten-slots-1366x768.png') });
  await row.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-picks-6-0-1366x768.png') });

  // Review M1: while the GM views as a character, keys 1–0 do nothing (no
  // paid call, no hidden form filled).
  const quickPosts: string[] = [];
  gm.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/gm\/ai\/quick/u.test(r.url())) quickPosts.push(r.url());
  });
  await needs.fill('');
  const bar = gm.getByRole('navigation', { name: 'View as' });
  await bar.getByRole('button', { name: 'Jake' }).click();
  await gm.keyboard.press('2');
  await gm.keyboard.press('6');
  await gm.waitForTimeout(500);
  expect(quickPosts).toEqual([]);
  await bar.getByRole('button', { name: 'GM' }).click();
  await expect(needs).toHaveValue('');
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('2');
  await expect.poll(() => quickPosts.length).toBeGreaterThan(0);

  // Players never see the legend.
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) expect(f).not.toContain('LEGEND-MDA');
  await expect(page.locator('body')).not.toContainText('LEGEND-MDA');
});
