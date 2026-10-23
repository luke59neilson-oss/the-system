// Runs electron-builder with the build id that names the release files (MS.7):
// `TheSystem-<id>-win-x64-setup.exe` and so on. The release workflow sets
// THE_SYSTEM_BUILD_ID to `preview-<date>-<run>`; local builds use `dev-<version>`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const id = process.env.THE_SYSTEM_BUILD_ID || `dev-${version}`;
if (!/^[\w.-]+$/.test(id)) throw new Error(`THE_SYSTEM_BUILD_ID has odd characters: ${id}`);
console.log(`Packaging The System as ${id}`);
const result = spawnSync(
  'npx',
  [
    'electron-builder',
    '--config',
    'electron-builder.yml',
    '--publish',
    'never',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, THE_SYSTEM_BUILD_ID: id },
  },
);
process.exit(result.status ?? 1);
