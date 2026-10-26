// Bundles the Electron main process (server and engine included) into one CJS file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // MC.5: the native speech engine ships in resources/speech (electron-builder.yml).
  external: ['electron', 'sherpa-onnx-node'],
  sourcemap: true,
  logLevel: 'info',
});
