// Dev mode: server (tsx watch) on PORT (default 30333) + Vite dev server with proxy.
// Runs the tool entry points with this Node directly (no npm/shell wrapper), so it
// works on Windows and Ctrl+C stops the real processes, not just a wrapper.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const node = (args, cwd) => [process.execPath, args, { cwd, env, stdio: 'inherit' }];

// The server needs a web build to serve; build once if missing.
if (!existsSync(path.join(root, 'apps/web/dist/index.html'))) {
  const result = spawnSync(...node([vite, 'build'], path.join(root, 'apps/web')));
  if (result.status !== 0) {
    console.error('Web build failed; not starting dev servers.');
    process.exit(result.status ?? 1);
  }
}

const children = [
  spawn(...node([tsx, 'watch', 'src/main.ts'], path.join(root, 'apps/server'))),
  spawn(...node([vite], path.join(root, 'apps/web'))),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', stop));
