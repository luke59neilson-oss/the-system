import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.A GM console acceptance: the GM creates 3 characters and awards XP with
// a custom split; each player's screen shows the DING within 1 s; undoing the
// award from the change log reverts it on every screen.

const GM_KEY = 'e2e-gm-key-m4a-0123456789abcdef4a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.A');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m4a-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
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

const REASON = 'Secret ambush at the Rake Canyons';

test(
  'three characters, a custom XP split, DINGs within 1 s, and undo everywhere',
  { tag: '@latency' },
  async ({ browser }) => {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmWatch = watch(gm);
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('M4 Acceptance');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    const create = gm.locator('form[aria-labelledby="new-character"]');
    const names = ['Jake', 'Miranda', 'Casper'] as const;
    for (const name of names) {
      await create.getByLabel('Name', { exact: true }).fill(name);
      await create.getByRole('button', { name: 'Create character' }).click();
      await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }
    const ids = await gm
      .locator('[data-testid^="party-name-"]')
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid')!.slice('party-name-'.length)),
      );
    expect(ids).toHaveLength(3);
    const [jake, miranda, casper] = ids as [string, string, string];

    // Each player opens their own screen: two laptops and a phone.
    const sizes = [
      { width: 1366, height: 768 },
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ];
    const players: Page[] = [];
    const watches: ReturnType<typeof watch>[] = [];
    for (const [i, id] of [jake, miranda, casper].entries()) {
      const p = await browser.newPage({ viewport: sizes[i]! });
      watches.push(watch(p));
      await p.goto(`${server.url}/play/${id}`);
      await expect(p.getByTestId('connection')).toHaveText('Connected');
      await expect(p.getByTestId('class')).toHaveText(/lvl 0\]/);
      players.push(p);
    }

    // Custom split of 1,000 class XP: Jake 400 (level 4), Miranda 100
    // (level 1), Casper balances to 500 (level 4, 100 lost past the G top).
    const award = gm.getByRole('form', { name: 'Award class XP' });
    await award.getByLabel('Amount').fill('1000');
    await award.getByRole('checkbox', { name: 'Set shares by hand' }).check();
    await award.getByLabel('Jake’s share').fill('400');
    await award.getByLabel('Miranda’s share').fill('100');
    await expect(award.getByLabel('Casper’s share (balances)')).toHaveValue('500');
    await expect(award.getByTestId(`levels-${miranda}`)).toHaveText(' · class lvl 0 → 1');
    await expect(award.getByTestId('xp-lost')).toContainText('100 XP will be lost');
    await award.getByLabel('Reason (GM only)').fill(REASON);

    const sent = Date.now();
    await award.getByRole('button', { name: 'Award XP' }).click();
    await Promise.all(
      players.map((p) =>
        expect(p.getByTestId('ding-toast')).toContainText("*'DING!' Class: [", { timeout: 1000 }),
      ),
    );
    expect(Date.now() - sent).toBeLessThan(1500);
    await expect(players[0]!.getByTestId('class')).toHaveText(/lvl 4\]/);
    await expect(players[1]!.getByTestId('class')).toHaveText(/lvl 1\]/);
    await expect(players[2]!.getByTestId('class')).toHaveText(/lvl 4\]/);
    await expect(gm.getByTestId(`class-level-${miranda}`)).toHaveText('1');
    await players[2]!.screenshot({ path: path.join(shots, 'player-ding-390x844.png') });
    await players[0]!.screenshot({ path: path.join(shots, 'player-ding-1366x768.png') });

    // Undo from the change log reverts the award on the GM and every player screen.
    const log = gm.locator('section[aria-labelledby="change-log"]');
    const row = log.getByRole('listitem').filter({ hasText: /XP/ }).last();
    await row.getByRole('button', { name: 'Undo' }).click();
    await row.getByRole('button', { name: 'Confirm undo' }).click();
    await expect(row).toContainText('(undone)');
    for (const id of [jake, miranda, casper]) {
      await expect(gm.getByTestId(`class-level-${id}`)).toHaveText('0');
    }
    for (const p of players) {
      await expect(p.getByTestId('class')).toHaveText(/lvl 0\]/, { timeout: 1000 });
      await expect(p.getByTestId('free-points')).toHaveText('0');
      // The undone award's DINGs leave the notification history too.
      await expect(p.getByTestId('history')).not.toContainText("'DING!' Class: [");
    }
    await gm.screenshot({ path: path.join(shots, 'gm-1366x768.png'), fullPage: true });
    await players[1]!.screenshot({ path: path.join(shots, 'player-undone-1366x768.png') });

    // The GM-only reason never reached a player.
    for (const w of watches) {
      expect(w.frames.some((f) => f.includes(REASON))).toBe(false);
      expect(w.errors).toEqual([]);
    }
    expect(gmWatch.errors).toEqual([]);
  },
);
