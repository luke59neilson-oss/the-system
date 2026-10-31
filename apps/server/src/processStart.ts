import { execFileSync } from 'node:child_process';

/**
 * When this process started (epoch ms). Written into the campaign LOCK so a
 * later start can tell the process that wrote it from another one that was
 * given the same pid (QF.41).
 */
export function ownProcessStart(): number {
  return Math.round(Date.now() - process.uptime() * 1000);
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
 * and still be the same process: `ps` rounds to the second, and the recorded
 * time is measured after the runtime starts. A reused pid belongs to a
 * process that started after the holder died, so it is far outside this.
 */
export const START_TOLERANCE_MS = 30_000;
