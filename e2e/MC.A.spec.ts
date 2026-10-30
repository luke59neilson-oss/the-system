import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.A (DESIGN §11): a recorded mock session runs the co-DM end to end. The
// fake mic plays the synthesized table-talk WAV and the test-only fake AI
// answers every prompt: transcript → a suggestion chip → a shop generated
// behind a loading screen and approved (the screen clears) → a practice
// draft confirmed → End session → the summary in the session export. No
// co-DM text ever reaches the player.

const GM_KEY = 'e2e-gm-key-mca-0123456789abcdef0a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.A');
const localChromium = '/opt/pw-browsers/chromium';
const speech = path.resolve(
  import.meta.dirname,
  '../apps/server/test/fixtures/speech/table-talk.wav',
);
const LOADING = '[System] [The System is constructing the area…]';
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mca-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('a mock session runs the co-DM end to end', async ({ browser }) => {
  test.setTimeout(180_000);
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
    data: { key: 'sk-ant-e2e-mca-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await gm.getByRole('button', { name: 'Start session 1' }).click();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const banners = page.getByTestId('broadcast-banner');

  // 1. Transcript from the recorded table talk.
  const listen = gm.locator('section[aria-labelledby="listen-heading"]');
  await listen.getByRole('button', { name: 'Start listening' }).click();
  await expect(listen.getByTestId('transcript')).toContainText('Jake nocks an arrow and waits.', {
    timeout: 30_000,
  });
  await listen.getByRole('button', { name: 'Stop listening' }).click();
  await expect(listen.getByTestId('listen-indicator')).toHaveText('Mic off');

  // 2. A chip from what the table said.
  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const suggestions = codm.getByTestId('suggestions');
  await suggestions.getByRole('button', { name: 'Suggest now' }).click();
  const shop = suggestions.getByTestId('chip').filter({ hasText: 'Generate: Herbalist shop' });
  await expect(shop).toContainText('“We should find an herbalist before the canyon.”');
  // Since MD.2 the chip itself is the button (keys 6–0), not a Use button.
  await shop.getByRole('button', { name: /Generate: Herbalist shop/ }).click();

  // 3. The shop generates behind a loading screen; approving clears it.
  await codm.getByLabel('Show players a loading screen while the co-DM works').check();
  await expect(codm.getByLabel('Clear it when I approve the content')).toBeChecked();
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(banners).toHaveText([LOADING]);
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await expect(imp).toContainText('Sap & Sinew, herbalist');
  await page.screenshot({ path: path.join(shots, 'player-loading-screen-390x844.png') });
  await imp.getByRole('button', { name: /^Apply \d+$/ }).click();
  await expect(imp.getByRole('status')).toHaveText(/^Applied \d+ entries$/);
  await expect(banners).toHaveCount(0);
  const panelSpend = codm.getByTestId('codm-panel-spend');
  await expect(panelSpend).toContainText('call');
  const afterShop = (await panelSpend.textContent()) ?? '';

  // 4. A practice draft from the transcript, confirmed by the GM.
  const practice = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  const win = practice.getByRole('group', { name: /Co-DM drafts/ });
  await win.getByRole('button', { name: 'Draft from transcript' }).click();
  const item = win.getByRole('list', { name: 'Practice drafts' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Nocks an arrow and waits for the shot');
  await item.getByRole('button', { name: 'Confirm' }).click();
  await expect(win.getByTestId('drafts-message')).toContainText('Logged: Jake [');
  // Review M1: the practice draft was a paid call made outside the panel; the
  // counter catches up on its own (SPEND_POLL_MS) without a button.
  await expect(panelSpend).not.toHaveText(afterShop, { timeout: 30_000 });

  // 5. End the session; the summary lands in the session log and export.
  const session = gm.locator('section[aria-labelledby="session-heading"]');
  await session.getByRole('button', { name: 'End session…' }).click();
  await session.getByRole('button', { name: 'End session 1' }).click();
  await expect(session.getByRole('button', { name: 'Start session 2' })).toBeVisible();
  const notes = gm.getByTestId('session-notes');
  await notes.locator('summary').click();
  await notes.getByRole('button', { name: 'Summarise session' }).click();
  await expect(notes.getByTestId('session-summary')).toContainText(
    'The party looked for a herbalist',
  );
  await notes.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-session-summary-1366x768.png') });
  const file = path.join(dataDir, 'exports', 'main', 'session-01');
  await expect
    .poll(() => (existsSync(`${file}.md`) ? readFileSync(`${file}.md`, 'utf8') : ''))
    .toContain('## Co-DM summary');
  const md = readFileSync(`${file}.md`, 'utf8');
  expect(md).toContain('Nocks an arrow and waits for the shot');

  // The player saw the loading screen, never the transcript, chips, drafts,
  // notes or summary.
  for (const f of frames) {
    expect(f).not.toContain('find an herbalist');
    expect(f).not.toContain('Co-DM');
    expect(f).not.toContain('The party looked for a herbalist');
  }
  await gmContext.close();
  await page.close();
});
