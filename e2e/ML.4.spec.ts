import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ML.4 (DESIGN §11, Q79, Q81): the quick-response setup is kept per campaign,
// and Share with the party makes a party copy of a kept lore note, which stays
// GM-only itself. The test-only fake model writes the answer (no paid API).

const GM_KEY = 'e2e-gm-key-ml4-0123456789abcdef0004';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ML.4');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { home: true });
});
test.afterEach(async () => {
  await server.stop();
});

async function newCampaign(gm: Page, name: string) {
  const form = gm.locator('form.home-new');
  await form.getByLabel('Campaign name').fill(name);
  await form.getByRole('button', { name: 'Create campaign' }).click();
  await expect(gm.getByTestId('close-campaign')).toBeVisible();
}

async function closeCampaign(gm: Page) {
  await gm.getByTestId('close-campaign').click();
  await expect(gm.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
}

test('each campaign keeps its own buttons; sharing lore makes a party copy', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await newCampaign(gm, 'Whale');
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-ml4-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await gm.reload();

  // Whale renames Twist.
  await openTab(gm, 'library');
  const settings = gm.locator('form[aria-labelledby="quick-settings-heading"]');
  await settings.getByLabel('Button 5 name').fill('Chaos');
  await settings.getByRole('button', { name: 'Save quick responses' }).click();
  await expect(settings.getByRole('status')).toContainText('Quick responses saved');

  // A new campaign starts from the defaults, and its settings form shows them.
  await closeCampaign(gm);
  await newCampaign(gm, 'Otter');
  await openTab(gm, 'library');
  await expect(settings.getByLabel('Button 5 name')).toHaveValue('Twist');
  await closeCampaign(gm);

  // Whale still has its own.
  await gm
    .getByRole('listitem')
    .filter({ hasText: 'Whale' })
    .getByRole('button', { name: 'Open' })
    .click();
  await expect(gm.getByTestId('close-campaign')).toBeVisible();
  await openTab(gm, 'library');
  await expect(settings.getByLabel('Button 5 name')).toHaveValue('Chaos');

  // Keep an answer as lore; the player does not see it until it is shared.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const frames: string[] = [];
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  await openTab(gm, 'session');
  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const quick = codm.getByTestId('quick-responses');
  await quick.getByLabel('The line to answer').fill('Can I talk the ferryman down?');
  await quick.getByRole('button', { name: /In character/ }).click();
  const answer = quick.getByTestId('quick-answer');
  await answer.getByRole('button', { name: 'Keep' }).click();
  const editor = answer.getByRole('form', { name: 'Keep as lore' });
  await editor.getByLabel('Lore to keep (edit before saving)').fill('LORE-ML4 Tam owes a toll.');
  await editor.getByRole('button', { name: 'Save lore' }).click();
  await expect(answer.getByRole('status')).toHaveText('Kept as lore (GM only)');
  await expect.poll(() => frames.length).toBeGreaterThan(0);
  expect(frames.join('\n')).not.toContain('LORE-ML4');

  const lore = codm.getByTestId('lore-view');
  await lore.locator('summary').click();
  const note = lore.getByTestId('lore-note');
  await note.getByRole('button', { name: 'Share with the party' }).click();
  await expect(lore.getByRole('status')).toContainText('Shared with the party');
  await expect(note.getByTestId('lore-shared')).toHaveText('Shared with the party');
  await expect(note.getByRole('button', { name: 'Share with the party' })).toHaveCount(0);
  await note.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-lore-shared-1366x768.png') });

  // The copy reaches the phone; the note's NPC and place tags do not.
  await expect.poll(() => frames.join('\n')).toContain('LORE-ML4');
  expect(frames.join('\n')).not.toContain('"lore"');
  const notes = phone.getByTestId('notes');
  await expect(notes.getByTestId('note-label')).toHaveText(['Party · by the GM']);
  await notes.getByTestId('note-heading').click();
  await expect(notes.getByTestId('note-body-view')).toContainText('LORE-ML4 Tam owes a toll.');
  await notes.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-shared-lore-390x844.png') });

  // ML.A review: a restored copy has the same name but its own setup; the form reloads.
  await openWindow(gm, 'campaign-backups');
  const win = gm.locator('section[aria-labelledby="campaign-backups"]');
  await win.getByRole('button', { name: 'Back up now' }).click();
  await win
    .getByTestId('backup-row')
    .first()
    .getByRole('button', { name: /^Restore / })
    .click();
  await win.getByTestId('restored').getByRole('button', { name: 'Open restored campaign' }).click();
  gm.once('dialog', (d) => void d.accept());
  await expect(gm.getByTestId('restored-badge')).toBeVisible();
  await openTab(gm, 'library');
  await expect(settings.getByLabel('Button 5 name')).toHaveValue('Twist');
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect(gm.getByTestId('restored-badge')).toHaveCount(0);

  // Review: a switch without leaving the console reloads the settings form.
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  await openTab(gm, 'library');
  await expect(settings.getByLabel('Button 5 name')).toHaveValue('Twist');
});
