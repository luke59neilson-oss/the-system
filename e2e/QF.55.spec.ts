import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { bigCampaignLines } from '../scripts/big-campaign';

// QF.55: the phone's notes list renders a page at a time ("Show more" adds a
// page, a new filter starts from the top); a GM window on a hidden tab keeps
// its half-filled form and shows the current state when its tab returns.

const GM_KEY = 'e2e-gm-key-qf55-0123456789abcdef';
const shots = 'docs/screens/QF.55';
let dataDir: string | null = null;
let server: RunningServer | null = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = null;
});

test('the phone notes list pages, and a new filter starts from the top', async ({ browser }) => {
  test.setTimeout(60_000);
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-qf55-'));
  const dir = path.join(dataDir, 'campaigns', 'main');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'events.jsonl'),
    `${bigCampaignLines(3000, { withNotes: true }).join('\n')}\n`,
  );
  server = await startBuiltServer({ GM_KEY }, { dataDir });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/ana`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  const notes = phone.getByTestId('note');
  const more = phone.getByTestId('notes-more');

  await expect(notes).toHaveCount(30);
  await expect(more).toHaveText(/^Show 30 more \(\d+ not shown\)$/);
  const before = Number(/\((\d+) not shown\)/.exec((await more.textContent()) ?? '')?.[1]);
  expect(before).toBeGreaterThan(30);
  await more.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'notes-more-390x844.png') });
  await more.click();
  await expect(notes).toHaveCount(60);
  await expect(more).toHaveText(new RegExp(`\\(${before - 30} not shown\\)$`));

  // A new filter shows its first page again.
  await phone.getByLabel('Show notes').selectOption('journal');
  const journal = await notes.count();
  expect(journal).toBeLessThanOrEqual(30);
  await phone.getByLabel('Show notes').selectOption('all');
  await expect(notes).toHaveCount(30);
});

test('a half-filled GM form on a hidden tab survives, and the tab shows the current state', async ({
  browser,
}) => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Tabs');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await openWindow(gm, 'create-character');
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const level = gm.locator('[data-testid^="class-level-"]').first();
  await expect(level).toHaveText('0');

  // Half a form on Home, then the GM works on another tab.
  await create.getByLabel('Name', { exact: true }).fill('Miranda (half done)');
  await openWindow(gm, 'award-xp');
  await gm.getByLabel('Amount').fill('300');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(
    gm.getByRole('status').filter({ hasText: /^Awarded [\d,]+ (class|profession) XP to / }),
  ).toBeVisible();

  // Back on Home: the form kept its text and the party shows the award.
  await openTab(gm, 'home');
  await expect(create.getByLabel('Name', { exact: true })).toHaveValue('Miranda (half done)');
  await expect(level).not.toHaveText('0');
  await gm.screenshot({ path: path.join(shots, 'gm-home-after-switch-1366x768.png') });
});
