import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.3 Perspective switcher: the GM app's "View as" bar ([GM] [each character]
// [Table view]). Character views and Table-view panes are real player clients
// (no GM key, player projection only), all live.

const GM_KEY = 'e2e-gm-key-ms3-0123456789abcdef';
const REASON = 'GM-SECRET-reason-ms3-immune-response';
const WHISPER = 'Only Miranda may read this MS.3 whisper';
const PARTY = ['Jake', 'Miranda', 'Casper', 'Sultan', 'Neil'];
const shots = path.resolve(import.meta.dirname, '../docs/screens/MS.3');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

interface Socket {
  join: Record<string, unknown> | null;
  received: string[];
}

/** Records every WebSocket the page (and its frames) opens, with its join frame. */
function watch(page: Page) {
  const errors: string[] = [];
  const sockets: Socket[] = [];
  const paneBodies: Promise<string>[] = [];
  page.on('response', (res) => {
    // Everything a pane frame (a player client) fetched over HTTP.
    if (res.frame() !== page.mainFrame()) paneBodies.push(res.text().catch(() => ''));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => {
    const socket: Socket = { join: null, received: [] };
    sockets.push(socket);
    ws.on('framesent', (f) => {
      const data = JSON.parse(String(f.payload)) as Record<string, unknown>;
      if (data['type'] === 'join') socket.join = data;
    });
    ws.on('framereceived', (f) => socket.received.push(String(f.payload)));
  });
  return { errors, sockets, paneBodies };
}

const pane = (gm: Page, name: string) =>
  gm.frameLocator(`iframe[title="${name} (player view)"]:visible`);

test('the GM views the table as each player, live, with player-only data', { tag: '@latency' }, async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const { errors, sockets, paneBodies } = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Tutorial: The Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const name of PARTY) {
    await gm.getByLabel('Name', { exact: true }).fill(name);
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('cell', { name, exact: true })).toBeVisible();
  }

  // The bar: [GM] [each character] [Table view].
  const bar = gm.getByRole('navigation', { name: 'View as' });
  await expect(bar.getByRole('button')).toHaveText(['GM', ...PARTY, 'Table view']);
  await expect(bar.getByRole('button', { name: 'GM' })).toHaveAttribute('aria-pressed', 'true');

  // Character view: Jake's own player screen, nothing of the GM console.
  await bar.getByRole('button', { name: 'Jake' }).click();
  const jake = pane(gm, 'Jake');
  await expect(jake.getByTestId('connection')).toHaveText('Connected');
  await expect(jake.getByTestId('name')).toHaveText('Jake');
  await expect(jake.getByTestId('class')).toHaveText('[Archer – lvl 0]');
  await expect(jake.getByRole('link', { name: 'Switch character' })).toHaveCount(0);
  await expect(gm.getByRole('heading', { name: 'Award class XP' })).toBeHidden();
  await gm.screenshot({ path: path.join(shots, 'view-as-character-1366x768.png') });

  // Back to GM: the console is there again.
  await bar.getByRole('button', { name: 'GM' }).click();
  await expect(gm.getByRole('heading', { name: 'Award class XP' })).toBeVisible();
  await expect(gm.locator('iframe:visible')).toHaveCount(0);

  // Table view: GM console plus the first four players, each a live player client.
  await bar.getByRole('button', { name: 'Table view' }).click();
  await expect(gm.locator('iframe:visible')).toHaveCount(4);
  for (const name of PARTY.slice(0, 4)) {
    await expect(pane(gm, name).getByTestId('name')).toHaveText(name);
    await expect(pane(gm, name).getByTestId('connection')).toHaveText('Connected');
  }
  // A fifth character can be swapped in; a fifth pane is refused.
  const picker = gm.getByRole('group', { name: 'Panes (up to 4)' });
  await expect(picker.getByLabel('Neil')).toBeDisabled();
  await picker.getByLabel('Casper').uncheck();
  await picker.getByLabel('Neil').check();
  await expect(gm.locator('iframe:visible')).toHaveCount(4);
  await expect(pane(gm, 'Neil').getByTestId('name')).toHaveText('Neil');
  await expect(gm.locator('iframe[title="Casper (player view)"]')).toHaveCount(0);
  await picker.getByLabel('Neil').uncheck();
  await picker.getByLabel('Casper').check();
  for (const name of PARTY.slice(0, 4)) {
    await expect(pane(gm, name).getByTestId('connection')).toHaveText('Connected');
  }

  // The GM awards XP (Sultan sits out; 101 XP each): every affected pane shows the DING within 1 s.
  await gm.getByRole('checkbox', { name: 'Sultan' }).first().uncheck();
  await gm.getByLabel('Amount').fill('404');
  await gm.getByLabel('Reason (GM only)').fill(REASON);
  const ding = "*'DING!' Class: [Archer] has reached level 1 - Stat points allocated*";
  const raceDing = "*'DING!' Race: [Human] has reached level 1 - +2 free points*";
  const sent = Date.now();
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await Promise.all(
    ['Jake', 'Miranda', 'Casper'].map((name) =>
      expect(pane(gm, name).getByTestId('dings')).toContainText(ding, { timeout: 1000 }),
    ),
  );
  // Measured from before the click: all three panes had the DING within 1 s.
  expect(Date.now() - sent).toBeLessThanOrEqual(1000);
  for (const name of ['Jake', 'Miranda', 'Casper']) {
    await expect(pane(gm, name).getByTestId('dings')).toContainText(raceDing);
  }
  for (const name of ['Jake', 'Miranda', 'Casper']) {
    // Small panes pin the newest DING above the sheet, in view without scrolling.
    await expect(pane(gm, name).getByTestId('latest-ding')).toBeInViewport();
  }
  await expect(pane(gm, 'Sultan').getByTestId('latest-ding')).toHaveCount(0);
  await expect(pane(gm, 'Jake').getByTestId('class')).toHaveText('[Archer – lvl 1]');
  await expect(pane(gm, 'Sultan').getByTestId('class')).toHaveText('[Archer – lvl 0]');
  await expect(pane(gm, 'Sultan').getByTestId('dings')).toHaveCount(0);

  // A whisper to Miranda reaches only her pane.
  await gm.getByLabel('Message').fill(WHISPER);
  await gm.getByLabel('Recipients').selectOption({ label: 'Miranda' });
  await gm.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(pane(gm, 'Miranda').getByTestId('messages')).toHaveText(WHISPER);
  await expect(pane(gm, 'Miranda').getByTestId('latest-message')).toBeInViewport();
  await expect(pane(gm, 'Miranda').getByTestId('latest-message')).toContainText(WHISPER);
  await expect(pane(gm, 'Jake').getByTestId('messages')).toHaveCount(0);
  await gm.locator('.gm-pane').evaluate((el) => el.scrollTo(0, 0));
  await gm.screenshot({ path: path.join(shots, 'table-view-1366x768.png') });

  // Switching away and back keeps the very same Table pane frames (and sockets).
  const marked = async (name: string, set: boolean) => {
    const frame = await gm
      .locator(`.table-side iframe[title="${name} (player view)"]`)
      .elementHandle()
      .then((h) => h?.contentFrame());
    if (!frame) throw new Error(`No pane frame for ${name}`);
    return frame.evaluate((doSet) => {
      const w = globalThis as unknown as { ms3Marker?: string };
      if (doSet) w.ms3Marker = 'kept';
      return w.ms3Marker ?? null;
    }, set);
  };
  for (const name of PARTY.slice(0, 4)) await marked(name, true);
  await bar.getByRole('button', { name: 'Jake' }).click();
  await expect(pane(gm, 'Jake').getByTestId('dings')).toContainText(ding);
  await bar.getByRole('button', { name: 'Table view' }).click();
  await expect(gm.locator('iframe:visible')).toHaveCount(4);
  for (const name of PARTY.slice(0, 4)) expect(await marked(name, false)).toBe('kept');
  for (const name of ['Jake', 'Miranda', 'Casper']) {
    await expect(pane(gm, name).getByTestId('dings').getByRole('listitem')).toHaveCount(2);
    await expect(pane(gm, name).getByTestId('connection')).toHaveText('Connected');
  }

  // Canary on every pane: each player socket joined without the GM key and never
  // received GM-only data, full campaign state, or another player's whisper.
  const players = sockets.filter((s) => s.join?.['role'] === 'player');
  const gmSockets = sockets.filter((s) => s.join?.['role'] === 'gm');
  expect(gmSockets.length).toBeGreaterThan(0);
  const ids = await gm
    .locator('[data-testid^="row-"]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid')?.slice(4) ?? ''));
  const idOf = (name: string) => ids[PARTY.indexOf(name)];
  for (const name of PARTY) {
    const own = players.filter((s) => s.join?.['characterId'] === idOf(name));
    expect(own.length, `${name} pane opened a player socket`).toBeGreaterThan(0);
  }
  for (const socket of players) {
    expect(JSON.stringify(socket.join)).not.toContain(GM_KEY);
    expect(socket.join).not.toHaveProperty('gmKey');
    const all = socket.received.join('\n');
    expect(all).not.toContain(GM_KEY);
    expect(all).not.toContain(REASON);
    expect(all).not.toContain('"type":"state"');
    if (socket.join?.['characterId'] !== idOf('Miranda')) expect(all).not.toContain(WHISPER);
  }
  // …and no HTTP response any pane frame loaded carried GM-only data either.
  const bodies = await Promise.all(paneBodies);
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body).not.toContain(GM_KEY);
    expect(body).not.toContain(REASON);
    expect(body).not.toContain(WHISPER);
  }
  expect(errors).toEqual([]);
  await gm.close();
});

test('the host browser at localhost offers the GM console link', async ({ page }) => {
  const local = server.url.replace('127.0.0.1', 'localhost');
  await page.goto(`${local}/`);
  await page.getByRole('link', { name: 'Open the GM console' }).click();
  await expect(page).toHaveURL(/\/gm$/);
  await expect(page.getByRole('heading', { name: 'GM key needed' })).toBeVisible();

  // A character view is just the player page: it works without any GM key.
  await page.goto(`${local}/play/nobody?pane=1`);
  await expect(page.getByRole('alert')).toHaveText('No such character');
});
