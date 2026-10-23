// Golden log pins (ROADMAP QF.4): every committed golden `.jsonl` and
// `.state.json` is pinned by SHA-256 together with the campaign state schema
// version it was recorded at, so a commit cannot edit a log, or regenerate a
// state without bumping CAMPAIGN_STATE_SCHEMA_VERSION.
//
//   node scripts/golden-manifest.mjs record   re-record the manifest (refuses
//                                             edited logs and unbumped states)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
export const GOLDEN_DIR = join(root, 'packages', 'engine', 'test', 'golden');
export const MANIFEST = join(GOLDEN_DIR, 'manifest.json');
const REDUCER = join(root, 'packages', 'engine', 'src', 'events', 'reducer.ts');

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** CAMPAIGN_STATE_SCHEMA_VERSION, read from the engine source (a real declaration, not a comment). */
export function currentSchemaVersion(source = readFileSync(REDUCER, 'utf8')) {
  const match = /^export const CAMPAIGN_STATE_SCHEMA_VERSION = (\d+);/m.exec(source);
  if (!match) throw new Error('CAMPAIGN_STATE_SCHEMA_VERSION not found');
  return Number(match[1]);
}

/** `{ file: bytes }` for every golden log and state (hashed as raw bytes). */
export function readGoldens(dir = GOLDEN_DIR) {
  const files = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.jsonl') || name.endsWith('.state.json')) {
      files[name] = readFileSync(join(dir, name));
    }
  }
  return files;
}

/** Problems that `golden:record` may not clear: they need a reviewed manifest edit or a bump. */
const REFUSED = new Set(['log-edited', 'state-unbumped', 'missing']);

function problemsOf(files, manifest, schemaVersion) {
  const problems = [];
  const add = (code, message) => problems.push({ code, message });
  for (const [name, text] of Object.entries(files)) {
    const pin = manifest.files?.[name];
    if (!pin) {
      add('unpinned', `${name} is not pinned: run \`npm run golden:record\``);
      continue;
    }
    const isLog = name.endsWith('.jsonl');
    if (pin.sha256 !== sha256(text)) {
      if (isLog) {
        add(
          'log-edited',
          `${name} changed: golden logs are never edited (add an upcaster instead)`,
        );
      } else if (schemaVersion <= pin.schemaVersion) {
        add(
          'state-unbumped',
          `${name} changed without a state schema bump (pinned at v${pin.schemaVersion}, now v${schemaVersion})`,
        );
      } else {
        add('stale', `${name} changed at v${schemaVersion}: run \`npm run golden:record\``);
      }
    } else if (!isLog && pin.schemaVersion !== schemaVersion) {
      // After a bump every state is re-pinned at it, so a later edit needs another bump.
      add(
        'stale',
        `${name} is pinned at v${pin.schemaVersion}, now v${schemaVersion}: run \`npm run golden:record\``,
      );
    }
  }
  for (const name of Object.keys(manifest.files ?? {})) {
    if (!(name in files)) add('missing', `${name} is pinned but missing`);
  }
  return problems;
}

/**
 * Problems with the goldens against a manifest, as sentences; empty = pinned.
 * A log may never change or vanish; a state may change only at a higher
 * schema version; after a bump every state must be re-recorded at it; every
 * file must be pinned.
 */
export function verify(files, manifest, schemaVersion) {
  return problemsOf(files, manifest, schemaVersion).map((p) => p.message);
}

/**
 * The manifest to write, or throws when recording would launder a change:
 * an edited log, a changed state without a schema bump, or a pinned file
 * that is gone (removing a golden is a hand edit of the manifest, in review).
 */
export function record(files, manifest, schemaVersion) {
  const refused = problemsOf(files, manifest, schemaVersion).filter((p) => REFUSED.has(p.code));
  if (refused.length) {
    throw new Error(`Refusing to re-record:\n- ${refused.map((p) => p.message).join('\n- ')}`);
  }
  const next = { files: {} };
  for (const [name, text] of Object.entries(files)) {
    const hash = sha256(text);
    const pin = manifest.files?.[name];
    next.files[name] = {
      sha256: hash,
      // Logs keep the version they were recorded at; states are pinned at the current one.
      schemaVersion: name.endsWith('.jsonl') && pin ? pin.schemaVersion : schemaVersion,
    };
  }
  return next;
}

export function readManifest(path = MANIFEST) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return { files: {} };
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command] = process.argv.slice(2);
  if (command !== 'record') {
    console.error('usage: node scripts/golden-manifest.mjs record');
    process.exit(2);
  }
  try {
    const next = record(readGoldens(), readManifest(), currentSchemaVersion());
    writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Pinned ${Object.keys(next.files).length} golden files.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
