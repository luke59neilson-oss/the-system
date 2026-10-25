// MT.7 (DESIGN §7 GM authority, Q60): every refusal the engine can give a
// command, as a stable key, so docs/GM-OVERRIDES.md can be checked complete.
// `node scripts/gm-refusals.mjs` prints the keys grouped by file.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'packages/engine/src');
const THROW =
  /(?:new\s+(?:Character|Economy|Title|EventRejected)(?:Rule)?Error|\bfail)\(\s*(?:event,\s*)?(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

/** A refusal's key: its message with every `${…}` written as `…`, spaces collapsed. */
export function refusalKey(message) {
  return message
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

/** Every literal refusal message in the engine source, with where it is. */
export function listRefusals() {
  const out = [];
  for (const file of files(SRC).sort()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(THROW)) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ file: path.relative(ROOT, file), line, key: refusalKey(m[2]) });
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let last = '';
  for (const r of listRefusals()) {
    if (r.file !== last) console.log(`\n## ${r.file}`);
    last = r.file;
    console.log(`- ${r.line}: ${r.key}`);
  }
}
