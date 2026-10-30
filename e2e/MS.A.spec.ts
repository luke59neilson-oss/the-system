import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.A Milestone acceptance: the walking skeleton end to end, as Luke would
// run a first session. The GM sets up a campaign, a phone joins from the
// address the GM console shows, the GM's XP award and broadcast land live,
// the Table view shows the same, the demo comes and goes, and the laptop
// restarting (server stop + start on the same data and port) loses nothing:
// the phone reconnects on its own.

const GM_KEY = 'e2e-gm-key-msa-0123456789abcdef';
const REASON = 'GM-SECRET-reason-msa-first-session';
const WHISPER = 'Only Miranda may read this MS.A whisper';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MS.A');
let dataDir: string;
let server: RunningServer | null = null;

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-msa-'));
});

test.afterAll(async () => {
  await server?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watch(page: Page) {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on('console', (msg) => {
    // A dropped socket while the server restarts is expected, not an app error.
    if (msg.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED/.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  return { errors, frames };
}

test(
  'a first session on the walking skeleton, through a laptop restart',
  { tag: '@latency' },
  async ({ browser }) => {
    server = await startBuiltServer({ GM_KEY }, { dataDir });
    const port = Number(new URL(server.url).port);

    // GM: create the campaign and party.
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmWatch = watch(gm);
    gm.on('dialog', (d) => void d.accept());
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('First Session');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    for (const name of ['Jake', 'Miranda']) {
      await openWindow(gm, 'create-character');
      await gm.getByLabel('Name', { exact: true }).fill(name);
      await gm.getByRole('button', { name: 'Create character' }).click();
      await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }
    // The console shows players where to go (address + QR), never the GM key.
    const joinUrl = await gm.getByTestId('join-url').innerText();
    expect(joinUrl).toMatch(/^http:\/\/[\d.]+:\d+\/?$/);
    expect(joinUrl).not.toContain(GM_KEY);
    await expect(gm.getByRole('img', { name: /QR code for/ })).toBeVisible();

    // A phone joins (the e2e server listens on 127.0.0.1, so it uses that
    // address with the join URL's path) and picks Jake.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneWatch = watch(phone);
    await phone.goto(new URL(new URL(joinUrl).pathname, server.url).href);
    await expect(phone.getByRole('heading', { name: 'Choose your character' })).toBeVisible();
    await phone.getByRole('link', { name: /Jake/ }).click();
    await expect(phone.getByTestId('connection')).toHaveText('Connected');
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 0]');

    // The GM awards XP and broadcasts: both land on the phone live.
    await openWindow(gm, 'award-xp');
    await gm.getByLabel('Amount').fill('301');
    await gm.getByLabel('Reason (GM only)').fill(REASON);
    const sent = Date.now();
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(phone.getByTestId('dings')).toContainText(
      "*'DING!' Class: [Archer] has reached level 1 - Stat points allocated*",
      { timeout: 1000 },
    );
    expect(Date.now() - sent).toBeLessThan(1500);
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 1]');
    await expect(phone.getByTestId('free-points')).toHaveText('2');
    const statsBefore = await phone.getByTestId(/^stat-/).allInnerTexts();
    await gm.getByLabel('Message').fill('Welcome to the tutorial.');
    await gm.getByLabel('Recipients').selectOption({ label: 'Everyone' });
    await gm.getByRole('button', { name: 'Send broadcast' }).click();
    await gm.getByLabel('Message').fill(WHISPER);
    await gm.getByLabel('Recipients').selectOption({ label: 'Miranda' });
    await gm.getByRole('button', { name: 'Send broadcast' }).click();
    await expect(phone.getByTestId('messages')).toHaveText('Welcome to the tutorial.');

    // Table view: the GM sees Jake's pane exactly as the phone does.
    const bar = gm.getByRole('navigation', { name: 'View as' });
    await bar.getByRole('button', { name: 'Table view' }).click();
    const jakePane = gm.frameLocator('iframe[title="Jake (player view)"]:visible');
    await expect(jakePane.getByTestId('class')).toHaveText('[Archer – lvl 1]');
    await expect(jakePane.getByTestId('messages')).toHaveText('Welcome to the tutorial.');
    await gm.screenshot({ path: path.join(shots, 'gm-table-view-1366x768.png') });
    await bar.getByRole('button', { name: 'GM' }).click();

    // The GM link for another browser on this computer (the desktop app never
    // prints its key): folded away, and it opens a working console.
    const gmLink = gm.getByLabel('GM link');
    await expect(gmLink).toBeHidden();
    await gm.getByText('Open the GM console in another browser on this computer').click();
    await expect(gmLink).toHaveValue(`${server.url}/gm#key=${GM_KEY}`);
    await gm.screenshot({ path: path.join(shots, 'gm-link-1366x768.png') });
    const second = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await second.goto(await gmLink.inputValue());
    await expect(second.getByTestId('connection')).toHaveText('Connected');
    await expect(
      second.getByRole('heading', { level: 3, name: 'Jake', exact: true }),
    ).toBeVisible();
    await second.close();
    await expect(phone.getByText(/GM link|GM console/)).toHaveCount(0);

    await gm.getByRole('button', { name: 'Load demo campaign' }).click();
    await expect(gm.getByTestId('demo-badge')).toBeVisible();
    await expect(phone.getByRole('alert')).toContainText('switched to another campaign');
    await gm.getByRole('button', { name: 'Back to my campaign' }).click();
    await expect(gm.getByRole('heading', { name: /First Session/ })).toBeVisible();
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 1]', { timeout: 8000 });

    // The laptop restarts: same data folder, same address.
    await server.stop();
    server = null;
    await expect(phone.getByTestId('connection')).toHaveText('Reconnecting…');
    server = await startBuiltServer({ GM_KEY }, { dataDir, port });

    // The phone reconnects by itself with everything intact.
    await expect(phone.getByTestId('connection')).toHaveText('Connected', { timeout: 10_000 });
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 1]');
    await expect(phone.getByTestId('race')).toHaveText('[Human (G) – lvl 1]');
    await expect(phone.getByTestId('free-points')).toHaveText('2');
    expect(await phone.getByTestId(/^stat-/).allInnerTexts()).toEqual(statsBefore);
    await expect(phone.getByTestId('messages')).toHaveText('Welcome to the tutorial.');
    await expect(phone.getByTestId('demo-badge')).toHaveCount(0);
    const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await phone.screenshot({ path: path.join(shots, 'player-after-restart-390x844.png') });

    // The GM console reconnects too and still holds the party and its levels.
    await expect(gm.getByRole('heading', { name: /First Session/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(gm.locator('[data-testid^="class-level-"]')).toHaveText(['1', '1']);
    await gm.screenshot({ path: path.join(shots, 'gm-after-restart-1366x768.png') });

    // And play goes on after the restart.
    await gm.getByRole('checkbox', { name: 'Miranda' }).first().uncheck();
    await openWindow(gm, 'award-xp');
    await gm.getByLabel('Amount').fill('400');
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 4]', { timeout: 1000 });

    // Canary: nothing GM-only or meant for Miranda reached the phone, before or after.
    const all = phoneWatch.frames.join('\n');
    expect(all).not.toContain(REASON);
    expect(all).not.toContain(WHISPER);
    expect(all).not.toContain(GM_KEY);
    expect(phoneWatch.errors).toEqual([]);
    expect(gmWatch.errors).toEqual([]);
    await Promise.all([gm.close(), phone.close()]);
  },
);
