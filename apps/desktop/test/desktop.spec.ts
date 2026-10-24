import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, chromium, expect, test } from '@playwright/test';
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
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
