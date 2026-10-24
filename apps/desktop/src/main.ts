import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { startApp, type RunningApp } from '../../server/src/app';
import { newGmKey } from '../../server/src/security';
import {
  dataDirFor,
  machineIdFor,
  desktopPort,
  gmWindowUrl,
  isOwnPage,
  portFallbackMessage,
  SPLASH_TITLE,
  splashUrl,
  startErrorMessage,
  startOnFreePort,
  webRootFor,
} from './launch';

/**
 * Desktop wrapper (ROADMAP MS.5, pulls M10.1 forward): double-click starts the
 * LAN server and opens the GM console with a fresh GM key injected; campaign
 * data lives in the OS app-data folder; one instance at a time.
 * MS.7: a splash appears at once, a second launch focuses the first, and a
 * taken port moves to the next free one.
 * M10.1: quitting backs the campaign up first; the join panel carries
 * firewall help for this computer's OS.
 */

// Tests only: a separate profile so test instances never meet a real one (the
// single-instance lock is per userData folder).
const testUserData = process.env['THE_SYSTEM_USER_DATA_DIR'];
if (testUserData && !app.isPackaged) app.setPath('userData', testUserData);

function closeSplash(): void {
  const s = splash;
  splash = null;
  if (s && !s.isDestroyed()) s.destroy();
}

function showSplash(): void {
  const win = new BrowserWindow({
    width: 440,
    height: 220,
    title: SPLASH_TITLE,
    backgroundColor: '#0b0f17',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    center: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      devTools: false,
    },
  });
  splash = win;
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Closing the splash while starting means "never mind": quit.
  win.on('closed', () => {
    if (splash === win) {
      splash = null;
      if (!gmWindow) app.quit();
    }
  });
  void win.loadURL(splashUrl());
  // For the desktop test: how long after app-ready (our start-up code, QF.8)
  // and after the process started (includes Electron's own start-up) the
  // splash window was created and its page requested (not when it painted).
  const g = globalThis as {
    theSystemSplashShownAfterMs?: number;
    theSystemSplashShownAfterReadyMs?: number;
  };
  const now = process.uptime() * 1000;
  g.theSystemSplashShownAfterMs = Math.round(now);
  g.theSystemSplashShownAfterReadyMs = Math.round(now - readyAtMs);
}

/** Process uptime (ms) when Electron reported ready. */
let readyAtMs = 0;

let running: RunningApp | null = null;
let gmWindow: BrowserWindow | null = null;
/** "Starting The System…" (MS.7): up from app-ready until the GM console has loaded. */
let splash: BrowserWindow | null = null;
/** Set once quitting starts, so closing the window no longer asks. */
let quitting = false;
/** Windows log-off or shutdown: close without asking (the quit itself still backs up). */
let sessionEnding = false;
/** True while the server is starting: a quit then waits for start() to finish and close it. */
let starting = false;
/** A stuck close (e.g. a client that never finishes the WebSocket close) must not hang Quit. */
const QUIT_TIMEOUT_MS = 5_000;

function openGmWindow(server: RunningApp, notice: string | null = null): void {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    title: 'The System · GM',
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    // Shown once the console has painted, so the splash hands over without a blank window.
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The GM key sits in this window's sessionStorage; no DevTools in release builds.
      devTools: !app.isPackaged,
    },
  });
  gmWindow = win;
  // Closing the GM window quits the app and drops every player: ask first.
  // The dialog is async: the server shares this process and must keep serving
  // players while the question is open.
  // Windows log-off or shutdown: never hold it up with a question.
  // It only skips the question: before-quit still closes the server, so the
  // campaign is closed and backed up (M10.1 review).
  win.on('session-end', () => {
    sessionEnding = true;
  });
  let asking = false;
  win.on('close', (event) => {
    if (quitting || sessionEnding) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    void dialog
      .showMessageBox(win, {
        type: 'question',
        buttons: ['Keep running', 'Quit The System'],
        defaultId: 0,
        cancelId: 0,
        message: 'Quit The System?',
        detail: 'Every player screen disconnects until you start it again.',
      })
      .then(({ response }) => {
        asking = false;
        if (response === 1) app.quit();
      });
  });
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  // Links to anything but our own pages open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isOwnPage(url, server.port)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const keepOnOwnPages = (event: { preventDefault: () => void }, url: string) => {
    if (!isOwnPage(url, server.port)) event.preventDefault();
  };
  win.webContents.on('will-navigate', keepOnOwnPages);
  win.webContents.on('will-redirect', keepOnOwnPages);
  win.on('closed', () => {
    gmWindow = null;
  });
  let shown = false;
  const reveal = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
    closeSplash();
    if (notice) {
      (globalThis as { theSystemNotice?: string }).theSystemNotice = notice;
      void dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['OK'],
        message: 'The System is using another port',
        detail: notice,
      });
    }
  };
  win.once('ready-to-show', reveal);
  // A page that fails to load never fires ready-to-show: show the window anyway.
  win.webContents.once('did-fail-load', reveal);
  setTimeout(reveal, 10_000).unref();
  void win.loadURL(gmWindowUrl(server.port, server.gmKey));
}

