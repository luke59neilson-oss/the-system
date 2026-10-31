import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.44 (DESIGN §7 backups and exports, §9a campaigns and backups): the GM
// backs up, downloads and restores from Library & settings; a restore is a new
// campaign beside the current one, never an overwrite, and carries the same
// events and portraits.

const GM_KEY = 'e2e-gm-key-qf44-0123456789abcdef0';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.44');
// A 1×1 PNG the browser can decode.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

type Character = { name: string; portrait: string | null };
const characters = (gm: Page) =>
  gm.evaluate(async () => (await (await fetch('/api/characters')).json()) as Character[]);

test('back up, download and restore keep every event and portrait', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByTestId('portrait-file').setInputFiles({
    name: 'jake.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(create.getByTestId('portrait').locator('img')).toBeVisible();
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(create.getByRole('status')).toHaveText('Character created');
  await create.getByLabel('Name', { exact: true }).fill('Kim');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Kim', exact: true })).toBeVisible();
  const before = await characters(gm);
  expect(before.map((c) => c.name)).toEqual(['Jake', 'Kim']);
  const portraitName = before[0]!.portrait!.split('/').pop()!;

  // Back up now: the backup is listed with its events and the portrait.
  await openWindow(gm, 'campaign-backups');
  const win = gm.locator('section[aria-labelledby="campaign-backups"]');
  await expect(win.getByText('No backups of this campaign yet.')).toBeVisible();
  await win.getByRole('button', { name: 'Back up now' }).click();
  await expect(win.getByTestId('backups-status')).toHaveText(
    /^Backed up \d+ events \(\d{4}-\d{2}-\d{2} [\d:]+ · Back up now\)\.$/,
  );
  const events = Number(
    /Backed up (\d+) events/.exec((await win.getByTestId('backups-status').textContent())!)![1],
  );
  expect(events).toBeGreaterThanOrEqual(3);
  const row = win.getByTestId('backup-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`· ${events} events · 1 portrait`);

  // Download campaign: the export file carries the same events and the portrait.
  const [download] = await Promise.all([
    gm.waitForEvent('download'),
    win.getByRole('button', { name: 'Download campaign' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Whale-\d{4}-\d{2}-\d{2}\.the-system\.json$/);
  const file = await download.path();
  const exported = JSON.parse(readFileSync(file, 'utf8')) as {
    events: unknown[];
    portraits: Record<string, string>;
  };
  expect(exported.events).toHaveLength(events);
  expect(Object.keys(exported.portraits)).toEqual([portraitName]);
  await expect(win.getByTestId('backups-status')).toHaveText(
    `Downloaded ${download.suggestedFilename()}: ${events} events, 1 portrait.`,
  );
  await win.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-campaigns-and-backups-1366x768.png') });

  // Restore the backup: a new campaign beside this one, opened on request.
  await row.getByRole('button', { name: /^Restore / }).click();
  const restored = win.getByTestId('restored');
  await expect(restored.getByRole('status')).toHaveText(
    `Restored as campaign “main-restored”: ${events} events, 1 portrait. Nothing was overwritten.`,
  );
  await restored.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-restored-1366x768.png') });
  await restored.getByRole('button', { name: 'Open restored campaign' }).click();
  await expect(gm.getByTestId('restored-badge')).toHaveText('Restored campaign “main-restored”');
  await openWindow(gm, 'party');
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  expect(await characters(gm)).toEqual(before);
  // Its portrait file is served from the restored campaign.
  const served = await gm.evaluate(async (url) => (await fetch(url)).status, before[0]!.portrait!);
  expect(served).toBe(200);

  // Restore the downloaded file too: another new campaign, nothing overwritten.
  await openWindow(gm, 'campaign-backups');
  await win.getByTestId('restore-file').setInputFiles(file);
  await expect(restored.getByRole('status')).toHaveText(
    `Restored as campaign “main-restored-2”: ${events} events, 1 portrait. Nothing was overwritten.`,
  );
  await expect(win.getByTestId('campaign-row')).toHaveCount(3);

  // A file that is not an export restores nothing and says so.
  await win.getByTestId('restore-file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(win.getByTestId('backups-error')).toHaveText(
    'Nothing was restored: Not a campaign export.',
  );

  // Back to the main campaign from the header.
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect(gm.getByTestId('restored-badge')).toHaveCount(0);
  await expect(gm.getByRole('button', { name: 'Load demo campaign' })).toBeVisible();
  expect(await characters(gm)).toEqual(before);
  // The expected 422 of the bad file is the only console error.
  expect(errors.filter((e) => !/422/.test(e))).toEqual([]);
});
