import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.5 Cast from the player's phone (DESIGN §6): a Cast button on a skill
// with a cost; the pool pays, a cast the pool cannot pay is refused with a
// clear message; the use shows in the GM's feed and practice review; the GM
// can undo it. Other players hear nothing of it.

const GM_KEY = 'e2e-gm-key-mu5-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.5');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

async function gmCommand(gm: Page, command: Record<string, unknown>): Promise<void> {
  const result = await gm.evaluate(
    ({ key, command }) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
        );
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
          if (m.type === 'hello') ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
          if (m.type === 'joined')
            ws.send(JSON.stringify({ type: 'command', requestId: 'x', command }));
          if (m.type === 'result') {
            ws.close();
            resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
          }
        };
      }),
    { key: GM_KEY, command },
  );
  expect(result).toBe('ok');
}

test('a player casts from their phone; too low is refused; the GM sees it and undoes it', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Cast Test');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await expect(gm.getByRole('tablist', { name: 'Console tabs' })).toBeVisible();

  await gmCommand(gm, {
    type: 'skillDef.define',
    id: 'bolt',
    name: 'Arcane Bolt',
    rarity: 'common',
    tags: ['spell'],
    description: 'A bolt of raw mana.',
    cost: { pool: 'mp', amount: 40 },
    cooldown: '1 round',
  });
  for (const [id, name, skill] of [
    ['jake', 'Jake', 'Arcane Bolt'],
    ['kim', 'Kim', 'Basic Archery'],
  ] as const) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Caster',
      classSkills: [
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: skill, rarity: 'common' },
      ],
    });
  }

  const kim = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const kimErrors = watchErrors(kim);
  const kimFrames = watchFrames(kim);
  await kim.goto(server.url);
  await kim.getByRole('link', { name: /Kim/ }).click();
  await expect(kim.getByRole('button', { name: /\[Basic Archery \(Common\)\]/ })).toBeVisible();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await phone
    .getByTestId('skills-class')
    .getByRole('button', { name: /Arcane Bolt/ })
    .click();
  const detail = phone.getByTestId('skill-detail');
  const cast = detail.getByTestId('skill-cast');
  await expect(cast).toHaveText('Cast (40 MP)');
  await expect(detail.getByTestId('skill-detail-cooldown')).toHaveText('1 round');
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('MP 100/100');

  await cast.click();
  await expect(detail.getByTestId('skill-cast-result')).toHaveText(
    'Cast! −40 MP. The GM will review the use.',
  );
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('MP 60/100');
  await phone.screenshot({ path: path.join(shots, 'player-cast-390x844.png') });
  await cast.click();
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('Not enough MP: 20 of 40');
  // The server refuses a cast the pool cannot pay, and says why.
  await cast.click();
  await expect(detail.getByTestId('skill-cast-result')).toContainText('Not enough MP');
  await expect(detail.getByTestId('skill-cast-result')).toContainText('20 of 40');
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('Not enough MP: 20 of 40');
  await phone.screenshot({ path: path.join(shots, 'player-too-low-390x844.png') });

  // The GM's feed shows each cast; the change log undoes the last one.
  const feed = gm.locator('section[aria-labelledby="feed"]');
  await openWindow(gm, 'feed');
  await expect(feed.getByText('Cast [Arcane Bolt]: −40 MP (20 left)')).toBeVisible();
  await expect(feed.getByText('Cast [Arcane Bolt]: −40 MP (60 left)')).toBeVisible();
  // Both casts wait in the GM's practice review as unreviewed player entries.
  const review = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await openWindow(gm, 'practice-capture');
  await expect(review).toContainText('To review (2)');
  await expect(review.getByText('Cast [Arcane Bolt]')).toHaveCount(2);
  const log = gm.locator('section[aria-labelledby="change-log"]');
  await openWindow(gm, 'change-log');
  const rows = log.getByRole('listitem').filter({ hasText: 'Jake skill cast (Arcane Bolt)' });
  await expect(rows).toHaveCount(2);
  const last = rows.first();
  await last.getByRole('button', { name: 'Undo' }).click();
  await last.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(last).toContainText('(undone)');
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('MP 60/100');
  // Undo also takes the cast's practice entry out of the review.
  await openWindow(gm, 'practice-capture');
  await expect(review).toContainText('To review (1)');
  await expect(review.getByText('Cast [Arcane Bolt]')).toHaveCount(1);
  await openWindow(gm, 'feed');
  await gm.screenshot({ path: path.join(shots, 'gm-feed-1366x768.png') });

  // Jake on a laptop sees the same.
  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await jake
    .getByTestId('skills-class')
    .getByRole('button', { name: /Arcane Bolt/ })
    .click();
  await expect(jake.getByTestId('skill-cast-pool')).toHaveText('MP 60/100');
  await jake.screenshot({ path: path.join(shots, 'player-cast-1366x768.png') });

  // Kim heard nothing of Jake's casts.
  expect(kimFrames.length).toBeGreaterThan(0);
  expect(kimFrames.join('\n')).not.toContain('Arcane Bolt');

  expect(gmErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(jakeErrors).toEqual([]);
});
