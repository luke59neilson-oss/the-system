import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** Starts the built server bundle on a random free port (127.0.0.1). */
export async function startBuiltServer(): Promise<RunningServer> {
  const child: ChildProcess = spawn(
    process.execPath,
    ['apps/server/dist/main.js', '--port', '0', '--host', '127.0.0.1'],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let output = '';
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 15_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /listening on (http:\/\/[\d.]+:\d+)/.exec(output);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}) before listening:\n${output}`));
    });
  });

  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      }),
  };
}
