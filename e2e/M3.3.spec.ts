import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.3 Notifications and history: the book-style DING feed back to day 1
// (across a server restart), searchable and filterable; DINGs that land
// while the page is open pop up one at a time; an optional chime.

const GM_KEY = 'e2e-gm-key-m33-0123456789abcdef';
const REASON = 'GM-SECRET-reason-m33-boar';
const WHISPER = 'Only Miranda may read this m33 whisper';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.3');
let dataDir: string;
let server: RunningServer | undefined;

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m33-'));
});

test.afterAll(async () => {
  await server?.stop();
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

/** Runs one GM command over the GM page's own origin (commands the console has no form for yet). */
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

async function award(gm: Page, amount: number, reason = '') {
  await gm.getByLabel('Amount').fill(String(amount));
  await gm.getByLabel('Reason (GM only)').fill(reason);
  const form = gm.locator('form[aria-labelledby="award-xp"]');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(form.getByRole('status').or(form.getByRole('alert'))).toHaveText('XP awarded');
}

async function openGm(page: Page) {
  await page.goto(`${server?.url}/gm#key=${GM_KEY}`);
}

test('the DING history reaches back to day 1 and new DINGs queue up', async ({ browser }) => {
  server = await startBuiltServer({ GM_KEY }, { dataDir });
  const port = Number(new URL(server.url).port);
  let gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await openGm(gm);
  await gm.getByLabel('Campaign name').fill('History Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const name of ['Jake', 'Miranda']) {
    await gm.getByLabel('Name', { exact: true }).fill(name);
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  // Day 1: a level-up. Day 3: a broadcast, a whisper to Miranda, more levels.
  await award(gm, 202, REASON);
  await gmCommand(gm, { type: 'campaign.advanceDay', days: 2 });
  await gmCommand(gm, { type: 'system.broadcast', text: 'Day 3 dawns over the tutorial.' });
  await gm.getByLabel('Message').fill(WHISPER);
  await gm.getByLabel('Recipients').selectOption({ label: 'Miranda' });
  await gm.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(gm.getByRole('listitem').filter({ hasText: WHISPER })).toBeVisible();
  await award(gm, 200);

  // A restart loses nothing: the history comes from the event log.
  await gm.close();
  await server.stop();
  server = await startBuiltServer({ GM_KEY }, { dataDir, port });
  gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmWatch = watch(gm);
  await openGm(gm);
  await expect(gm.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();

  // Jake's laptop, with the chime counted instead of played.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await laptop.addInitScript(() => {
    const w = globalThis as unknown as { chimes: number; AudioContext: unknown };
    w.chimes = 0;
    class FakeAudio {
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const param = {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        };
        return { gain: param, connect: (n: unknown) => n };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 0 },
          connect: (n: unknown) => n,
          start: () => {
            w.chimes += 1;
          },
          stop() {},
        };
      }
    }
    w.AudioContext = FakeAudio;
  });
  const { errors, frames } = watch(laptop);
  const list = (await (await fetch(`${server.url}/api/characters`)).json()) as {
    id: string;
    name: string;
  }[];
  const idOf = (name: string) => list.find((c) => c.name === name)?.id ?? 'missing';
  await laptop.goto(`${server.url}/play/${idOf('Jake')}`);
  await expect(laptop.getByTestId('connection')).toHaveText('Connected');
  const history = laptop.getByTestId('history');
  const dings = laptop.getByTestId('dings').getByRole('listitem');

  // Level-ups by default, newest first, each with its in-game day.
  await expect(history.getByLabel('Show')).toHaveValue('dings');
  const levelCount = await dings.count();
  expect(levelCount).toBeGreaterThanOrEqual(4);
  await expect(dings.first()).toContainText('Day 3');
  await expect(dings.last()).toContainText('Day 1');
  await expect(dings.last()).toContainText("*'DING!'");
  // Nothing from before this page opened pops up.
  await expect(laptop.getByTestId('ding-toast')).toHaveCount(0);

  // Filters.
  await history.getByLabel('Show').selectOption('race');
  await expect(dings).not.toHaveCount(0);
  for (const text of await dings.allInnerTexts()) expect(text).toContain('Race: [Human]');
  await history.getByLabel('Show').selectOption('class');
  for (const text of await dings.allInnerTexts()) expect(text).toContain('Class: [Archer]');
  await history.getByLabel('Show').selectOption('broadcast');
  await expect(dings).toHaveCount(1);
  await expect(dings.first()).toContainText('Day 3 dawns over the tutorial.');
  await history.getByLabel('Show').selectOption('all');
  expect(await dings.count()).toBeGreaterThan(levelCount);

  // Search (text and day), case-insensitive; no match says so.
  await history.getByLabel('Search notifications').fill('DAWNS');
  await expect(dings).toHaveCount(1);
  await history.getByLabel('Search notifications').fill('day 1');
  for (const text of await dings.allInnerTexts()) expect(text).toContain('Day 1');
  await history.getByLabel('Search notifications').fill('no such thing');
  await expect(laptop.getByTestId('history-empty')).toHaveText('No notifications match.');
  await history.getByLabel('Search notifications').fill('');
  await history.getByLabel('Show').selectOption('dings');
  await expect(dings).toHaveCount(levelCount);

  // Live: a class and a race DING arrive together and pop up one at a time.
  await award(gm, 200);
  const toast = laptop.getByTestId('ding-toast');
  await expect(toast).toContainText("*'DING!' Class: [Archer]");
  await expect(laptop.getByTestId('ding-more')).toHaveText('+1 more');
  await toast.evaluate((el) =>
    Promise.all(el.getAnimations().map((a: { finished: Promise<unknown> }) => a.finished)),
  );
  await laptop.screenshot({ path: path.join(shots, 'player-ding-1366x768.png') });
  await toast.click();
  await expect(toast).toContainText("*'DING!' Race: [Human]");
  await expect(laptop.getByTestId('ding-more')).toHaveCount(0);
  await expect(toast).toHaveCount(0, { timeout: 5000 });
  await expect(dings).toHaveCount(levelCount + 2);
  // Sound was off: no chime.
  expect(await laptop.evaluate(() => (globalThis as unknown as { chimes: number }).chimes)).toBe(0);

  // Sound on: remembered across a reload; the next DING chimes.
  const sound = laptop.getByTestId('sound');
  await expect(sound).toHaveText('Sound: off');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await laptop.reload();
  await expect(laptop.getByTestId('connection')).toHaveText('Connected');
  await expect(laptop.getByTestId('sound')).toHaveText('Sound: on');
  await expect(dings).toHaveCount(levelCount + 2);
  await award(gm, 200);
  await expect(toast).toContainText("*'DING!'");
  await expect
    .poll(() => laptop.evaluate(() => (globalThis as unknown as { chimes: number }).chimes))
    .toBeGreaterThan(0);
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  await expect(dings).toHaveCount(levelCount + 4);

  // Undo: the undone award's DINGs leave the open history at once.
  const lastAward = await gm.evaluate(async (key) => {
    const res = await fetch('/api/gm/export', { headers: { 'x-gm-key': key } });
    const body = (await res.json()) as { events: { id: string; type: string }[] };
    return body.events.filter((e) => e.type === 'xp.awarded').at(-1)?.id;
  }, GM_KEY);
  await gmCommand(gm, { type: 'event.undo', eventId: lastAward });
  await expect(dings).toHaveCount(levelCount + 2);
  await history.getByLabel('Show').selectOption('all');
  await laptop.screenshot({ path: path.join(shots, 'player-1366x768.png') });

  // Phone: Miranda's history, single column, no sideways scrolling.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneWatch = watch(phone);
  await phone.goto(`${server.url}/play/${idOf('Miranda')}`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('history').getByLabel('Show').selectOption('broadcast');
  await expect(phone.getByTestId('dings').getByRole('listitem')).toHaveCount(2);
  await expect(phone.getByTestId('dings')).toContainText(WHISPER);
  await phone.getByTestId('history').getByLabel('Show').selectOption('dings');
  const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.screenshot({ path: path.join(shots, 'player-390x844.png'), fullPage: true });
  // A DING on the phone pops up at the bottom, clear of the header controls.
  await award(gm, 200);
  const phoneToast = phone.getByTestId('ding-toast');
  await expect(phoneToast).toContainText("*'DING!' Class: [Archer]");
  await phoneToast.evaluate((el) =>
    Promise.all(el.getAnimations().map((a: { finished: Promise<unknown> }) => a.finished)),
  );
  const box = await phoneToast.boundingBox();
  const header = await phone.getByTestId('sound').boundingBox();
  expect(box && header && box.y > header.y + header.height).toBe(true);
  expect(box && box.y + box.height <= 844 && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await phone.screenshot({ path: path.join(shots, 'player-ding-390x844.png') });

  // Canary: nothing GM-only or meant for Miranda reached Jake's browser.
  const all = frames.join('\n');
  expect(all).not.toContain(REASON);
  expect(all).not.toContain(WHISPER);
  expect(all).not.toContain(GM_KEY);
  expect(errors).toEqual([]);
  expect(phoneWatch.errors).toEqual([]);
  expect(gmWatch.errors).toEqual([]);
});
