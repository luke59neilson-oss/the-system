// Bundles the server (and the engine, consumed as source) into one ESM file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // MC.5: the native speech engine loads at run time from node_modules.
  external: ['sherpa-onnx-node'],
  logLevel: 'info',
  // Some bundled CommonJS dependencies call require(); give ESM output one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
