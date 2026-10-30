import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MD.2 (DESIGN §11 "Slots 6–10"): the co-DM's picks sit in a fixed row of
// five under the quick responses, keys 6–9 and 0. A new chip fills only an
// empty or dismissed slot, never reshuffling the others; extras wait under
// More. The fake mic plays the table talk; the test-only fast model offers
// six chips for it (three per line), so five fill the row and one waits.

const GM_KEY = 'e2e-gm-key-md2-0123456789abcdef02';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MD.2');
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-md2-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('the co-DM row: five stable slots on keys 6–0, extras under More', async ({ browser }) => {
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
  const suggestions = codm.getByTestId('suggestions');
  const row = suggestions.getByRole('list', { name: 'Co-DM picks' });
  const slots = row.locator(':scope > li');
  // Before any talk: five empty slots with their keys.
  await expect(slots).toHaveCount(5);
  await expect(row.getByTestId('pick-empty')).toHaveText([
    '6 empty',
    '7 empty',
    '8 empty',
    '9 empty',
    '0 empty',
  ]);

  const listen = gm.locator('section[aria-labelledby="listen-heading"]');
  await listen.getByRole('button', { name: 'Start listening' }).click();
  await expect(listen.getByTestId('transcript')).toContainText('Jake nocks an arrow and waits.', {
    timeout: 30_000,
  });
  await listen.getByRole('button', { name: 'Stop listening' }).click();
  await expect(listen.getByTestId('listen-indicator')).toHaveText('Mic off');
  // The key goes in once both lines are heard, so the first call reads both.
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-md2-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await suggestions.getByRole('button', { name: 'Suggest now' }).click();

  // Five slots filled, in key order 6, 7, 8, 9, 0; the sixth chip waits.
  await expect(row.getByTestId('chip')).toHaveCount(5);
  const keys = await slots.evaluateAll((els) => els.map((e) => e.getAttribute('data-slot')));
  expect(keys).toEqual(['6', '7', '8', '9', '0']);
  const slotTitles = async () =>
    (await row.locator(':scope > li > button[aria-keyshortcuts]').allInnerTexts()).map((t) =>
      t.replace(/^\d\s*/u, ''),
    );
  const before = await slotTitles();
  expect(before).toHaveLength(5);
  const more = suggestions.getByTestId('pick-more');
  await expect(more.locator('summary')).toHaveText('More (1)');
  await more.locator('summary').click();
  const waiting = (await more.getByTestId('chip').getByRole('button').first().innerText()).trim();
  expect(before).not.toContain(waiting);
  expect([...before, waiting].sort()).toEqual(
    [
      'Callback: The first scar',
      'Complication: Pale hunters close in',
      'Generate: A lost arrowhead',
      'Generate: A rival herbalist',
      'Generate: Bitterroot salve',
      'Generate: Herbalist shop',
    ].sort(),
  );
  await suggestions.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-picks-row-1366x768.png') });

  // Each key 6–0 uses the chip in its slot: it fills in the generate request.
  const kind = codm.getByLabel('Generate');
  const needs = codm.getByLabel('What the table needs');
  const requests: Record<string, string> = {
    'Generate: Herbalist shop': 'An herbalist the party can reach before the canyon',
    'Generate: A rival herbalist': 'A rival herbalist who undercuts the first',
    'Generate: Bitterroot salve': 'A cheap salve that stings',
    'Complication: Pale hunters close in': 'Pale hunters notice the drawn bow',
    'Callback: The first scar': 'The canyon scar where they woke',
    'Generate: A lost arrowhead': 'An old arrowhead that is not theirs',
  };
  const kinds: Record<string, string> = {
    'Generate: Herbalist shop': 'shop',
    'Generate: A rival herbalist': 'npc',
    'Generate: Bitterroot salve': 'item',
    'Complication: Pale hunters close in': 'encounter',
    'Callback: The first scar': 'place',
    'Generate: A lost arrowhead': 'questHook',
  };
  for (const [i, key] of ['6', '7', '8', '9', '0'].entries()) {
    await gm.locator('body').click({ position: { x: 5, y: 5 } });
    await gm.keyboard.press(key);
    const title = before[i]!;
    await expect(needs).toHaveValue(requests[title]!);
    await expect(kind).toHaveValue(kinds[title]!);
  }
  // A key typed into a field is text, not a pick.
  await needs.fill('');
  await needs.press('6');
  await expect(needs).toHaveValue('6');

  // Dismissing slot 7 refills it from More; no other slot moves.
  await row
    .locator(':scope > li[data-slot="7"]')
    .getByRole('button', { name: /^Dismiss / })
    .click();
  await expect(more).toHaveCount(0);
  const after = await slotTitles();
  expect(after).toEqual([before[0], waiting, before[2], before[3], before[4]]);
  // Dismissing slot 9 leaves it empty (nothing waiting); the rest stay.
  await row
    .locator(':scope > li[data-slot="9"]')
    .getByRole('button', { name: /^Dismiss / })
    .click();
  await expect(row.getByTestId('pick-empty')).toHaveText(['9 empty']);
  expect(await slotTitles()).toEqual([before[0], waiting, before[2], before[4]]);
  await gm.locator('body').click({ position: { x: 5, y: 5 } });
  await gm.keyboard.press('9');
  await expect(suggestions.getByRole('status')).toHaveText(
    'Slot 9 is empty: the co-DM fills it from the table talk',
  );
  // Keys 1–5 still belong to the quick responses.
  await gm.keyboard.press('1');
  await expect(codm.getByTestId('quick-answer')).toBeVisible();
  await expect(codm.getByTestId('quick-answer')).not.toContainText('writing…');
  await suggestions.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-picks-dismissed-1366x768.png') });

  // Chips, quotes and the transcript never reach the player.
  for (const f of frames) {
    expect(f).not.toContain('herbalist');
    expect(f).not.toContain('Pale hunters');
    expect(f).not.toContain('arrowhead');
  }
  await gmContext.close();
  await page.close();
});
