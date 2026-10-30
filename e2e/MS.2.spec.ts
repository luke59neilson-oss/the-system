import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.2 Minimal player screen: DESIGN §9 core rows (name, race, class, levels,
// pools, nine stats in tenths, free points) and the live DING feed.

const GM_KEY = 'e2e-gm-key-ms2-0123456789abcdef';
const REASON = 'GM-SECRET-reason-pale-hunters';
const WHISPER = 'Only Miranda may read this whisper';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MS.2');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

function watch(page: Page) {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  return { errors, frames };
}

async function broadcast(gm: Page, text: string, to: string) {
  await gm.getByLabel('Message').fill(text);
  await gm.getByLabel('Recipients').selectOption({ label: to });
  await gm.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(gm.getByRole('listitem').filter({ hasText: text })).toBeVisible();
}

test(
  'a player picks a character and watches the GM’s changes land live',
  { tag: '@latency' },
  async ({ browser }) => {
    const gm = await browser.newPage();
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Tutorial: The Whale');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    for (const name of ['Jake', 'Miranda']) {
      await openWindow(gm, 'create-character');
      await gm.getByLabel('Name', { exact: true }).fill(name);
      await gm.getByRole('button', { name: 'Create character' }).click();
      await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }

    const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const { errors, frames } = watch(player);
    await player.goto(server.url);
    await expect(player.getByRole('heading', { name: 'Choose your character' })).toBeVisible();
    await expect(player.getByRole('list').getByRole('link')).toHaveText([/Jake/, /Miranda/]);
    await player.screenshot({ path: path.join(shots, 'join-1366x768.png') });
    await player.getByRole('link', { name: /Jake/ }).click();

    // DESIGN §9 core rows at creation.
    await expect(player.getByTestId('connection')).toHaveText('Connected');
    await expect(player.getByTestId('name')).toHaveText('Jake');
    await expect(player.getByTestId('race')).toHaveText('[Human (G) – lvl 0]');
    await expect(player.getByTestId('class')).toHaveText('[Archer – lvl 0]');
    await expect(player.getByTestId('profession')).toHaveCount(0);
    await expect(player.getByTestId('pool-hp')).toHaveText('100/100');
    await expect(player.getByTestId('pool-mp')).toHaveText('100/100');
    await expect(player.getByTestId('pool-stamina')).toHaveText('100/100');
    await expect(player.getByTestId(/^stat-/)).toHaveCount(9);
    for (const stat of ['strength', 'agility', 'perception', 'willpower']) {
      await expect(player.getByTestId(`stat-${stat}`)).toContainText('1.0');
    }
    await expect(player.getByTestId('free-points')).toHaveText('0');
    await expect(player.getByText('Race Skills')).toBeVisible();
    await expect(player.getByText('[Identify (Common)]')).toBeVisible();

    // GM awards XP: the DING lands on the player screen within a second.
    await openWindow(gm, 'award-xp');
    await gm.getByLabel('Amount').fill('301');
    await gm.getByLabel('Reason (GM only)').fill(REASON);
    const sent = Date.now();
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(player.getByTestId('dings')).toContainText(
      "*'DING!' Class: [Archer] has reached level 1 - Stat points allocated*",
      { timeout: 1000 },
    );
    expect(Date.now() - sent).toBeLessThan(1500);
    await expect(player.getByTestId('dings')).toContainText(
      "*'DING!' Race: [Human] has reached level 1 - +2 free points*",
    );
    await expect(player.getByTestId('class')).toHaveText('[Archer – lvl 1]');
    await expect(player.getByTestId('race')).toHaveText('[Human (G) – lvl 1]');
    await expect(player.getByTestId('free-points')).toHaveText('2');
    // The class spread raised stats (shown in tenths).
    const stats = await player.getByTestId(/^stat-/).allInnerTexts();
    expect(stats.some((s) => !s.endsWith('1.0'))).toBe(true);

    // Broadcasts: everyone's reaches Jake; Miranda's whisper does not.
    await broadcast(gm, 'The world is dying. Find what is killing it.', 'Everyone');
    await broadcast(gm, WHISPER, 'Miranda');
    await expect(player.getByTestId('messages')).toHaveText(
      'The world is dying. Find what is killing it.',
    );

    await player.screenshot({ path: path.join(shots, 'player-1366x768.png') });

    // Reloading keeps the messages (they live in the view) and this run's DINGs
    // (the server resends them on join), with no "missed" warning.
    await player.reload();
    await expect(player.getByTestId('messages')).toHaveText(
      'The world is dying. Find what is killing it.',
    );
    await expect(player.getByTestId('dings').getByRole('listitem')).toHaveCount(2);
    await expect(player.getByTestId('gap')).toHaveCount(0);

    // Canary: nothing GM-only or meant for Miranda reached Jake's browser.
    const all = frames.join('\n');
    expect(all).not.toContain(REASON);
    expect(all).not.toContain(WHISPER);
    expect(all).not.toContain(GM_KEY);
    expect(errors).toEqual([]);

    // Phone: single column, no sideways scrolling.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneWatch = watch(phone);
    await phone.goto(server.url);
    await phone.getByRole('link', { name: /Miranda/ }).click();
    await expect(phone.getByTestId('name')).toHaveText('Miranda');
    await expect(phone.getByTestId('messages')).toContainText(WHISPER);
    // A player who joins after the award still sees their own DINGs, not Jake's.
    await expect(phone.getByTestId('dings').getByRole('listitem')).toHaveCount(2);
    const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await phone.screenshot({ path: path.join(shots, 'player-390x844.png'), fullPage: true });
    expect(phoneWatch.errors).toEqual([]);
    await Promise.all([gm.close(), player.close(), phone.close()]);
  },
);

test('an unknown character id shows a clear error', async ({ page }) => {
  await page.goto(`${server.url}/play/nobody`);
  await expect(page.getByRole('alert')).toHaveText('No such character');
});
