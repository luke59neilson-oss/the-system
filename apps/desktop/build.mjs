// Bundles the Electron main process (server and engine included) into one CJS file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
});
