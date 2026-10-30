import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MD.1 (DESIGN §11 "Quick responses"): five fixed buttons, keys 1–5, answer
// the newest line (or a clicked or typed one) with one sayable line plus
// beats; Richer re-asks the strong model; settings rename, rewrite and
// reorder the five, and Reset restores them. The fake mic plays the
// synthesized table talk; the test-only fake model writes an answer that
// names the button, the line and the instruction it was given.

const GM_KEY = 'e2e-gm-key-md1-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MD.1');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-md1-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('quick responses answer a transcript line with keys 1–5', async ({ browser }) => {
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
    data: { key: 'sk-ant-e2e-md1-fake-0123456789abcdef' },
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

  const quick = gm.getByTestId('quick-responses');
  const row = quick.getByRole('group', { name: 'Quick responses' });
  await expect(row.getByRole('button')).toHaveText([
    '1 Yes, and…',
    '2 Yes, but…',
    '3 No, but…',
    '4 In character',
    '5 Twist',
  ]);
  // Nothing looks like a question, so the newest line heard is the target.
  // The fake mic loops two lines, so read which one came last.
  const herbalist = 'We should find an herbalist before the canyon.';
  const arrow = 'Jake nocks an arrow and waits.';
  await gm.waitForTimeout(1500);
  const lastHeard = (
    await listen.getByTestId('transcript').locator('li').last().innerText()
  ).includes('herbalist')
    ? herbalist
    : arrow;
  const other = lastHeard === herbalist ? arrow : herbalist;
  await expect(quick.getByTestId('quick-target')).toContainText(lastHeard, { timeout: 10_000 });

  // Key 1 (not in a field) presses Yes, and…; the answer sits under its quote.
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('1');
  const answer = quick.getByTestId('quick-answer');
  await expect(answer.getByTestId('quick-say')).toHaveText(`Yes, and… to "${lastHeard}"`);
  await expect(answer.locator('blockquote')).toHaveText(`“${lastHeard}”`);
  await expect(answer.locator('.quick-beats li')).toHaveCount(3);
  await quick.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-quick-answer-1366x768.png') });

  // Clicking a transcript line points the buttons at it; key 5 is Twist.
  await listen.getByRole('button', { name: other }).first().click();
  await expect(quick.getByTestId('quick-target')).toContainText(other);
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('5');
  await expect(answer.getByTestId('quick-say')).toHaveText(`Twist to "${other}"`);
  // Richer re-asks the strong model for the same line.
  await answer.getByRole('button', { name: 'Richer' }).click();
  await expect(answer.getByTestId('quick-say')).toHaveText(`(richer) Twist to "${other}"`);
  await expect(answer).toContainText('richer');

  // Keys typed into a field are text, not button presses.
  const typed = quick.getByLabel('The line to answer');
  await typed.fill('Can I bargain with the ferryman?');
  await typed.press('3');
  await expect(typed).toHaveValue('Can I bargain with the ferryman?3');
  await expect(answer.getByTestId('quick-say')).toContainText('(richer) Twist');
  await typed.fill('Can I bargain with the ferryman?');
  await row.getByRole('button', { name: '2 Yes, but…' }).click();
  await expect(answer.getByTestId('quick-say')).toHaveText(
    'Yes, but… to "Can I bargain with the ferryman?"',
  );

  // Settings: rename Twist and rewrite its instruction, move it up one; the
  // row and the prompt follow. Reset brings the defaults back.
  const settings = gm.locator('form[aria-labelledby="quick-settings-heading"]');
  await settings.getByLabel('Button 5 name').fill('Chaos');
  await settings.getByLabel('Button 5 instruction').fill('Set something on fire.');
  await settings.getByRole('button', { name: 'Move Chaos up' }).click();
  await settings.getByRole('button', { name: 'Save quick responses' }).click();
  await expect(settings.getByRole('status')).toHaveText(
    'Quick responses saved: the buttons use them now',
  );
  await settings.getByRole('heading').evaluate((h) => h.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-quick-settings-1366x768.png') });
  await expect(row.getByRole('button').nth(3)).toHaveText('4 Chaos', { timeout: 10_000 });
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('4');
  await expect(answer.getByTestId('quick-say')).toHaveText(
    'Chaos to "Can I bargain with the ferryman?"',
  );
  await expect(answer.locator('.quick-beats')).toContainText('Instruction: Set something on fire.');
  await settings.getByRole('button', { name: 'Reset' }).click();
  await expect(settings.getByLabel('Button 4 name')).toHaveValue('In character');
  await expect(settings.getByLabel('Button 5 name')).toHaveValue('Twist');
  await expect(row.getByRole('button').nth(4)).toHaveText('5 Twist', { timeout: 10_000 });

  // The spend counter counted the five quick calls (suggestions may add more).
  await expect(gm.getByTestId('codm-panel-spend')).toHaveText(/· ([5-9]|\d\d+) calls$/u);

  // Answers, quotes and the transcript never reach the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist');
    expect(f).not.toContain('ferryman');
    expect(f).not.toContain('Chaos');
    expect(f).not.toContain('pale glow');
  }
  await gmContext.close();
  await page.close();
});
