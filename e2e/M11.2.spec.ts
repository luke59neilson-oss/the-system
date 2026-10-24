import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M11.2 Recovery: the laptop loses power mid-session. The server dies with
// SIGKILL (no clean shutdown: its LOCK stays behind, no snapshot or session
// log is written), and the disk holds half an event (cut inside a multi-byte
// character) and a half-written snapshot temp file. Both screens say they are
// reconnecting; a GM command tried during the outage fails visibly and is
// never replayed later. After the restart on the same address both reconnect
// by themselves with every acknowledged change, and play goes on.

const GM_KEY = 'e2e-gm-key-m11-2-0123456789abcdef';
const REASON = 'GM-SECRET-reason-m11-2-marrow-halls';
const shots = 'docs/screens/M11.2';
let dataDir: string;
let server: RunningServer | null = null;

test.beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m11-2-'));
});

test.afterAll(async () => {
  await server?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watch(page: Page) {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on('console', (msg) => {
    // While the server is down the browser logs refused connections; those are the point.
    if (msg.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED/.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  return { errors, frames };
}

test('power loss mid-session: hard kill, torn log, stale lock; both screens recover', async ({
  browser,
}) => {
  server = await startBuiltServer({ GM_KEY }, { dataDir });
  const port = Number(new URL(server.url).port);

  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmWatch = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Recovery');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  await expect(gm.getByTestId('session-chip')).toHaveText('Session 1 · Day 1');
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const jakeWatch = watch(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await expect(jake.getByTestId('connection')).toHaveText('Connected');

  await gm.getByLabel('Amount').fill('100');
  await gm.getByLabel('Reason (GM only)').fill(REASON);
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(gm.getByRole('status').filter({ hasText: 'XP awarded' })).toBeVisible();
  await expect(jake.getByTestId('class')).toHaveText('[Archer – lvl 1]', { timeout: 2000 });
  // QF.18: let the change log's refetch finish before the server dies, or
  // the kill resets it mid-flight and the console logs a failed load.
  await expect(gm.locator('section[aria-labelledby="change-log"]')).toContainText(
    'Jake: class Archer 0 → 1',
  );

  // Power loss.
  await server.kill();
  server = null;
  const campaign = path.join(dataDir, 'campaigns', 'main');
  // The dead process left its lock behind: nothing released it.
  expect(readdirSync(campaign)).toContain('LOCK');
  for (const page of [gm, jake]) {
    await expect(page.getByTestId('connection')).toHaveText('Reconnecting…', { timeout: 10_000 });
  }
  await gm.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-reconnecting-1366x768.png') });
  await jake.screenshot({ path: path.join(shots, 'player-reconnecting-390x844.png') });

  // A GM command during the outage fails visibly; it is not queued.
  await gm.getByLabel('Amount').fill('300');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(
    gm.getByRole('alert').filter({ hasText: 'Not connected to the System' }),
  ).toBeVisible();

  // What the power cut left on disk: half an event, cut inside "é" (a
  // two-byte character), and a half-written snapshot temp file.
  const eventLog = path.join(campaign, 'events.jsonl');
  const torn = Buffer.concat([
    Buffer.from('{"id":"torn","type":"system.broadcast","payload":{"text":"Caf'),
    Buffer.from('é').subarray(0, 1),
  ]);
  appendFileSync(eventLog, torn);
  writeFileSync(path.join(campaign, 'snapshot.json.tmp-99999'), '{"format":1,"state":{"na');

  server = await startBuiltServer({ GM_KEY }, { dataDir, port });
  for (const page of [gm, jake]) {
    await expect(page.getByTestId('connection')).toHaveText('Connected', { timeout: 10_000 });
  }
  // Every acknowledged change survived; the outage's command never ran.
  await expect(jake.getByTestId('class')).toHaveText('[Archer – lvl 1]');
  await expect(gm.getByTestId('session-chip')).toHaveText('Session 1 · Day 1');
  // The torn bytes were kept beside the log, exactly, never just deleted.
  const tornCopies = readdirSync(campaign).filter((f) => f.startsWith('events.jsonl.torn-'));
  expect(tornCopies).toHaveLength(1);
  expect(readFileSync(path.join(campaign, tornCopies[0] ?? '')).equals(torn)).toBe(true);
  expect(readFileSync(eventLog, 'utf8').endsWith('}\n')).toBe(true);

  // Play goes on: the next award reaches the phone.
  await gm.getByLabel('Amount').fill('300');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(jake.getByTestId('class')).toHaveText('[Archer – lvl 4]', { timeout: 2000 });
  await expect(gm.locator('section[aria-labelledby="change-log"]')).toContainText(
    'Jake: class Archer 1 → 4',
  );
  await gm.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-recovered-1366x768.png') });
  await jake.screenshot({ path: path.join(shots, 'player-recovered-390x844.png') });

  // The award made during the outage is not in the log either.
  const awards = readFileSync(eventLog, 'utf8')
    .split('\n')
    .filter((line) => line.includes('"xp.awarded"'));
  expect(awards).toHaveLength(2);

  // No GM-only data reached the phone across the reconnect.
  const frames = jakeWatch.frames.join('\n');
  expect(frames).not.toContain(REASON);
  expect(frames).not.toContain(GM_KEY);
  expect(jakeWatch.errors).toEqual([]);
  expect(gmWatch.errors).toEqual([]);
});