async function start(): Promise<void> {
  const port = desktopPort(process.env);
  // Quit asked for before anything opened: nothing to close.
  if (quitting) {
    app.exit(0);
    return;
  }
  let notice: string | null = null;
  starting = true;
  try {
    const gmKey = newGmKey();
    const started = await startOnFreePort(port, (p) =>
      startApp({
        port: p,
        host: '0.0.0.0',
        webRoot: webRootFor(app.isPackaged, process.resourcesPath, __dirname),
        dataDir: process.env['THE_SYSTEM_DATA_DIR'] ?? dataDirFor(app.getPath('userData')),
        gmKey,
        machineId: machineIdFor(app.getPath('userData')),
        // M10.1: every quit leaves a copy of the campaign in its backups folder.
        backupOnClose: 'quit',
        // Tests only: show another OS's firewall help in the join panel.
        platform: (!app.isPackaged && process.env['THE_SYSTEM_TEST_PLATFORM']) || process.platform,
      }),
    );
    // Tests only: a slow start (server and campaign already open), so the
    // splash, and quitting or relaunching while starting, can be tested.
    const hold = Number(process.env['THE_SYSTEM_TEST_START_DELAY_MS'] ?? 0);
    if (!app.isPackaged && hold > 0) {
      await new Promise((r) => setTimeout(r, Math.min(hold, 30_000)));
    }
    // Tests only: hold the hand-over until the test releases it (or 30 s
    // pass), so a test can check the splash without racing it (QF.14).
    if (!app.isPackaged && process.env['THE_SYSTEM_TEST_HOLD_START'] === '1') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 30_000);
        (globalThis as { theSystemReleaseStart?: () => void }).theSystemReleaseStart = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    running = started.value;
    if (started.fellBack) notice = portFallbackMessage(port, started.port);
  } catch (error) {
    starting = false;
    if (quitting) {
      app.exit(0);
      return;
    }
    // The splash stays behind the error box; exit closes both.
    dialog.showErrorBox('The System', startErrorMessage(error, port));
    app.exit(1);
    return;
  }
  starting = false;
  // For scripts and the smoke test; the key is never printed.
  console.log(`The System desktop ready on port ${running.port}`);
  // Quit was asked for while starting: close what just started (campaign
  // files and lock included) instead of opening the console.
  if (quitting) {
    setTimeout(() => app.exit(0), QUIT_TIMEOUT_MS).unref();
    void running.close().finally(() => app.exit(0));
    return;
  }
  openGmWindow(running, notice);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (quitting) return;
    // Still starting: bring the splash forward instead.
    const target = gmWindow?.isVisible() ? gmWindow : (splash ?? gmWindow);
    if (target) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
    } else if (running) {
      openGmWindow(running);
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (!gmWindow && running && !quitting) openGmWindow(running);
  });
  app.on('before-quit', (event) => {
    // Mid-start: hold the exit; start() closes the server once it is up.
    if (starting && !running) {
      event.preventDefault();
      quitting = true;
      return;
    }
    if (quitting || !running) {
      quitting = true;
      return;
    }
    // Close the server (and its campaign files) before the process exits.
    event.preventDefault();
    quitting = true;
    setTimeout(() => app.exit(0), QUIT_TIMEOUT_MS).unref();
    void running.close().finally(() => app.quit());
  });
  void app.whenReady().then(() => {
    readyAtMs = process.uptime() * 1000;
    if (app.isPackaged) {
      // No View menu (DevTools/reload) in release builds; macOS keeps the app
      // and Edit menus so Cmd+C/V/Q still work.
      Menu.setApplicationMenu(
        process.platform === 'darwin'
          ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
          : null,
      );
    }
    showSplash();
    return start();
  });
}
