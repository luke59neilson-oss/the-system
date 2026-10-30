import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MC.6 (DESIGN §11 "Who said what"): the GM enrols each player's voice on the
// laptop's mic, transcript lines carry a name on a confident match, and a
// deleted enrolment stops labelling. The fake mic plays the repo's synthesized
// table-talk recording on a loop (enrolment refuses a silent sample, D241);
// it is the same audio for everyone, so the test-only fake embedder scripts
// the voices (e2eFakeSpeakers): Jake says the herbalist line, Miranda the
// arrow line.

const GM_KEY = 'e2e-gm-key-mc6-0123456789abcdef06';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MC.6');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mc6-'));
});

test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('the GM enrols two voices, lines get names, and a deleted voice stops labelling', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { dataDir });
  const gmContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await gmContext.grantPermissions(['microphone']);
  const gm = await gmContext.newPage();
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Miranda']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  await openTab(gm, 'session');
  const panel = gm.locator('section[aria-labelledby="listen-heading"]');
  const voices = panel.getByTestId('voices');
  for (const name of ['Jake', 'Miranda']) {
    await voices.getByRole('button', { name: `Enrol ${name}` }).click();
    await expect(voices.getByTestId('voices-message')).toHaveText(
      `Voice sample saved for ${name}`,
      { timeout: 15_000 },
    );
  }
  await expect(voices.getByRole('button', { name: "Delete Jake's voice" })).toBeVisible();
  await expect(voices.getByRole('button', { name: "Delete Miranda's voice" })).toBeVisible();
  // Only voice prints are kept, in the campaign's speakers folder.
  const speakersDir = path.join(dataDir, 'campaigns', 'main', 'speakers');
  expect(readdirSync(speakersDir)).toEqual(['speakers.json']);
  const saved = JSON.parse(readFileSync(path.join(speakersDir, 'speakers.json'), 'utf8')) as {
    enrolments: { name: string; embedding: number[] }[];
  };
  expect(saved.enrolments.map((e) => e.name)).toEqual(['Jake', 'Miranda']);

  await panel.getByRole('button', { name: 'Start listening' }).click();
  // Recording is off while the table is being transcribed.
  await expect(voices.getByRole('button', { name: 'Re-record Jake' })).toBeDisabled();
  const transcript = panel.getByTestId('transcript');
  await expect(transcript).toContainText('Jake: We should find an herbalist before the canyon.', {
    timeout: 20_000,
  });
  await expect(transcript).toContainText('Miranda: Jake nocks an arrow and waits.', {
    timeout: 20_000,
  });
  await panel.getByRole('button', { name: 'Stop listening' }).click();
  await expect(panel.getByTestId('listen-indicator')).toHaveText('Mic off');
  await voices.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-voices-1366x768.png') });

  // Deleting Jake's voice: his next lines carry no name; Miranda's still do.
  await voices.getByRole('button', { name: "Delete Jake's voice" }).click();
  await expect(voices.getByTestId('voices-message')).toHaveText('Voice sample deleted for Jake');
  await expect(voices.getByRole('listitem').filter({ hasText: 'Jake' })).toContainText(
    'No voice sample',
  );
  await expect(voices.getByRole('button', { name: "Delete Jake's voice" })).toHaveCount(0);
  await expect(voices.getByRole('button', { name: 'Enrol Jake' })).toBeEnabled();
  const before = await transcript.locator('li').count();
  await panel.getByRole('button', { name: 'Start listening' }).click();
  const unlabelled = transcript
    .locator('li')
    .filter({ hasText: /^\d\d:\d\d:\d\d We should find an herbalist/ });
  // The arrow line may come first.
  await expect(unlabelled.first()).toBeVisible({ timeout: 45_000 });
  await panel.getByRole('button', { name: 'Stop listening' }).click();
  expect(await transcript.locator('li').count()).toBeGreaterThan(before);
  const after = JSON.parse(readFileSync(path.join(speakersDir, 'speakers.json'), 'utf8')) as {
    enrolments: { name: string }[];
  };
  expect(after.enrolments.map((e) => e.name)).toEqual(['Miranda']);

  // Nothing about voices or the transcript reached the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist');
    expect(f).not.toContain('embedding');
  }
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dataDir);
  expect(files.filter((f) => /\.(wav|pcm|raw|webm|ogg|mp3|flac)$/i.test(f))).toEqual([]);
  await gmContext.close();
  await page.close();
});
