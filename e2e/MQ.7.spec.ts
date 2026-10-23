import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.7 Hidden quest notice (DESIGN §7): a hidden quest sends the affected
// players a System notice that it exists, with no details; others get nothing.

const GM_KEY = 'e2e-gm-key-mq7-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.7');
const NOTICE = '*Hidden quest detected - A hidden quest exists and can be triggered*';
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

/** Every WebSocket frame the page receives, as text. */
function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

/** Runs one GM command over the GM page's own origin. */
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

async function settle(page: Page) {
  const toast = page.getByTestId('ding-toast');
  await toast.evaluate((el) =>
    Promise.all(el.getAnimations().map((a: { finished: Promise<unknown> }) => a.finished)),
  );
}

test('a hidden quest tells only the affected players that it exists', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Hidden Quest Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  const jakeFrames = watchFrames(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const log = laptop.getByTestId('quests');
  await expect(log.getByRole('article', { name: 'The world is dying' })).toBeVisible();
  await expect(log.getByTestId('hidden-quests')).toHaveCount(0);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const miraFrames = watchFrames(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const phoneLog = phone.getByTestId('quests');
  await expect(phoneLog.getByRole('article', { name: 'The world is dying' })).toBeVisible();

  // Hidden, for Jake only: a System notice pops up and the quest log counts it.
  await gmCommand(gm, {
    type: 'quest.create',
    questId: 'hq-heart',
    title: 'SECRET Heart of the Host',
    text: 'SECRET Reach the Drum before the fever breaks.',
    visible: false,
    days: 9,
    stability: { visible: true, rules: { 'secret-cleanse': -7 } },
    noticeTo: ['demo-jake'],
  });
  const toast = laptop.getByTestId('ding-toast');
  await expect(toast).toHaveText(NOTICE);
  await expect(log.getByTestId('hidden-quests')).toHaveText(
    '[Hidden quest] A hidden quest exists and can be triggered.',
  );
  await settle(laptop);
  await laptop.screenshot({ path: path.join(shots, 'player-hidden-quest-1366x768.png') });
  await expect(toast).toHaveCount(0, { timeout: 5000 });
  const history = laptop.getByTestId('history');
  await history.getByLabel('Show').selectOption('broadcast');
  await expect(history.getByTestId('dings').first()).toContainText(NOTICE);

  // Miranda is not affected: no notice, no count.
  await gmCommand(gm, { type: 'campaign.advanceDay' });
  await expect(phoneLog.getByTestId('day')).toHaveText('Day 6');
  await expect(phoneLog.getByTestId('hidden-quests')).toHaveCount(0);
  await expect(phone.getByTestId('ding-toast')).toHaveCount(0);

  // The GM widens it to everyone: only Miranda is newly told.
  await gmCommand(gm, { type: 'quest.edit', questId: 'hq-heart', noticeTo: null });
  await expect(phone.getByTestId('ding-toast')).toHaveText(NOTICE);
  await expect(phoneLog.getByTestId('hidden-quests')).toBeVisible();
  await settle(phone);
  await phoneLog.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-hidden-quest-390x844.png') });
  await expect(toast).toHaveCount(0);

  // A second hidden quest is counted; revealing the first shows it in full.
  await gmCommand(gm, {
    type: 'quest.create',
    questId: 'hq-scar',
    title: 'SECRET Old scar',
    visible: false,
  });
  await expect(log.getByTestId('hidden-quests')).toHaveText(
    '[Hidden quest] 2 hidden quests exist and can be triggered.',
  );
  await gmCommand(gm, { type: 'quest.edit', questId: 'hq-heart', visible: true });
  await expect(log.getByRole('article', { name: 'SECRET Heart of the Host' })).toBeVisible();
  await expect(log.getByTestId('hidden-quests')).toHaveText(
    '[Hidden quest] A hidden quest exists and can be triggered.',
  );
  // Completing the other hidden quest removes the notice.
  await gmCommand(gm, { type: 'quest.setStatus', questId: 'hq-scar', status: 'completed' });
  await expect(log.getByTestId('hidden-quests')).toHaveCount(0);
  await expect(phoneLog.getByTestId('hidden-quests')).toHaveCount(0);

  // Before the reveal no frame carried a hidden quest's details; the scar never.
  const beforeReveal = (frames: string[]) => {
    const cut = frames.findIndex((f) => f.includes('SECRET Heart'));
    return cut < 0 ? frames : frames.slice(0, cut);
  };
  for (const frames of [jakeFrames, miraFrames]) {
    expect(frames.length).toBeGreaterThan(0);
    for (const f of beforeReveal(frames)) {
      expect(f).not.toContain('SECRET');
      expect(f).not.toContain('secret-cleanse');
      expect(f).not.toContain('hq-heart');
    }
    for (const f of frames) {
      expect(f).not.toContain('SECRET Old scar');
      expect(f).not.toContain('hq-scar');
    }
  }

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
