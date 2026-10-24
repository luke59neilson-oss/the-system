import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.3 Campaign and sessions: the GM creates a campaign, starts a session,
// moves the in-game day on, plays, and ends the session; the end backs the
// campaign up and turns the session's running log into its report. Session
// bookkeeping never reaches a player.

const GM_KEY = 'e2e-gm-key-m43-0123456789abcdef';
const REASON = 'GM-SECRET-m43-eel-hunt';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.3');
let dataDir: string;
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m43-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterAll(async () => {
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

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test(
  'the GM runs a session: start, advance the day, play, end with backup and report',
  { tag: '@latency' },
  async ({ browser }) => {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmWatch = watch(gm);
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Session Test');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    const panel = gm.locator('section[aria-labelledby="session-heading"]');
    const chip = gm.getByTestId('session-chip');
    await expect(chip).toHaveText('No session · Day 1');
    await expect(panel.getByTestId('session-now')).toContainText('No session running.');
    await expect(panel).toContainText('None yet.');
    await gm.getByLabel('Name', { exact: true }).fill('Jake');
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneWatch = watch(phone);
    await phone.goto(server.url);
    await phone.getByRole('link', { name: /Jake/ }).click();
    await expect(phone.getByTestId('connection')).toHaveText('Connected');

    // Start: the chip and the window follow at once.
    await panel.getByRole('button', { name: 'Start session 1' }).click();
    await expect(chip).toHaveText('Session 1 · Day 1');
    await expect(panel.getByTestId('session-now')).toContainText('Session 1 is running');
    await expect(panel.getByRole('status')).toHaveText('Session 1 started');

    // The day counter: a bad value disables the button; 2 days moves to day 3.
    const advanceField = panel.getByLabel('Advance by (days)');
    await advanceField.fill('0');
    await expect(panel.getByRole('button', { name: 'Advance', exact: true })).toBeDisabled();
    await advanceField.fill('2');
    await panel.getByRole('button', { name: 'Advance to day 3' }).click();
    await expect(panel.getByTestId('day')).toHaveText('3');
    await expect(chip).toHaveText('Session 1 · Day 3');
    await expect(panel.getByTestId('session-now')).toContainText('Days 1–3');
    await expect(advanceField).toHaveValue('1');

    // Play: XP with a GM-only reason reaches the phone as a DING.
    await gm.getByLabel('Amount').fill('300');
    await gm.getByLabel('Reason (GM only)').fill(REASON);
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 3]', { timeout: 2000 });
    await gm.evaluate(() =>
      (globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 0),
    );
    await gm.screenshot({ path: path.join(shots, 'gm-session-running-1366x768.png') });

    // The running log already exists in the exports folder.
    const file = path.join(dataDir, 'exports', 'main', 'session-01.md');

    // End: a confirm step first; "Keep playing" backs out.
    await panel.getByRole('button', { name: 'End session…' }).click();
    const confirm = panel.getByRole('group', { name: 'End session 1' });
    await expect(confirm).toContainText('The campaign is backed up');
    await panel.screenshot({ path: path.join(shots, 'gm-session-confirm-1366x768.png') });
    await confirm.getByRole('button', { name: 'Keep playing' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(chip).toHaveText('Session 1 · Day 3');
    await panel.getByRole('button', { name: 'End session…' }).click();
    await panel.getByRole('button', { name: 'End session 1' }).click();
    await expect(panel.getByRole('status')).toHaveText(
      'Session 1 ended: backup saved, report written',
    );
    await expect(chip).toHaveText('No session · Day 3');
    const past = panel.getByRole('table');
    await expect(past.getByRole('row')).toHaveCount(2);
    await expect(past.getByRole('row').nth(1)).toContainText('Days 1–3');
    await expect(panel.getByRole('button', { name: 'Start session 2' })).toBeVisible();
    await gm.evaluate(() =>
      (globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 0),
    );
    await gm.screenshot({ path: path.join(shots, 'gm-session-ended-1366x768.png') });

    // The report and the backup are on disk the moment the end is confirmed.
    const report = readFileSync(file, 'utf8');
    expect(report).toMatch(/^# Session 1 report: Session Test$/m);
    expect(report).toContain('- In-game days: 1–3');
    expect(report).toContain('Day 1 → 3');
    expect(report).toContain('Jake: class Archer 0 → 3');
    expect(report).toContain(`for ${REASON}`);
    expect(report).not.toContain('New character Jake'); // Before the session started.
    const backups = path.join(dataDir, 'campaigns', 'main', 'backups');
    const ends = readdirSync(backups).filter((f) => f.endsWith('-session-1-end'));
    expect(ends).toHaveLength(1);
    expect(existsSync(path.join(backups, ends[0] ?? '', 'events.jsonl'))).toBe(true);

    // A phone-width GM console still works without sideways scroll.
    await gm.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    await noSidewaysScroll(gm);
    await panel.screenshot({ path: path.join(shots, 'gm-session-window-390x844.png') });

    // Nothing about sessions (or GM reasons) reached the player.
    const frames = phoneWatch.frames.join('\n');
    expect(frames).not.toContain('currentSession');
    expect(frames).not.toContain('"sessions"');
    expect(frames).not.toContain(REASON);
    expect(phoneWatch.errors).toEqual([]);
    expect(gmWatch.errors).toEqual([]);
    await Promise.all([gm.close(), phone.close()]);
  },
);
