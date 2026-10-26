import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.5 (DESIGN §11 "Listening"): the GM turns the mic on; Chromium's fake
// mic (a periodic beep) stands in for the table and the test-only fake
// recognizer "hears" scripted lines. The transcript is GM-only and text-only;
// players see "[The System is listening]" while it is on.

const GM_KEY = 'e2e-gm-key-mc5-0123456789abcdef05';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.5');
const localChromium = '/opt/pw-browsers/chromium';
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});
let server: RunningServer | null = null;
let dataDir: string;
const start = async (env: Record<string, string> = {}) => {
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1', ...env }, { dataDir });
  return server;
};

test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc5-'));
});

test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('the GM listens: a GM-only transcript, and players see the listening mark', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const server = await start();
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
  await expect(page.getByTestId('listening')).toHaveCount(0);

  const panel = gm.locator('section[aria-labelledby="listen-heading"]');
  await expect(panel.getByTestId('listen-indicator')).toHaveText('Mic off');
  await panel.getByRole('button', { name: 'Start listening' }).click();
  await expect(panel.getByTestId('listen-indicator')).toHaveText(
    '● Mic on: the System is listening',
  );
  await expect(page.getByTestId('listening')).toHaveText('[The System is listening]');
  const transcript = panel.getByTestId('transcript');
  await expect(transcript).toContainText('We should find an herbalist before the canyon.', {
    timeout: 20_000,
  });
  await panel.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-listening-1366x768.png') });
  await page.screenshot({ path: path.join(shots, 'player-listening-390x844.png') });

  await panel.getByRole('button', { name: 'Stop listening' }).click();
  await expect(panel.getByTestId('listen-indicator')).toHaveText('Mic off');
  await expect(page.getByTestId('listening')).toHaveCount(0);

  // The transcript never reached the player.
  for (const f of frames) expect(f).not.toContain('herbalist before the canyon');
  // Only text files in the transcripts folder: no audio is kept.
  const dir = dataDir;
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const transcripts = files.filter((f) => f.includes(`${path.sep}transcripts${path.sep}`));
  expect(transcripts.length).toBe(1);
  expect(transcripts[0]).toMatch(/session-00\.jsonl$/);
  expect(readFileSync(transcripts[0]!, 'utf8')).toContain('herbalist');
  expect(files.filter((f) => /\.(wav|pcm|raw|webm|ogg|mp3|flac)$/i.test(f))).toEqual([]);
  await gmContext.close();
  await page.close();
});

test('first use: the GM downloads the speech model, then listens', async ({ browser }) => {
  test.setTimeout(90_000);
  // A tiny stand-in archive with the real layout; the server checks it and
  // keeps only the model files in <data>/models (D236).
  const archive = path.resolve(
    import.meta.dirname,
    '../apps/server/test/fixtures/speech/fake-model.tar.bz2',
  );
  const server = await start({ THE_SYSTEM_E2E_SPEECH_ARCHIVE: archive });
  const gmContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await gmContext.grantPermissions(['microphone']);
  const gm = await gmContext.newPage();
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  const panel = gm.locator('section[aria-labelledby="listen-heading"]');
  const offer = panel.getByTestId('speech-model');
  await expect(offer).toContainText('Listening needs a speech model on this laptop');
  await expect(panel.getByRole('button', { name: 'Start listening' })).toBeDisabled();
  await panel.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-model-offer-1366x768.png') });

  await offer.getByRole('button', { name: /Download speech model/ }).click();
  await expect(panel.getByRole('button', { name: 'Start listening' })).toBeEnabled({
    timeout: 15_000,
  });
  await expect(panel.getByTestId('speech-model')).toHaveCount(0);
  expect(readdirSync(path.join(dataDir, 'models', 'whisper-tiny.en')).sort()).toEqual([
    'tiny.en-decoder.int8.onnx',
    'tiny.en-encoder.int8.onnx',
    'tiny.en-tokens.txt',
  ]);
  await panel.getByRole('button', { name: 'Start listening' }).click();
  await expect(panel.getByTestId('transcript')).toContainText('We should find an herbalist', {
    timeout: 20_000,
  });
  await panel.getByRole('button', { name: 'Stop listening' }).click();
  await gmContext.close();
});
