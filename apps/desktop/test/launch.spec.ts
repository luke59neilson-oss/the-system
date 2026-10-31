import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { gmWindow, TEST_SWITCHES } from './windows';

// MS.7 launch polish: the splash comes up at once, a second launch focuses
// the first instead of erroring, and a taken port moves to the next free one.

const root = path.resolve(__dirname, '..');
const main = path.join(root, 'dist', 'main.cjs');
const electronBin = createRequire(__filename)('electron') as string;
const shots = path.resolve(root, '../../docs/screens/MS.7');

function profile(): { dataDir: string; userData: string; cleanup: () => void } {
  const base = mkdtempSync(path.join(tmpdir(), 'the-system-ms7-'));
  const dataDir = path.join(base, 'data');
  const userData = path.join(base, 'profile');
  mkdirSync(userData);
  return { dataDir, userData, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

async function launch(env: Record<string, string>): Promise<ElectronApplication> {
  return electron.launch({
    args: [main, ...TEST_SWITCHES],
    env: { ...(process.env as Record<string, string>), ...env },
  });
}

test('a splash says "Starting The System…" at once, then hands over to the GM console', async () => {
  // QF.59: a warm-up launch first, so the splash bound measures our code and
  // not the first Electron start on a cold runner (disk cache, fonts).
  const warm = profile();
  try {
    const warmApp = await launch({
      THE_SYSTEM_PORT: '0',
      THE_SYSTEM_DATA_DIR: warm.dataDir,
      THE_SYSTEM_USER_DATA_DIR: warm.userData,
    });
    try {
      // Not held: a held start makes close() wait out the 30 s hold.
      await gmWindow(warmApp);
    } finally {
      await warmApp.close();
    }
  } finally {
    warm.cleanup();
  }
  const p = profile();
  const app = await launch({
    THE_SYSTEM_PORT: '0',
    THE_SYSTEM_DATA_DIR: p.dataDir,
    THE_SYSTEM_USER_DATA_DIR: p.userData,
    // QF.14: the hand-over waits until this test releases it, so the
    // splash cannot close under the screenshot on a slow runner.
    THE_SYSTEM_TEST_HOLD_START: '1',
  });
  try {
    const splash = await app.firstWindow();
    await expect(splash.getByRole('heading', { name: 'Starting The System…' })).toBeVisible();
    expect(await splash.title()).toBe('Starting The System…');
    const { afterStart, afterReady } = await app.evaluate(() => {
      const g = globalThis as {
        theSystemSplashShownAfterMs?: number;
        theSystemSplashShownAfterReadyMs?: number;
      };
      return {
        afterStart: g.theSystemSplashShownAfterMs,
        afterReady: g.theSystemSplashShownAfterReadyMs,
      };
    });
    console.log(
      `splash shown ${String(afterReady)} ms after app-ready, ${String(afterStart)} ms after the process started`,
    );
    // QF.8: the bound covers our code (app-ready → splash), not Electron's own
    // start-up, which depends on the machine's load (CI saw 1020–1085 ms).
    expect(afterReady).toBeGreaterThanOrEqual(0);
    expect(afterReady).toBeLessThan(1000);
    // The server is held, so no GM window is visible yet.
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.isVisible())
          .map((w) => w.getTitle()),
      ),
    ).toEqual(['Starting The System…']);
    // The screenshot is a reviewer artifact, not a behaviour check: the
    // assertions above pin what the splash shows. It is taken where the
    // committed screenshots are made (build sessions, locally), not on CI:
    // CI's runners could not capture this JavaScript-free window reliably
    // under xvfb (CDP "Unable to capture screenshot", Electron capturePage
    // UnknownVizError, and no capture within 15 s; 2026-10-25/26), and CI
    // screenshots are never committed.
    if (!process.env['CI']) {
      mkdirSync(shots, { recursive: true });
      await splash.screenshot({ path: path.join(shots, 'splash.png') });
    }
    // Release the hand-over once the server holds it; before that the hook
    // does not exist yet.
    await expect
      .poll(
        () =>
          app.evaluate(() => {
            const g = globalThis as { theSystemReleaseStart?: () => void };
            if (!g.theSystemReleaseStart) return false;
            g.theSystemReleaseStart();
            return true;
          }),
        { timeout: 30_000 },
      )
      .toBe(true);

    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    // QF.59: the app's own fallback reveal is 10 s, so wait longer than it;
    // then check the window appeared because the console painted, not
    // because the fallback fired.
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), {
        timeout: 15_000,
      })
      .toBe(1);
    expect(
      await app.evaluate(
        () => (globalThis as { theSystemRevealReason?: string }).theSystemRevealReason,
      ),
    ).toBe('ready-to-show');
    expect(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
    ).toBe(true);
  } finally {
    await app.close();
    p.cleanup();
  }
});

