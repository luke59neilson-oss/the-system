import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  if (code === 'EADDRINUSE') {
    return `Port ${port} is already in use. Is The System already running (maybe in a terminal)? Close it and try again.`;
  }
  return `The System could not start: ${error instanceof Error ? error.message : String(error)}`;
}
