import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';

// QF.32: a forced kill of Electron's main process leaves its helpers (zygote,
// GPU, network, renderers) running for a moment, still writing the profile,
// so removing the profile raced them and hit ENOTEMPTY in CI. The test now
// kills the whole tree and waits for every member to be gone before it
// cleans up. Linux reads /proc; elsewhere only the main process is known.

/** Every live descendant of `root`, found by walking parent links in /proc. */
export function descendants(root: number): number[] {
  if (!existsSync('/proc')) return [];
  const parents = new Map<number, number>();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      // Field 4 of /proc/<pid>/stat, after the ")" that ends the command name.
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parents.set(Number(name), Number(fields[1]));
    } catch {
      // The process ended while we looked.
    }
  }
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const [pid, ppid] of parents) {
      if (ppid === parent && !found.includes(pid)) {
        found.push(pid);
        queue.push(pid);
      }
    }
  }
  return found;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // A zombie still answers signal 0 but holds no files open.
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
  } catch {
    return false;
  }
}

/**
 * Every process with a file open under `dir` (its open descriptors or its
 * working directory), so a test can prove nothing is still writing there.
 */
export function holders(dir: string): number[] {
  if (!existsSync('/proc')) return [];
  const found: number[] = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      const links = [
        `/proc/${name}/cwd`,
        ...readdirSync(`/proc/${name}/fd`).map((fd) => `/proc/${name}/fd/${fd}`),
      ];
      if (
        links.some((link) => {
          try {
            const target = readlinkSync(link);
            return target === dir || target.startsWith(`${dir}/`);
          } catch {
            return false;
          }
        })
      ) {
        found.push(Number(name));
      }
    } catch {
      // Ended while we looked, or not ours to read.
    }
  }
  return found;
}

function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(pid, sig);
  } catch {
    // Already gone.
  }
}

/**
 * SIGKILL `proc` and every process it started, then wait (up to `timeoutMs`)
 * until all of them are gone. Returns the pids still alive at the deadline,
 * so a caller can fail loudly instead of racing them.
 *
 * The tree is frozen first (SIGSTOP, top down, re-walked until no new member
 * appears), so nothing can fork a helper between the snapshot and the kill.
 */
export async function killTree(proc: ChildProcess, timeoutMs = 10_000): Promise<number[]> {
  const pid = proc.pid;
  if (pid === undefined) return [];
  const exited =
    proc.exitCode !== null || proc.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  signal(pid, 'SIGSTOP');
  const frozen = new Set<number>();
  for (;;) {
    const fresh = descendants(pid).filter((helper) => !frozen.has(helper));
    if (fresh.length === 0) break;
    for (const helper of fresh) {
      signal(helper, 'SIGSTOP');
      frozen.add(helper);
    }
  }
  const all = [...frozen];
  signal(pid, 'SIGKILL');
  for (const helper of all) signal(helper, 'SIGKILL');
  await exited;
  const deadline = Date.now() + timeoutMs;
  let left = all.filter(alive);
  while (left.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    left = left.filter(alive);
  }
  return left;
}
