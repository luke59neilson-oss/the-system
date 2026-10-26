// MC.5 review M6: checks that a packaged app ships the speech engine where
// `packagedSpeechLoad` looks for it, and that it loads from there (not from
// the repo's node_modules further up). Run by the release workflow after
// packaging: `npx tsx apps/desktop/scripts/check-packaged-speech.ts <resources dir>`.
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { packagedSpeechFiles, packagedSpeechLoad, speechPackageDir } from '../src/launch';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined || !existsSync(arg)) {
    throw new Error(`usage: check-packaged-speech <resources dir> (got ${String(arg)})`);
  }
  // The app's process.resourcesPath is absolute; so is this.
  const resources = path.resolve(arg);
  const { packageDir, addon } = packagedSpeechFiles(resources);
  for (const file of [path.join(packageDir, 'package.json'), addon]) {
    if (!existsSync(file)) throw new Error(`missing from the package: ${file}`);
  }
  // Same resolution as packagedSpeechLoad; it must land inside resources/speech.
  const resolved = realpathSync(
    createRequire(path.join(speechPackageDir(resources), 'index.js')).resolve('sherpa-onnx-node'),
  );
  const inside = realpathSync(speechPackageDir(resources)) + path.sep;
  if (!resolved.startsWith(inside)) {
    throw new Error(`sherpa-onnx-node resolved outside the package: ${resolved}`);
  }
  // sherpa-onnx-node falls back to $PWD/node_modules when its sibling addon
  // fails to load; point PWD at the package so that fallback cannot pass.
  process.env.PWD = resources;
  const engine = (await packagedSpeechLoad(resources)()) as Record<string, unknown> | undefined;
  if (typeof engine?.OfflineRecognizer !== 'function') {
    throw new Error('sherpa-onnx-node loaded without its native addon (no OfflineRecognizer)');
  }
  console.log(`speech engine OK: ${resolved}\naddon: ${addon}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
