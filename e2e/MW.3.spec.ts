import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MW.3 (DESIGN §11 "Story ideas"): importing a sample export, the board, the
// co-DM naming the idea it used, approval marking it used (undoable), and the
// ideas staying out of everything a player's browser receives.

const GM_KEY = 'e2e-gm-key-mw3-0123456789abcdef0003';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MW.3');
const CANARY = 'IDEACANARY';
let server: RunningServer;

const sample = {
  format: 'the-system-ideas',
  version: 1,
  exported: '2026-11-01T00:00:00Z',
  ideas: [
    {
      id: 'phone-1',
      text: `${CANARY} A herbalist who sells memories`,
      kind: 'place',
      tags: ['herbalist'],
      source: 'a walk',
      created: '2026-10-30T10:00:00Z',
      used: false,
    },
    {
      id: 'phone-2',
      text: `${CANARY} The ferryman owes everyone`,
      kind: 'npc',
      tags: ['ferryman'],
      source: '',
      created: '2026-10-30T11:00:00Z',
      used: false,
    },
  ],
};
const asFile = (name: string, body: unknown) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(body)),
});

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' });
});

test.afterEach(async () => {
  await server.stop();
});

test('import a sample file; the co-DM uses an idea; approving marks it used', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mw3-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'ideas');
  const board = gm.locator('section[aria-labelledby="ideas-heading"]');
  await expect(board.getByText('No ideas yet.')).toBeVisible();

  // A file that is not an export says so and changes nothing.
  await board.getByText('Import ideas').click();
  const fileInput = board.getByLabel('Export file from your ideas page (.json)');
  await fileInput.setInputFiles(asFile('wrong.json', { format: 'the-system-content' }));
  await expect(board.getByRole('alert')).toHaveText(
    'This is not an ideas export file. Nothing was imported.',
  );
  await fileInput.setInputFiles(asFile('newer.json', { ...sample, version: 2 }));
  await expect(board.getByRole('alert')).toContainText('version 2');

  // The sample previews, then imports.
  await fileInput.setInputFiles(asFile('ideas.json', sample));
  await expect(board.getByTestId('ideas-preview')).toContainText('2 new');
  await gm.screenshot({ path: path.join(shots, 'import-preview-1366x768.png') });
  await board.getByRole('button', { name: 'Import 2' }).click();
  await expect(board.getByRole('status')).toHaveText('Imported 2 ideas');
  await expect(board.getByTestId('idea-row')).toHaveCount(2);

  // Importing it again skips both; pasted text splits on blank lines.
  await fileInput.setInputFiles(asFile('ideas.json', sample));
  await expect(board.getByTestId('ideas-preview')).toContainText(
    '0 new, 2 already on the board (skipped)',
  );
  await expect(board.getByRole('button', { name: 'Import 0' })).toBeDisabled();
  await board.getByRole('button', { name: 'Cancel' }).click();
  await board
    .getByLabel('Or paste text (one idea per paragraph)')
    .fill(`${CANARY} First pasted\n\n${CANARY} Second pasted`);
  await board.getByRole('button', { name: 'Preview pasted text' }).click();
  await board.getByRole('button', { name: 'Import 2' }).click();
  await expect(board.getByTestId('idea-row')).toHaveCount(4);

  // Add, edit, pin, search.
  await board.getByRole('textbox', { name: 'Idea', exact: true }).fill(`${CANARY} Typed by hand`);
  await board.getByLabel('Tags (commas between)').fill('moon, sky');
  await board.getByRole('button', { name: 'Add idea' }).click();
  await expect(board.getByTestId('idea-row')).toHaveCount(5);
  const typed = board.getByTestId('idea-row').filter({ hasText: 'Typed by hand' });
  await typed.getByRole('button', { name: 'Pin' }).click();
  await expect(board.getByTestId('idea-row').first()).toContainText('Pinned: ');
  await typed.getByRole('button', { name: 'Edit' }).click();
  await board
    .getByRole('textbox', { name: 'Idea', exact: true })
    .fill(`${CANARY} Typed and edited`);
  await board.getByRole('button', { name: 'Save idea' }).click();
  await expect(board.getByTestId('idea-row').first()).toContainText('Typed and edited');
  await board.getByLabel('Search ideas').fill('sky');
  await expect(board.getByTestId('idea-row')).toHaveCount(1);
  await board.getByLabel('Search ideas').fill('');
  await board.getByTestId('idea-row').last().scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'ideas-board-1366x768.png') });

  // A generation offered the herbalist idea names it; approving marks it used.
  await openTab(gm, 'session');
  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const imp = gm.locator('section[aria-labelledby="import-heading"]');
  await codm.getByLabel('Generate').selectOption('shop');
  await codm.getByLabel('What the table needs').fill('An herbalist in the Crown camp');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(imp.getByTestId('import-idea')).toContainText('Uses your idea:');
  await gm.screenshot({ path: path.join(shots, 'generation-names-idea-1366x768.png') });
  await imp.getByRole('button', { name: /^Apply/ }).click();
  const used = imp.getByTestId('import-idea-used');
  await expect(used).toContainText('Idea marked used:');
  const usedText = (await used.innerText())
    .replace(/^Idea marked used: /u, '')
    .replace(/\s*Undo$/u, '');

  await openWindow(gm, 'ideas');
  await expect(board.getByLabel('Show used (1)')).toBeVisible();
  await expect(board.getByTestId('idea-row')).toHaveCount(4);

  // Undo puts it back.
  await openTab(gm, 'session');
  await used.getByRole('button', { name: 'Undo' }).click();
  await expect(used).toHaveCount(0);
  await openWindow(gm, 'ideas');
  await expect(board.getByLabel('Show used (0)')).toBeVisible();
  await expect(board.getByTestId('idea-row').filter({ hasText: usedText })).toHaveCount(1);

  // A kept quick response marks the idea it used.
  await openTab(gm, 'session');
  const quick = codm.getByTestId('quick-responses');
  await quick.getByLabel('The line to answer').fill('Can I talk the ferryman down?');
  await quick.getByRole('button', { name: /In character/ }).click();
  const answer = quick.getByTestId('quick-answer');
  await expect(answer.getByTestId('quick-idea')).toContainText('Uses your idea:');
  await expect(answer.getByTestId('quick-say')).not.toContainText('IDEA:');
  await answer.getByRole('button', { name: 'Keep' }).click();
  await answer.getByRole('button', { name: 'Save lore' }).click();
  await expect(answer.getByRole('status')).toHaveText('Kept as lore (GM only)');
  await openWindow(gm, 'ideas');
  await expect(board.getByLabel('Show used (1)')).toBeVisible();

  // Nothing of any of it reached the player's browser.
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.join('\n')).not.toContain(CANARY);
  await expect(page.locator('body')).not.toContainText(CANARY);
});
