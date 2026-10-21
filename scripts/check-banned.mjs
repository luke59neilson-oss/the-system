// Fails if any committed code file contains a banned pattern.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { findBanned } from './banned-patterns.mjs';

const roots = ['packages', 'apps', 'e2e', 'scripts'];
const skipDirs = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report']);
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);
const rootFiles = readdirSync('.').filter((f) => exts.has(path.extname(f)));

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (exts.has(path.extname(entry))) yield full;
  }
}

const failures = [];
for (const file of [...rootFiles, ...roots.flatMap((r) => [...walk(r)])]) {
  for (const hit of findBanned(readFileSync(file, 'utf8'))) {
    failures.push(`${file}:${hit.line} ${hit.name}`);
  }
}

if (failures.length > 0) {
  console.error('Banned patterns found (docs/LOOP.md §5.6):\n' + failures.join('\n'));
  process.exit(1);
}
console.log('No banned patterns.');
