// Fails if any committed code file contains a banned pattern (docs/LOOP.md §5.6).
// Scans the whole repo except dependency, build, report and docs directories.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { findBanned, isTestFile } from './banned-patterns.mjs';

const skipDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
  'docs',
]);
const exts = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (exts.has(path.extname(entry))) yield full;
  }
}

const failures = [];
for (const file of walk('.')) {
  const text = readFileSync(file, 'utf8');
  for (const hit of findBanned(text, { test: isTestFile(file) })) {
    failures.push(`${file}:${hit.line} ${hit.name}`);
  }
}

if (failures.length > 0) {
  console.error('Banned patterns found (docs/LOOP.md §5.6):\n' + failures.join('\n'));
  process.exit(1);
}
console.log('No banned patterns.');
