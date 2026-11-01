// LOOP §1.2 in one command (D332, in trial): fetch `main` (and any named
// `wip/*` branches) as single refs, then bring local `main` up to date:
// fast-forward when it can, reset to `origin/main` only when local `main` had
// no unpushed commits before the fetch (a stale copy left by an earlier
// session, D319), and refuse otherwise. Prints one line.
//   npm run sync                 # main only
//   npm run sync -- wip/ML.3     # main plus a wip branch
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * What to do with local main. `unpushed` is the number of local-main commits
 * no remote-tracking ref held before the fetch; `ffOk` whether
 * `git merge --ff-only origin/main` would succeed.
 * @param {{ unpushed: number, ffOk: boolean }} s
 * @returns {'ff' | 'reset' | 'refuse'}
 */
export function syncAction({ unpushed, ffOk }) {
  if (ffOk) return 'ff';
  return unpushed === 0 ? 'reset' : 'refuse';
}

function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function ok(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const wips = process.argv.slice(2).filter((a) => a.startsWith('wip/'));
  const hasMain = ok(['rev-parse', '--verify', '-q', 'refs/heads/main']);
  const unpushed = hasMain ? git(['rev-list', '--count', 'main', '--not', '--remotes']) : '0';
  git(['fetch', 'origin', '+main:refs/remotes/origin/main']);
  for (const w of wips) git(['fetch', 'origin', `+refs/heads/${w}:refs/remotes/origin/${w}`]);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!hasMain) git(['checkout', '-q', '-b', 'main', 'origin/main']);
  else if (branch !== 'main') git(['checkout', '-q', 'main']);
  const ffOk = ok(['merge', '--ff-only', '-q', 'origin/main']);
  const action = syncAction({ unpushed: Number(unpushed), ffOk });
  if (action === 'refuse') {
    console.log(
      `sync: local main has ${unpushed} unpushed commit(s) and cannot fast-forward; left as is`,
    );
    process.exitCode = 1;
    return;
  }
  if (action === 'reset') git(['reset', '-q', '--hard', 'origin/main']);
  const head = git(['rev-parse', '--short', 'HEAD']);
  const fetched = wips.length ? `; fetched ${wips.join(', ')}` : '';
  console.log(
    `sync: main at ${head} (${action === 'ff' ? 'fast-forward' : 'reset from a stale copy'})${fetched}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
