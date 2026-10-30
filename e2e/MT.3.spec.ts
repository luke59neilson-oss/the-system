import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.3 No hunger tracker (DESIGN §7, Q68): hunger is narrated, never tracked.
// A campaign recorded while M7.4's tracker existed (the `trackers` golden log:
// rules config v1 with a hunger block, hunger events, Jake set to Peckish)
// opens on today's server; neither the GM console nor the player's screen
// shows hunger anywhere, and a content file with a `hunger` section imports
// with that section listed as ignored.

const GM_KEY = 'e2e-gm-key-mt3-0123456789abcdef3';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.3');
const oldLog = path.resolve(import.meta.dirname, '../packages/engine/test/golden/trackers.jsonl');
let server: RunningServer;
let dataDir: string;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mt3-'));
  const campaign = path.join(dataDir, 'campaigns', 'main');
  mkdirSync(campaign, { recursive: true });
  copyFileSync(oldLog, path.join(campaign, 'events.jsonl'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('an old campaign with hunger opens with no hunger anywhere; imports ignore it', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const status = page.getByTestId('status');
  await expect(status).toContainText('Jake');
  await expect(page.getByTestId('hunger')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/hunger|peckish/iu);
  await page.screenshot({ path: path.join(shots, 'player-status-390x844.png') });

  // The GM console: the trackers window keeps regions and factions only.
  const win = gm.locator('section[aria-labelledby="trackers"]');
  await openWindow(gm, 'trackers');
  await expect(win.getByRole('group', { name: 'Regions' })).toBeVisible();
  await expect(win.getByRole('group', { name: 'Hunger' })).toHaveCount(0);
  await expect(gm.getByText(/hunger tracker in this campaign|peckish|starving/iu)).toHaveCount(0);
  // The change log still lists the old entries (the log is never rewritten),
  // marked as no longer used and with no Undo: undoing them would change nothing.
  const oldEntry = gm.getByRole('listitem').filter({ hasText: 'Hunger tracker changed' }).first();
  await expect(oldEntry).toContainText('(no longer used)');
  await expect(oldEntry.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-trackers-1366x768.png') });

  // A content file written for the old tracker still imports; hunger is ignored.
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  const file = {
    format: 'the-system/content',
    version: 1,
    title: 'Old pack',
    gmNotes: [{ title: 'Camp', body: 'They rest by the spout.' }],
    hunger: { enabled: true, steps: ['Fed', 'Starving'] },
  };
  await panel.getByLabel('Content file (.json)').setInputFiles({
    name: 'old-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(panel).toContainText('Old pack');
  const ignored = panel.getByRole('list', { name: 'Ignored sections' });
  await expect(ignored).toContainText('hunger');
  await expect(ignored).toContainText('the app does not track hunger');
  await expect(panel.getByRole('checkbox')).toHaveCount(1);
  await expect(panel.locator('.err')).toHaveCount(0);
  await panel.screenshot({ path: path.join(shots, 'gm-import-ignored-1366x768.png') });

  expect(frames.filter((f) => /hunger|peckish/iu.test(f))).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
