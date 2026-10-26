import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Helpers for the desktop wrapper (ROADMAP MS.5), pure except machineIdFor. Kept free of Electron
 * so they unit-test in plain Node.
 */

export const DEFAULT_DESKTOP_PORT = 30333;

/**
 * The GM window's URL: the key rides in the fragment, never sent to the server
 * (D48). 127.0.0.1, not localhost: the server listens on IPv4 and Windows may
 * resolve localhost to ::1 first.
 */
export function gmWindowUrl(port: number, gmKey: string): string {
  return `http://127.0.0.1:${port}/gm#key=${encodeURIComponent(gmKey)}`;
}

/** Where the built web app lives: inside the app's resources when packaged, beside the repo otherwise. */
export function webRootFor(isPackaged: boolean, resourcesPath: string, bundleDir: string): string {
  return isPackaged
    ? path.join(resourcesPath, 'web')
    : path.resolve(bundleDir, '..', '..', 'web', 'dist');
}

/**
 * MC.5 (D236): the packaged app's speech engine. electron-builder copies
 * sherpa-onnx-node and this platform's native package to
 * `resources/speech/node_modules`, outside the asar, where Node can load the
 * addon; the bundle keeps the package external.
 */
export function speechPackageDir(resourcesPath: string): string {
  return path.join(resourcesPath, 'speech', 'node_modules');
}

/**
 * Where the packaged speech engine must sit for this platform (MC.5 review
 * M6): the JS package and the native addon that sherpa-onnx-node loads from
 * its sibling `sherpa-onnx-<platform>-<arch>` package ('win' for win32).
 */
export function packagedSpeechFiles(
  resourcesPath: string,
  platform: string = process.platform,
  arch: string = process.arch,
): { packageDir: string; addon: string } {
  const dir = speechPackageDir(resourcesPath);
  const os = platform === 'win32' ? 'win' : platform;
  return {
    packageDir: path.join(dir, 'sherpa-onnx-node'),
    addon: path.join(dir, `sherpa-onnx-${os}-${arch}`, 'sherpa-onnx.node'),
  };
}

export function packagedSpeechLoad(resourcesPath: string): () => Promise<unknown> {
  const require = createRequire(path.join(speechPackageDir(resourcesPath), 'index.js'));
  // async: a missing package rejects (the model reports it) rather than throwing.
  return async () => require('sherpa-onnx-node') as unknown;
}

/** Campaign data in the OS app-data folder (e.g. %APPDATA%/The System/data). */
/**
 * This install's machine id (campaign locks, D73): read from
 * `<userData>/machine-id`, created with a random UUID the first time.
 */
export function machineIdFor(userData: string, newId: () => string = randomUUID): string {
  const file = path.join(userData, 'machine-id');
  try {
    const id = readFileSync(file, 'utf8').trim();
    if (/^[\w-]{8,100}$/.test(id)) return id;
  } catch {
    // Missing or unreadable: make a new one.
  }
  const id = newId();
  mkdirSync(userData, { recursive: true });
  writeFileSync(file, `${id}\n`);
  return id;
}

export function dataDirFor(userData: string): string {
  return path.join(userData, 'data');
}

/**
 * Port to listen on. THE_SYSTEM_PORT exists for tests and for a GM whose
 * 30333 is taken; anything invalid falls back to the default.
 */
export function desktopPort(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env['THE_SYSTEM_PORT'];
  if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_DESKTOP_PORT;
  const port = Number(raw);
  return port <= 65535 ? port : DEFAULT_DESKTOP_PORT;
}

/** Only the local server's own pages may load in the GM window. */
export function isOwnPage(url: string, port: number): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
      Number(u.port) === port
    );
  } catch {
    return false;
  }
}

/** Human message for a failed start (most often the port is taken). */
export function startErrorMessage(error: unknown, port: number): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'EADDRINUSE' || code === 'EACCES') {
    const last = port === 0 ? 0 : Math.min(65535, port + PORT_TRIES - 1);
    return `Ports ${port}–${last} are all in use or blocked. Close the program using them (or another copy of The System running in a terminal) and try again.`;
  }
  return `The System could not start: ${error instanceof Error ? error.message : String(error)}`;
}

/** How many ports after the first one a desktop start tries (MS.7). */
export const PORT_TRIES = 20;

/**
 * Listen errors that mean "this port, not this app": another program holds it
 * (EADDRINUSE), or Windows reserved it (EACCES, e.g. Hyper-V port exclusions).
 */
export function isPortUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}

/**
 * Starts on `firstPort`, or on the next port that is free when it is taken
 * (MS.7). Port 0 (any free port, tests) is tried once. Other errors are thrown
 * at once; after the last try the first port's error is thrown.
 */
export async function startOnFreePort<T>(
  firstPort: number,
  start: (port: number) => Promise<T>,
  tries: number = PORT_TRIES,
): Promise<{ value: T; port: number; fellBack: boolean }> {
  const last = firstPort === 0 ? 0 : Math.min(65535, firstPort + tries - 1);
  let firstError: unknown = null;
  for (let port = firstPort; port <= last; port++) {
    try {
      return { value: await start(port), port, fellBack: port !== firstPort };
    } catch (error) {
      if (!isPortUnavailable(error)) throw error;
      firstError ??= error;
    }
  }
  throw firstError;
}

/** What the GM sees when the usual port was taken (MS.7). */
export function portFallbackMessage(firstPort: number, port: number): string {
  return `Port ${firstPort} is used by another program, so The System is using port ${port} this time. Players join at the address and QR code shown in the console.`;
}

/** The splash shown while the server starts (MS.7): self-contained, no network, no scripts. */
export const SPLASH_TITLE = 'Starting The System…';
export function splashHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${SPLASH_TITLE}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%;background:#0b0f17;color:#e6edf7;font:16px system-ui,sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;user-select:none}
h1{margin:0;font-size:20px;font-weight:600;letter-spacing:.02em}
p{margin:0;color:#8b98ad;font-size:14px}
.bar{width:180px;height:4px;border-radius:2px;background:#1c2433;overflow:hidden}
.bar i{display:block;width:40%;height:100%;background:#5fa8ff;border-radius:2px;animation:s 1.2s ease-in-out infinite}
@keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}</style></head>
<body><h1>${SPLASH_TITLE}</h1><div class="bar" role="progressbar" aria-label="Starting"><i></i></div><p>The GM console opens in a moment.</p></body></html>`;
}

/** data: URL for the splash. */
export function splashUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`;
}

/**
 * MC.5 (DESIGN §11 "Listening"): the only permission the app ever grants is
 * the microphone, to the GM window, on its own console page. Video, screen
 * capture and every other permission stay refused.
 */
export function allowsPermission(
  fromGmWindow: boolean,
  permission: string,
  mediaTypes: readonly string[] | undefined,
  url: string,
  port: number,
): boolean {
  if (!fromGmWindow || permission !== 'media' || !isOwnPage(url, port)) return false;
  const types = mediaTypes ?? [];
  return types.length > 0 && types.every((t) => t === 'audio');
}
