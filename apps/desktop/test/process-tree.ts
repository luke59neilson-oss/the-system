import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 * SIGKILL `proc` and every process it started, then wait (up to `timeoutMs`)
 * until all of them are gone. Returns the pids still alive at the deadline,
 * so a caller can fail loudly instead of racing them.
 */
export async function killTree(proc: ChildProcess, timeoutMs = 10_000): Promise<number[]> {
  const pid = proc.pid;
  if (pid === undefined) return [];
  const helpers = descendants(pid);
  const exited =
    proc.exitCode !== null || proc.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  proc.kill('SIGKILL');
  await exited;
  // Helpers started after the snapshot are children of helpers we know of.
  const all = [...new Set([...helpers, ...helpers.flatMap((p) => descendants(p))])];
  for (const helper of all) {
    try {
      process.kill(helper, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  const deadline = Date.now() + timeoutMs;
  let left = all.filter(alive);
  while (left.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    left = left.filter(alive);
  }
  return left;
}