test('a second launch exits and brings the running window to the front', async () => {
  const p = profile();
  const env = {
    THE_SYSTEM_PORT: '0',
    THE_SYSTEM_DATA_DIR: p.dataDir,
    THE_SYSTEM_USER_DATA_DIR: p.userData,
  };
  const app = await launch(env);
  try {
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    // Push the GM window back: hide it, as if behind other windows.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
    const heard = app.evaluate(
      ({ app: a }) =>
        new Promise<boolean>((resolve) => a.once('second-instance', () => resolve(true))),
    );
    const second = spawn(electronBin, [main, ...TEST_SWITCHES], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('second instance did not exit')), 20_000);
      second.on('exit', (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    expect(code).toBe(0);
    expect(await heard).toBe(true);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          return w ? { visible: w.isVisible(), focused: w.isFocused() } : null;
        }),
      )
      .toEqual({ visible: true, focused: true });
    // Still one window, still connected: no second server, no error.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
  } finally {
    await app.close();
    p.cleanup();
  }
});

async function holdFreePort(): Promise<{ server: Server; port: number }> {
  // A port whose next neighbour is free too, held by "another program".
  for (;;) {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
    const port = (server.address() as { port: number }).port;
    if (port >= 65000) {
      server.close();
      continue;
    }
    const probe = createServer();
    const free = await new Promise<boolean>((r) => {
      probe.once('error', () => r(false));
      probe.listen(port + 1, '0.0.0.0', () => r(true));
    });
    if (free) {
      await new Promise((r) => probe.close(r));
      return { server, port };
    }
    server.close();
  }
}

test('a port taken by another program moves to the next free one and says so', async () => {
  const p = profile();
  const held = await holdFreePort();
  const app = await launch({
    THE_SYSTEM_PORT: String(held.port),
    THE_SYSTEM_DATA_DIR: p.dataDir,
    THE_SYSTEM_USER_DATA_DIR: p.userData,
  });
  try {
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
    const port = Number(new URL(gm.url()).port);
    expect(port).toBe(held.port + 1);
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as { theSystemNotice?: string }).theSystemNotice ?? ''),
      )
      .toContain(
        `Port ${held.port} is used by another program, so The System is using port ${port}`,
      );
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    // The join address players see carries the new port.
    await gm.getByLabel('Campaign name').fill('Busy port');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await expect(gm.getByTestId('join-url')).toHaveText(new RegExp(`:${port}/?$`));
  } finally {
    await app.close();
    held.server.close();
    p.cleanup();
  }
});

function exitOf(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('second instance did not exit')), 20_000);
    child.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
}

test('a second launch while starting exits and brings the splash forward', async () => {
  const p = profile();
  const env = {
    THE_SYSTEM_PORT: '0',
    THE_SYSTEM_DATA_DIR: p.dataDir,
    THE_SYSTEM_USER_DATA_DIR: p.userData,
    THE_SYSTEM_TEST_START_DELAY_MS: '4000',
  };
  const app = await launch(env);
  try {
    const splash = await app.firstWindow();
    await expect(splash.getByRole('heading', { name: 'Starting The System…' })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
    const second = spawn(electronBin, [main, ...TEST_SWITCHES], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    expect(await exitOf(second)).toBe(0);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .filter((w) => w.isVisible())
            .map((w) => ({ title: w.getTitle(), focused: w.isFocused() })),
        ),
      )
      .toEqual([{ title: 'Starting The System…', focused: true }]);
    // The start carries on and the console still opens.
    const gm = await gmWindow(app);
    await expect(gm.getByTestId('connection')).toHaveText('Connected');
  } finally {
    await app.close();
    p.cleanup();
  }
});

test('closing the splash while starting quits and closes the campaign it opened', async () => {
  const p = profile();
  const app = await launch({
    THE_SYSTEM_PORT: '0',
    THE_SYSTEM_DATA_DIR: p.dataDir,
    THE_SYSTEM_USER_DATA_DIR: p.userData,
    THE_SYSTEM_TEST_START_DELAY_MS: '3000',
  });
  try {
    const splash = await app.firstWindow();
    await expect(splash.getByRole('heading', { name: 'Starting The System…' })).toBeVisible();
    const campaign = path.join(p.dataDir, 'campaigns', 'main');
    // The server is up and holds the campaign lock while the start is held.
    await expect.poll(() => existsSync(path.join(campaign, 'LOCK'))).toBe(true);
    const exited = new Promise<void>((r) => app.process().once('exit', () => r()));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    // Closed properly: the lock is released and no GM window ever opened.
    expect(existsSync(path.join(campaign, 'LOCK'))).toBe(false);
    expect(existsSync(path.join(campaign, 'events.jsonl'))).toBe(true);
  } finally {
    await app.close().catch(() => undefined);
    p.cleanup();
  }
});
