import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M2.A Milestone acceptance (server and sync): a GM and two players play over
// the real server; the laptop "loses power" mid-write (torn last line in the
// event log) and restarts; both phones reconnect with nothing lost; the
// shutdown writes the running session log (M2.4; since M4.3 the started
// session's) to the exports folder on a real SIGTERM, and the session survives
// the restart; and no GM-only data reaches either phone.

const GM_KEY = 'e2e-gm-key-m2a-0123456789abcdef';
const REASON = 'GM-SECRET-reason-m2a-pale-hunters';
const WHISPER = 'Only Miranda may read this M2.A whisper';
let dataDir: string;
let server: RunningServer | null = null;

test.beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m2a-'));
});

test.afterAll(async () => {
  await server?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watch(page: Page) {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED/.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  return { errors, frames };
}

const sessionLogs = () => {
  const dir = path.join(dataDir, 'exports', 'main');
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.md'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

test(
  'GM and two players through a torn write and a restart; session log on shutdown',
  { tag: '@latency' },
  async ({ browser }) => {
    server = await startBuiltServer({ GM_KEY }, { dataDir });
    const port = Number(new URL(server.url).port);

    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmWatch = watch(gm);
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Milestone Two');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await gm.getByRole('button', { name: 'Start session 1' }).click();
    await expect(gm.getByTestId('session-chip')).toHaveText('Session 1 · Day 1');
    for (const name of ['Jake', 'Miranda']) {
      await gm.getByLabel('Name', { exact: true }).fill(name);
      await gm.getByRole('button', { name: 'Create character' }).click();
      await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }

    const join = async (name: string) => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const watched = watch(page);
      await page.goto(server?.url ?? '');
      await page.getByRole('link', { name: new RegExp(name) }).click();
      await expect(page.getByTestId('connection')).toHaveText('Connected');
      return { page, watched };
    };
    const jake = await join('Jake');
    const miranda = await join('Miranda');

    // Live updates to both phones; a whisper only to Miranda.
    await gm.getByLabel('Amount').fill('300');
    await gm.getByLabel('Reason (GM only)').fill(REASON);
    await gm.getByRole('button', { name: 'Award XP' }).click();
    for (const p of [jake.page, miranda.page]) {
      await expect(p.getByTestId('class')).toHaveText('[Archer – lvl 1]', { timeout: 2000 });
    }
    await gm.getByLabel('Message').fill(WHISPER);
    await gm.getByLabel('Recipients').selectOption({ label: 'Miranda' });
    await gm.getByRole('button', { name: 'Send broadcast' }).click();
    await expect(miranda.page.getByTestId('messages')).toHaveText(WHISPER);
    // QF.18: the GM change log refetches after every change; let that request
    // finish before the power loss, or the stop resets it mid-flight and the
    // console logs "Failed to load resource" (a test race, not an app error).
    await expect(gm.locator('section[aria-labelledby="change-log"]')).toContainText(WHISPER);

    // Power loss: the server stops (writing the session log), then half an event is left at the end of the log.
    await server.stop();
    server = null;
    const logs = sessionLogs();
    expect(logs).toHaveLength(1);
    const first = readFileSync(logs[0] ?? '', 'utf8');
    expect(first).toContain('# Session 1 log (running): Milestone Two');
    expect(first).toContain('New character Jake');
    expect(first).toContain(`for ${REASON}`);
    expect(first).toContain('Jake: class Archer 0 → 1');
    expect(first).toContain(`System message to Miranda: ${WHISPER}`);
    const eventLog = path.join(dataDir, 'campaigns', 'main', 'events.jsonl');
    appendFileSync(eventLog, '{"id":"torn","type":"xp.aw');

    server = await startBuiltServer({ GM_KEY }, { dataDir, port });
    for (const p of [jake.page, miranda.page]) {
      await expect(p.getByTestId('connection')).toHaveText('Connected', { timeout: 10_000 });
      await expect(p.getByTestId('class')).toHaveText('[Archer – lvl 1]');
    }
    await expect(miranda.page.getByTestId('messages')).toHaveText(WHISPER);
    // The torn bytes were kept beside the log, never deleted.
    const campaignFiles = readdirSync(path.dirname(eventLog));
    expect(campaignFiles.some((f) => f.startsWith('events.jsonl.torn-'))).toBe(true);

    // Play goes on in the same session; the next shutdown rewrites its log.
    await expect(gm.getByRole('heading', { name: /Milestone Two/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(gm.getByTestId('session-chip')).toHaveText('Session 1 · Day 1');
    await gm.getByRole('checkbox', { name: 'Miranda' }).first().uncheck();
    await gm.getByLabel('Amount').fill('300');
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(jake.page.getByTestId('class')).toHaveText('[Archer – lvl 4]', { timeout: 2000 });
    await expect(miranda.page.getByTestId('class')).toHaveText('[Archer – lvl 1]');

    // The GM export carries the events, never the GM key; players can't fetch it.
    const exportRes = await gm.request.get(`${server.url}/api/gm/export`, {
      headers: { 'x-gm-key': GM_KEY },
    });
    expect(exportRes.status()).toBe(200);
    const exported = await exportRes.text();
    expect(exported).toContain('"format":"the-system-campaign"');
    expect(exported).not.toContain(GM_KEY);
    expect((await jake.page.request.get(`${server.url}/api/gm/export`)).status()).toBe(403);

    await server.stop();
    server = null;
    const after = sessionLogs();
    expect(after).toEqual(logs);
    const second = readFileSync(after[0] ?? '', 'utf8');
    expect(second).toContain('Jake: class Archer 1 → 4');
    expect(second).toContain('New character Jake');

    // Canary: no GM-only data or Miranda's whisper reached Jake; nothing GM-only reached either phone.
    for (const { watched } of [jake, miranda]) {
      const frames = watched.frames.join('\n');
      expect(frames).not.toContain(REASON);
      expect(frames).not.toContain(GM_KEY);
      expect(watched.errors).toEqual([]);
    }
    expect(jake.watched.frames.join('\n')).not.toContain(WHISPER);
    expect(gmWatch.errors).toEqual([]);
    await Promise.all([gm.close(), jake.page.close(), miranda.page.close()]);
  },
);
