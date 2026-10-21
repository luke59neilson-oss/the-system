import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

// MS.6 smoke: the packaged app (not the dev bundle) starts its server from the
// app resources, serves the bundled web build and opens a connected GM window.

const exe = process.env['THE_SYSTEM_PACKAGED_EXE'];

test('packaged app: server up, web build served, GM window connected', async () => {
  if (!exe || !existsSync(exe)) {
    throw new Error(`Set THE_SYSTEM_PACKAGED_EXE to the packaged executable (got ${String(exe)})`);
  }
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-packaged-'));
  const app = await electron.launch({
    executablePath: exe,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: { ...process.env, THE_SYSTEM_PORT: '0', THE_SYSTEM_DATA_DIR: dataDir },
  });
  try {
    expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
    const gm = await app.firstWindow();
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    expect(gm.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/gm$/);
    const port = Number(new URL(gm.url()).port);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<div id="root"');
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
