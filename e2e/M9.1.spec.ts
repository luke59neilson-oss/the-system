import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.1 Session report: ending a session writes the report as markdown and
// JSON to the exports folder; the GM copies any session's report for Claude
// (markdown on the clipboard) or saves it as JSON. A player cannot fetch it.

const GM_KEY = 'e2e-gm-key-m91-0123456789abcdef';
const REASON = 'GM-SECRET-m91-pale-hunt';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.1');
// Serial: the fallback test copies the session the first test ended (one
// server for the file keeps the second test from replaying a whole session).
test.describe.configure({ mode: 'serial' });
let dataDir: string;
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m91-'));
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

const clipboard = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as { navigator: { clipboard: { readText: () => Promise<string> } } }
    ).navigator.clipboard.readText(),
  );

test('the GM copies a session report for Claude and saves it as JSON', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const gm = await context.newPage();
  const gmWatch = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Report Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneWatch = watch(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  const panel = gm.locator('section[aria-labelledby="session-heading"]');
  await panel.getByRole('button', { name: 'Start session 1' }).click();
  await expect(panel.getByRole('status')).toHaveText('Session 1 started');
  await gm.getByLabel('Amount').fill('300');
  await gm.getByLabel('Reason (GM only)').fill(REASON);
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 3]', { timeout: 2000 });

  // The running session's log can be copied too.
  await panel.getByRole('button', { name: 'Copy log for Claude' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Session 1 report copied: paste it into Claude',
  );
  expect(await clipboard(gm)).toMatch(/^# Session 1 log \(running\): Report Test$/m);

  await panel.getByRole('button', { name: 'End session…' }).click();
  await panel.getByRole('button', { name: 'End session 1' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Session 1 ended: backup saved, report written',
  );

  // Both files are on disk at once.
  const dir = path.join(dataDir, 'exports', 'main');
  const md = readFileSync(path.join(dir, 'session-01.md'), 'utf8');
  expect(md).toMatch(/^# Session 1 report: Report Test$/m);
  const onDisk = JSON.parse(readFileSync(path.join(dir, 'session-01.json'), 'utf8')) as {
    format: string;
    report: boolean;
    session: { number: number };
  };
  expect(onDisk).toMatchObject({ format: 'the-system/session-report', report: true });
  expect(onDisk.session.number).toBe(1);

  // Copy for Claude on the past session puts the report on the clipboard.
  const row = panel.getByRole('table').getByRole('row').nth(1);
  await row.getByRole('button', { name: 'Copy session 1 report for Claude' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Session 1 report copied: paste it into Claude',
  );
  const copied = await clipboard(gm);
  expect(copied).toMatch(/^# Session 1 report: Report Test$/m);
  expect(copied).toContain(`for ${REASON}`);
  await gm.evaluate(() =>
    (globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 0),
  );
  await panel.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-session-report-copied-1366x768.png') });

  // JSON saves a file with the same report.
  const [download] = await Promise.all([
    gm.waitForEvent('download'),
    row.getByRole('button', { name: 'Save session 1 report as JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('session-01.json');
  const saved = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
    format: string;
    report: boolean;
  };
  expect(saved).toMatchObject({ format: 'the-system/session-report', report: true });
  await expect(panel.getByRole('status')).toHaveText('Session 1 report saved as JSON');

  // Phone-width GM console: the row's buttons fit without sideways scroll.
  await gm.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('table').scrollIntoViewIfNeeded();
  const overflow = await gm.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await panel.screenshot({ path: path.join(shots, 'gm-session-window-390x844.png') });

  // A player's browser cannot fetch a report, and none reached its socket.
  const status = await phone.evaluate(
    async (url) => (await fetch(url)).status,
    `${server.url}/api/gm/session-report?n=1`,
  );
  expect(status).toBe(403);
  expect(phoneWatch.frames.join('\n')).not.toContain(REASON);
  expect(phoneWatch.errors.filter((e) => !e.includes('403'))).toEqual([]);
  expect(gmWatch.errors).toEqual([]);
  await Promise.all([context.close(), phone.close()]);
});

test('without a secure context the copy falls back to the legacy copy command', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const gm = await context.newPage();
  const gmWatch = watch(gm);
  // A GM on a LAN-IP origin over http: no secure context and no async
  // clipboard. Count the legacy copy commands.
  await gm.addInitScript(() => {
    const g = globalThis as unknown as {
      isSecureContext: boolean;
      navigator: object;
      document: { execCommand: (c: string) => boolean };
      legacyCopies: number;
    };
    Object.defineProperty(g, 'isSecureContext', { value: false });
    Object.defineProperty(g.navigator, 'clipboard', { value: undefined });
    g.legacyCopies = 0;
    const real = g.document.execCommand.bind(g.document);
    g.document.execCommand = (c: string) => {
      if (c === 'copy') g.legacyCopies++;
      return real(c);
    };
  });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  const panel = gm.locator('section[aria-labelledby="session-heading"]');
  const row = panel.getByRole('table').getByRole('row').nth(1);
  await row.getByRole('button', { name: 'Copy session 1 report for Claude' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Session 1 report copied: paste it into Claude',
  );
  expect(
    await gm.evaluate(() => (globalThis as unknown as { legacyCopies: number }).legacyCopies),
  ).toBe(1);
  // Read the clipboard from a normal page in the same browser.
  const reader = await context.newPage();
  await reader.goto(server.url);
  expect(await clipboard(reader)).toMatch(/^# Session 1 report: Report Test$/m);
  expect(gmWatch.errors).toEqual([]);
  await context.close();
});

test('when every copy is refused the report is shown selected to copy by hand', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmWatch = watch(gm);
  await gm.addInitScript(() => {
    const g = globalThis as unknown as {
      isSecureContext: boolean;
      navigator: object;
      document: { execCommand: (c: string) => boolean };
    };
    Object.defineProperty(g, 'isSecureContext', { value: false });
    Object.defineProperty(g.navigator, 'clipboard', { value: undefined });
    g.document.execCommand = () => false;
  });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  const panel = gm.locator('section[aria-labelledby="session-heading"]');
  const row = panel.getByRole('table').getByRole('row').nth(1);
  await row.getByRole('button', { name: 'Copy session 1 report for Claude' }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    'This browser blocked the copy: select the report below and copy it.',
  );
  const area = panel.getByRole('textbox', { name: 'Session 1 report', exact: true });
  await expect(area).toHaveValue(/^# Session 1 report: Report Test$/m);
  const selected = await area.evaluate((el) => {
    const t = el as unknown as { selectionStart: number; selectionEnd: number; value: string };
    return t.selectionEnd - t.selectionStart === t.value.length;
  });
  expect(selected).toBe(true);
  await panel.screenshot({ path: path.join(shots, 'gm-session-manual-copy-1366x768.png') });
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(area).toHaveCount(0);
  expect(gmWatch.errors).toEqual([]);
  await gm.close();
});
