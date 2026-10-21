// Dev mode: server (tsx watch) on PORT (default 30333) + Vite dev server with proxy.
// The server needs a web build to serve; build once if missing.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const env = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };
if (!existsSync('apps/web/dist/index.html')) {
  spawnSync('npm', ['run', 'build', '-w', '@the-system/web'], { stdio: 'inherit', env });
}
const children = [
  spawn('npm', ['run', 'dev', '-w', '@the-system/server'], { stdio: 'inherit', env }),
  spawn('npm', ['run', 'dev', '-w', '@the-system/web'], { stdio: 'inherit', env }),
];
const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', stop));
