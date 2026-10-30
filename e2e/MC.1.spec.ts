import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.1 (DESIGN §11): the co-DM settings panel without a real key. The
// terminal server has no OS encryption, so it says it cannot store a key;
// the models can be set, the connection test waits for a key, and the
// session spend starts at zero. Nothing co-DM reaches a player's browser.

const GM_KEY = 'e2e-gm-key-mc1-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.1');
let server: RunningServer;

test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
});

test.afterEach(async () => {
  await server.stop();
});

test('co-DM settings without a key: models, spend, and nothing to players', async ({ browser }) => {
  test.setTimeout(90_000);
  server = await startBuiltServer({ GM_KEY });
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  const bodies: string[] = [];
  page.on('response', (r) => {
    // Data only: the shared app bundle holds the GM panel's code and placeholder.
    if (!new URL(r.url()).pathname.startsWith('/api/')) return;
    void r
      .text()
      .then((t) => bodies.push(t))
      .catch(() => undefined);
  });
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  await openTab(gm, 'library');
  const win = gm.locator('section[aria-labelledby="codm-settings"]');
  await win.scrollIntoViewIfNeeded();
  await expect(win.getByTestId('codm-key-state')).toContainText('No API key yet');
  await expect(win.getByText('This copy cannot store a key safely')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Test connection' })).toBeDisabled();
  await expect(win.getByTestId('codm-spend')).toHaveText('This session: $0.000 · 0 calls');

  const fast = win.getByLabel('Fast model (suggestions, notes, drafts)');
  const strong = win.getByLabel('Strong model (generation)');
  await expect(fast).toHaveValue('claude-haiku-4-5');
  await expect(strong).toHaveValue('claude-sonnet-4-5');
  await strong.fill('not a model id');
  await win.getByRole('button', { name: 'Save models' }).click();
  await expect(win.getByRole('status')).toContainText('letters, digits');
  await strong.fill('claude-opus-4-1');
  await win.getByRole('button', { name: 'Save models' }).click();
  await expect(win.getByRole('status')).toHaveText('Models saved');
  await win.screenshot({ path: path.join(shots, 'gm-codm-settings-1366x768.png') });

  // The setting survives a reload (stored beside the campaigns, not in one).
  await gm.reload();
  await expect(
    gm.locator('section[aria-labelledby="codm-settings"]').getByLabel('Strong model (generation)'),
  ).toHaveValue('claude-opus-4-1');

  // Players get nothing co-DM: no route answers them, no frame mentions it.
  const denied = await page.request.get(`${server.url}/api/gm/ai`);
  expect(denied.status()).toBe(403);
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  for (const text of [...frames, ...bodies]) {
    expect(text).not.toContain('claude-opus-4-1');
    expect(text).not.toContain('sk-ant');
  }
});

// Round 2 (M2): the key-saved path, on the terminal server with the test-only
// fake cipher and AI client (THE_SYSTEM_E2E_FAKE_AI=1, apps/server/src/ai/
// e2eFake.ts). Save, test the connection, see the spend, reload, remove; the
// key never reaches a player and is never written verbatim.
test('co-DM key saved: save, test connection, spend, remove', async ({ browser }) => {
  test.setTimeout(90_000);
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc1-'));
  const KEY = 'sk-ant-e2e-mc1-fake-0123456789abcdef';
  try {
    server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { dataDir });
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Whale');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    const create = gm.locator('form[aria-labelledby="new-character"]');
    await create.getByLabel('Name', { exact: true }).fill('Jake');
    await create.getByRole('button', { name: 'Create character' }).click();

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    const bodies: string[] = [];
    page.on('response', (r) => {
      if (!new URL(r.url()).pathname.startsWith('/api/')) return;
      void r
        .text()
        .then((t) => bodies.push(t))
        .catch(() => undefined);
    });
    await page.goto(server.url);
    await page.getByRole('link', { name: /Jake/ }).click();
    await expect(page.getByTestId('connection')).toHaveText('Connected');

    await openTab(gm, 'library');
    const panel = () => gm.locator('section[aria-labelledby="codm-settings"]');
    const win = panel();
    await win.scrollIntoViewIfNeeded();
    await expect(win.getByTestId('codm-key-state')).toContainText('No API key yet');
    const test = win.getByRole('button', { name: 'Test connection' });
    await expect(test).toBeDisabled();

    // A key of the wrong shape is refused with a clear message, nothing saved.
    await win.getByLabel('Anthropic API key').fill('not-a-key');
    await win.getByRole('button', { name: 'Save key' }).click();
    await expect(win.getByRole('status')).toContainText('does not look like an Anthropic API key');
    await expect(win.getByTestId('codm-key-state')).toContainText('No API key yet');

    await win.getByLabel('Anthropic API key').fill(KEY);
    await win.getByRole('button', { name: 'Save key' }).click();
    await expect(win.getByRole('status')).toHaveText('Key saved (encrypted on this laptop)');
    await expect(win.getByTestId('codm-key-state')).toHaveText('API key: saved on this laptop');
    // The field is cleared and offers a replacement; the key is never shown again.
    await expect(win.getByLabel('Replace API key')).toHaveValue('');
    expect(await gm.content()).not.toContain(KEY);
    expect(readFileSync(path.join(dataDir, 'co-dm', 'anthropic-key.bin'), 'utf8')).not.toContain(
      KEY,
    );

    await expect(test).toBeEnabled();
    await test.click();
    await expect(win.getByRole('status')).toHaveText('Connected (claude-haiku-4-5)');
    await expect(win.getByTestId('codm-spend')).toHaveText('This session: $0.001 · 1 call');
    await win.screenshot({ path: path.join(shots, 'gm-codm-key-saved-1366x768.png') });

    // The saved key survives a reload; the spend for this server run too.
    await gm.reload();
    await expect(panel().getByTestId('codm-key-state')).toHaveText('API key: saved on this laptop');
    await expect(panel().getByTestId('codm-spend')).toHaveText('This session: $0.001 · 1 call');

    await panel().getByRole('button', { name: 'Remove key' }).click();
    await expect(panel().getByRole('status')).toHaveText('Key removed');
    await expect(panel().getByTestId('codm-key-state')).toContainText('No API key yet');
    await expect(panel().getByRole('button', { name: 'Test connection' })).toBeDisabled();
    await expect(panel().getByRole('button', { name: 'Remove key' })).toHaveCount(0);

    // Nothing of it reached the player.
    await page.reload();
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    for (const text of [...frames, ...bodies]) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain('sk-ant');
    }
  } finally {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
