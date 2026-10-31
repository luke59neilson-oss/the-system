import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, chromium, expect, test } from '@playwright/test';
import electronPath from 'electron';
import { holders, killTree } from './process-tree';
import { gmWindow } from './windows';

// MS.5 smoke: the real Electron app starts the server, opens the GM console
// with the key injected, shows the join URL + QR, and keeps data in the
// app-data folder; a plain browser cannot act as GM.
// M10.1: quitting leaves a "-quit" backup of the campaign, and the join panel
// carries firewall help for the computer's OS (Windows here, via a test-only
// override, since this workspace runs Linux).

// This package is CommonJS (Electron main), so Playwright loads the spec as CJS.
const root = path.resolve(__dirname, '..');
const localChromium = '/opt/pw-browsers/chromium';
// After a forced kill, Electron's helper processes can still be writing to
// the profile for a moment, so removing it may hit ENOTEMPTY (CI, 0d6d996e).
// Cleanup retries; no test assertion is retried. The forced-kill test also
// kills the whole tree and waits for it before cleanup (QF.32).
const CLEANUP = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 } as const;

test('double-click start: server up, GM window connected with the key', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-desktop-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'the-system-profile-'));
  const app = await electron.launch({
    args: [path.join(root, 'dist', 'main.cjs'), '--no-sandbox'],
    env: {
      ...process.env,
      THE_SYSTEM_PORT: '0',
      THE_SYSTEM_DATA_DIR: dataDir,
      THE_SYSTEM_USER_DATA_DIR: userData,
      THE_SYSTEM_TEST_PLATFORM: 'win32',
    },
  });
  // Everything the app prints, to prove the GM key never appears in it (QF.6).
  let printed = '';
  app.process().stdout?.on('data', (chunk: Buffer) => (printed += chunk.toString()));
  app.process().stderr?.on('data', (chunk: Buffer) => (printed += chunk.toString()));
  try {
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    const gmKey = await gm.evaluate(() => sessionStorage.getItem('the-system.gmKey'));
    expect(gmKey).toMatch(/^.{16,}$/);
    // The key was moved out of the address bar.
    expect(gm.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/gm$/);
    const port = Number(new URL(gm.url()).port);
    await expect(gm.getByRole('heading', { name: 'New campaign' })).toBeVisible();
    await gm.getByLabel('Campaign name').fill('Desktop smoke');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await expect(gm.getByRole('heading', { name: /Desktop smoke/ })).toBeVisible();
    await expect(gm.getByTestId('join-url')).toHaveText(/^http:\/\/.+:\d+\/?$/);
    await expect(gm.getByRole('img', { name: /QR code/ })).toBeVisible();
    await expect(gm.getByTestId('connect-help').locator('summary')).toHaveText(
      'Players can’t connect? Check Windows Firewall',
    );
    await gm.setViewportSize({ width: 1366, height: 768 });
    await gm.screenshot({
      path: path.resolve(root, '../../docs/screens/MS.5/gm-desktop-1366x768.png'),
    });

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(existsSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'))).toBe(true);

    // A plain browser on the same machine gets no GM powers without the key.
    const browser = await chromium.launch(
      existsSync(localChromium) ? { executablePath: localChromium } : {},
    );
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/gm`);
      await expect(page.getByRole('heading', { name: 'GM key needed' })).toBeVisible();
      const api = await page.request.get(`http://localhost:${port}/api/gm/export`);
      expect(api.status()).toBe(403);
    } finally {
      await browser.close();
    }

    // The app printed its ready line, and never the key.
    await expect.poll(() => printed).toContain('desktop ready on port');
    expect(printed).not.toContain(gmKey ?? '');
    expect(printed).not.toContain(encodeURIComponent(gmKey ?? ''));
    // M10.1: quitting backs the campaign up first.
    await app.close();
    const backups = path.join(dataDir, 'campaigns', 'main', 'backups');
    const made = readdirSync(backups).filter((name) => name.endsWith('-quit'));
    expect(made).toHaveLength(1);
    const copy = readFileSync(path.join(backups, made[0] ?? '', 'events.jsonl'), 'utf8');
    expect(copy).toContain('Desktop smoke');
    expect(copy).toBe(
      readFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), 'utf8'),
    );
  } finally {
    await app.close();
    rmSync(dataDir, CLEANUP);
    rmSync(userData, CLEANUP);
  }
});

