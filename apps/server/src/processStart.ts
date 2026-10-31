import { execFileSync } from 'node:child_process';

let ownStart: number | undefined;

/**
 * When this process started (epoch ms), or null when it cannot be read.
 * Written into the campaign LOCK so a later start can tell the process that
 * wrote it from another one that was given the same pid (QF.41). Read the
 * same way a later start reads it (`processStart`), so the two agree
 * exactly: `process.uptime()` stops while a laptop sleeps, and local-time
 * parsing can shift at a DST change, but the same text parses to the same
 * number. Cached once read (on Windows it costs a PowerShell start); a
 * failed read is retried next time, and the LOCK is then written without a
 * start time, which later starts treat like an older lock (live pid: held).
 */
export function ownProcessStart(
  read: (pid: number) => number | null = processStart,
): number | null {
  ownStart ??= read(process.pid) ?? undefined;
  return ownStart ?? null;
}

/**
 * When process `pid` started (epoch ms), or null when that cannot be read
 * (no such process, no permission, or no tool to ask). Only called when a
 * LOCK names a live process, so its few hundred milliseconds are rare.
 */
export function processStart(pid: number): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
        ],
        {
          encoding: 'utf8',
          timeout: 10_000,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );
      return parseStart(out);
    }
    // macOS and Linux: `ps` prints e.g. "Sat Oct 31 07:08:12 2026" in local time.
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 5_000,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseStart(out);
  } catch {
    return null;
  }
}

/** Parses a start time printed by `ps` or PowerShell; null when it is not one. */
export function parseStart(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const ms = Date.parse(trimmed.replace(/\s+/g, ' '));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * How far apart a LOCK's recorded start and the live process's start may be
 * and still be the same process. Both are normally read the same way and
 * equal; the margin is only slack. A reused pid belongs to a process that started after the holder
 * died, so it is far outside this.
 */
export const START_TOLERANCE_MS = 30_000;
