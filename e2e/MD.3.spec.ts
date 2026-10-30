import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MD.3 (DESIGN §11 "Keep"): Keep on a quick answer saves it, edited first, as
// a GM lore note; the Lore view lists it and edits it; players never see it.
// The test-only fake model writes the answer (no paid API, no mic needed:
// with listening off the GM types the line).

const GM_KEY = 'e2e-gm-key-md3-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MD.3');
const localChromium = '/opt/pw-browsers/chromium';
test.use({
  launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
});
let server: RunningServer | null = null;
let dataDir: string;

test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-md3-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('Keep saves a quick answer as GM lore; the Lore view lists and edits it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { dataDir });
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openTab(gm, 'session');
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-md3-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const quick = codm.getByTestId('quick-responses');
  const line = 'Can I talk the ferryman down?';
  await quick.getByLabel('The line to answer').fill(line);
  await quick.getByRole('button', { name: /In character/ }).click();
  const answer = quick.getByTestId('quick-answer');
  await expect(answer.getByTestId('quick-say')).toHaveText(`In character to "${line}"`);

  // Keep opens an editor with the line and its beats; the GM edits, then saves.
  await answer.getByRole('button', { name: 'Keep' }).click();
  const editor = answer.getByRole('form', { name: 'Keep as lore' });
  const text = editor.getByLabel('Lore to keep (edit before saving)');
  await expect(text).toHaveValue(new RegExp(`^In character to "${line.replace('?', '\\?')}"\\n- `));
  await text.fill('LORE-E2E The ferryman owes the Crown a toll.');
  await editor.getByRole('button', { name: 'Save lore' }).click();
  await expect(answer.getByRole('status')).toHaveText('Kept as lore (GM only)');

  // The Lore view lists it; the GM edits it there.
  const lore = codm.getByTestId('lore-view');
  await lore.locator('summary').click();
  await expect(lore.locator('summary')).toHaveText('Kept lore (1)');
  const note = lore.getByTestId('lore-note');
  await expect(note).toContainText('LORE-E2E The ferryman owes the Crown a toll.');
  await note.getByRole('button', { name: 'Edit' }).click();
  await note.getByLabel('Edit lore').fill('LORE-E2E The ferryman owes the Crown two tolls.');
  await note.getByRole('button', { name: 'Save' }).click();
  await expect(lore.getByRole('status')).toHaveText('Lore saved');
  await expect(note).toContainText('two tolls');
  // Review M3: the GM retitles it and tags it to an NPC and a place.
  await note.getByRole('button', { name: 'Edit' }).click();
  const edit = note.getByRole('form', { name: 'Edit kept lore' });
  await edit.getByLabel('Title').fill('The ferryman');
  await edit.getByLabel('NPC').fill('Old Tam');
  await edit.getByLabel('Place').fill('The Crown');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(lore.getByRole('status')).toHaveText('Lore saved');
  await expect(note.locator('strong')).toHaveText('The ferryman');
  await expect(note).toContainText('npc:Old Tam · place:The Crown');
  await lore.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-lore-view-1366x768.png') });

  // Keep on a generated item: its names and descriptions, tagged to an NPC.
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  const keepGen = codm.getByRole('button', { name: 'Keep as lore' });
  await keepGen.click();
  const genForm = codm.getByRole('form', { name: 'Keep generated as lore' });
  const genText = genForm.getByLabel('Lore to keep (edit before saving)');
  await expect(genText).toHaveValue(/Sap & Sinew/);
  await genText.fill(`LORE-E2E ${await genText.inputValue()}`);
  await genForm.getByRole('button', { name: 'Save lore' }).click();
  await expect(codm.getByText('Kept as lore (GM only)').last()).toBeVisible();
  await expect(lore.locator('summary')).toHaveText('Kept lore (2)');
  await expect(note.first()).toContainText('Sap & Sinew');

  // Review M3: the GM deletes a kept note (after confirming).
  gm.once('dialog', (d) => void d.accept());
  await lore
    .getByTestId('lore-note')
    .filter({ hasText: 'two tolls' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(lore.getByRole('status')).toHaveText('Lore deleted');
  await expect(lore.locator('summary')).toHaveText('Kept lore (1)');
  await expect(lore).not.toContainText('two tolls');

  // Players never see kept lore.
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) expect(f).not.toContain('LORE-E2E');
  await expect(page.locator('body')).not.toContainText('LORE-E2E');
});