// M10.A review: an installer upgrading the app closes the window politely,
// then force-kills it about a second later, before anyone answers the quit
// question. The quit backup must already exist by then.
test('a polite close then a forced kill (an installer upgrading) still leaves the quit backup', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-desktop-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'the-system-profile-'));
  const app = await electron.launch({
    args: [path.join(root, 'dist', 'main.cjs'), '--no-sandbox'],
    env: {
      ...process.env,
      THE_SYSTEM_PORT: '0',
      THE_SYSTEM_DATA_DIR: dataDir,
      THE_SYSTEM_USER_DATA_DIR: userData,
    },
  });
  // Captured once: Playwright disposes the app object once the process dies.
  const proc = app.process();
  const backups = path.join(dataDir, 'campaigns', 'main', 'backups');
  const quitCopies = () =>
    existsSync(backups) ? readdirSync(backups).filter((name) => name.endsWith('-quit')) : [];
  try {
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    await gm.getByLabel('Campaign name').fill('Upgrade smoke');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await expect(gm.getByRole('heading', { name: /Upgrade smoke/ })).toBeVisible();
    expect(quitCopies()).toEqual([]);
    // The polite close: the app asks "Quit The System?" and keeps running.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('/gm'))
        ?.close();
    });
    await expect.poll(quitCopies).toHaveLength(1);
    // A second polite close while the question is open asks nothing new.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('/gm'))
        ?.close();
    });
    // The forced kill, before anyone answers. The whole process tree goes,
    // and is gone before cleanup touches the profile (QF.32).
    expect(await killTree(proc)).toEqual([]);
    expect(holders(userData)).toEqual([]);
    const made = quitCopies();
    expect(made).toHaveLength(1);
    const copy = readFileSync(path.join(backups, made[0] ?? '', 'events.jsonl'), 'utf8');
    expect(copy).toContain('Upgrade smoke');
  } finally {
    if (proc.exitCode === null && proc.signalCode === null) await app.close();
    rmSync(dataDir, CLEANUP);
    rmSync(userData, CLEANUP);
  }
});

// QF.45: the Windows installer launches the installed app with
// --quit-for-update before replacing it. The running copy quits the normal
// way: no question, the quit backup made, the campaign LOCK released.
test('a second launch with --quit-for-update makes the running app quit cleanly', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-desktop-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'the-system-profile-'));
  const env = {
    ...process.env,
    THE_SYSTEM_PORT: '0',
    THE_SYSTEM_DATA_DIR: dataDir,
    THE_SYSTEM_USER_DATA_DIR: userData,
  };
  const app = await electron.launch({
    args: [path.join(root, 'dist', 'main.cjs'), '--no-sandbox'],
    env,
  });
  const proc = app.process();
  const campaign = path.join(dataDir, 'campaigns', 'main');
  const backups = path.join(campaign, 'backups');
  try {
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    await gm.getByLabel('Campaign name').fill('Update smoke');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await expect(gm.getByRole('heading', { name: /Update smoke/ })).toBeVisible();
    expect(existsSync(path.join(campaign, 'LOCK'))).toBe(true);
    const exited = new Promise<number | null>((resolve) => proc.once('exit', resolve));
    const started = Date.now();
    // What the installer runs: the same app, a second time, with the flag.
    const second = spawn(
      electronPath as unknown as string,
      [path.join(root, 'dist', 'main.cjs'), '--no-sandbox', '--quit-for-update'],
      { env, stdio: 'ignore' },
    );
    await exited;
    expect(Date.now() - started).toBeLessThan(8_000);
    await new Promise<void>((resolve) => {
      if (second.exitCode !== null || second.signalCode !== null) resolve();
      else second.once('exit', () => resolve());
    });
    const made = readdirSync(backups).filter((name) => name.endsWith('-quit'));
    expect(made).toHaveLength(1);
    expect(readFileSync(path.join(backups, made[0] ?? '', 'events.jsonl'), 'utf8')).toContain(
      'Update smoke',
    );
    expect(existsSync(path.join(campaign, 'LOCK'))).toBe(false);
  } finally {
    if (proc.exitCode === null && proc.signalCode === null) await app.close();
    rmSync(dataDir, CLEANUP);
    rmSync(userData, CLEANUP);
  }
});
