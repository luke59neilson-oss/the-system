import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { startApp, type RunningApp } from '../../server/src/app';
import { newGmKey } from '../../server/src/security';
import {
  dataDirFor,
  desktopPort,
  gmWindowUrl,
  isOwnPage,
  startErrorMessage,
  webRootFor,
} from './launch';

/**
 * Desktop wrapper (ROADMAP MS.5, pulls M10.1 forward): double-click starts the
 * LAN server and opens the GM console with a fresh GM key injected; campaign
 * data lives in the OS app-data folder; one instance at a time.
 */

let running: RunningApp | null = null;
let gmWindow: BrowserWindow | null = null;
/** Set once quitting starts, so closing the window no longer asks. */
let quitting = false;
/** A stuck close (e.g. a client that never finishes the WebSocket close) must not hang Quit. */
const QUIT_TIMEOUT_MS = 5_000;

function openGmWindow(server: RunningApp): void {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    title: 'The System · GM',
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
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
  win.on('close', (event) => {
    if (quitting) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Keep running', 'Quit The System'],
      defaultId: 0,
      cancelId: 0,
      message: 'Quit The System?',
      detail: 'Every player screen disconnects until you start it again.',
    });
    if (choice !== 1) event.preventDefault();
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
  void win.loadURL(gmWindowUrl(server.port, server.gmKey));
}

async function start(): Promise<void> {
  const port = desktopPort(process.env);
  try {
    running = await startApp({
      port,
      host: '0.0.0.0',
      webRoot: webRootFor(app.isPackaged, process.resourcesPath, __dirname),
      dataDir: process.env['THE_SYSTEM_DATA_DIR'] ?? dataDirFor(app.getPath('userData')),
      gmKey: newGmKey(),
    });
  } catch (error) {
    dialog.showErrorBox('The System', startErrorMessage(error, port));
    app.exit(1);
    return;
  }
  // For scripts and the smoke test; the key is never printed.
  console.log(`The System desktop ready on port ${running.port}`);
  openGmWindow(running);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (gmWindow) {
      if (gmWindow.isMinimized()) gmWindow.restore();
      gmWindow.focus();
    } else if (running) {
      openGmWindow(running);
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (!gmWindow && running) openGmWindow(running);
  });
  app.on('before-quit', (event) => {
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
    if (app.isPackaged) Menu.setApplicationMenu(null);
    return start();
  });
}
