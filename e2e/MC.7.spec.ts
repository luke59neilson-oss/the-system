import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.7 (DESIGN §11 "Practice drafts"): the co-DM drafts practice from the
// transcript into the GM's review; nothing counts until the GM confirms.
// The fake mic plays the synthesized table-talk WAV; the fake recognizer
// "hears" the herbalist line (talk) and "Jake nocks an arrow and waits." (a
// use); the test-only fake fast model drafts the use (e2ePracticeDrafts).

const GM_KEY = 'e2e-gm-key-mc7-0123456789abcdef07';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.7');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc7-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('the co-DM drafts practice from the transcript and the GM confirms one', async ({
  browser,
}) => {
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
    data: { key: 'sk-ant-e2e-mc7-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await gm.getByRole('button', { name: 'Start session 1' }).click();

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

  // MC.7 review M5: drafts wait in the Practice window's review queue.
  const practice = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  const win = practice.getByRole('group', { name: /Co-DM drafts/ });
  await expect(practice.getByRole('heading', { name: /To review/ })).toBeVisible();
  await expect(win.getByRole('heading', { name: 'Co-DM drafts (0)' })).toBeVisible();
  await expect(win).toContainText('No drafts waiting.');
  await win.getByRole('button', { name: 'Draft from transcript' }).click();
  await expect(win.getByTestId('drafts-message')).toContainText(/Read \d+ lines: 1 new draft$/);
  const list = win.getByRole('list', { name: 'Practice drafts' });
  const item = list.getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Jake');
  await expect(item).toContainText('Nocks an arrow and waits for the shot');
  await expect(item).toContainText('named in the line');
  // MC.7 review M4: the draft keeps the session it was heard in.
  await expect(item).toContainText('session 1');
  await expect(win.getByRole('heading', { name: 'Co-DM drafts (1)' })).toBeVisible();
  await expect(item).toContainText('“Jake nocks an arrow and waits.”');
  // The herbalist line is talk, not a use: no draft for it.
  await expect(list).not.toContainText('herbalist');
  // Nothing counts yet: the player sees no new practice.
  await expect(page.getByText('Nocks an arrow and waits for the shot')).toHaveCount(0);
  await win.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-practice-drafts-1366x768.png') });
  await practice.getByRole('heading', { name: /To review/ }).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-review-queue-1366x768.png') });

  await item.getByRole('button', { name: 'Confirm' }).click();
  await expect(win.getByTestId('drafts-message')).toContainText('Logged: Jake [');
  await expect(win).toContainText('No drafts waiting.');
  // The confirmed use counts for session 1: the marks review offers its mark.
  await expect(
    gm
      .locator('section[aria-labelledby="marks-review-heading"]')
      .getByRole('button', { name: /^Confirm mark: Jake / }),
  ).not.toHaveCount(0);
  // Re-drafting reads no new lines, so the confirmed use is not drafted again.
  await win.getByRole('button', { name: 'Draft from transcript' }).click();
  await expect(win.getByTestId('drafts-message')).toHaveText('No new transcript lines to read');
  await expect(win).toContainText('No drafts waiting.');

  // Drafts and the transcript never reach the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist');
    expect(f).not.toContain('attributedBy');
  }
  await gmContext.close();
  await page.close();
});
