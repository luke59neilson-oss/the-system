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

/** CAMPAIGN_STATE_SCHEMA_VERSION, read from the engine source. */
export function currentSchemaVersion(source = readFileSync(REDUCER, 'utf8')) {
  const match = /export const CAMPAIGN_STATE_SCHEMA_VERSION = (\d+);/.exec(source);
  if (!match) throw new Error('CAMPAIGN_STATE_SCHEMA_VERSION not found');
  return Number(match[1]);
}

/** `{ file: contents }` for every golden log and state. */
export function readGoldens(dir = GOLDEN_DIR) {
  const files = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.jsonl') || name.endsWith('.state.json')) {
      files[name] = readFileSync(join(dir, name), 'utf8');
    }
  }
  return files;
}

/**
 * Problems with the goldens against a manifest, as sentences; empty = pinned.
 * A log may never change; a state may change only at a higher schema version
 * (then the manifest must be re-recorded); every file must be pinned.
 */
export function verify(files, manifest, schemaVersion) {
  const problems = [];
  for (const [name, text] of Object.entries(files)) {
    const pin = manifest.files?.[name];
    if (!pin) {
      problems.push(`${name} is not pinned: run \`npm run golden:record\``);
      continue;
    }
    if (pin.sha256 === sha256(text)) continue;
    if (name.endsWith('.jsonl')) {
      problems.push(`${name} changed: golden logs are never edited (add an upcaster instead)`);
    } else if (schemaVersion <= pin.schemaVersion) {
      problems.push(
        `${name} changed without a state schema bump (pinned at v${pin.schemaVersion}, now v${schemaVersion})`,
      );
    } else {
      problems.push(`${name} changed at v${schemaVersion}: run \`npm run golden:record\``);
    }
  }
  for (const name of Object.keys(manifest.files ?? {})) {
    if (!(name in files)) problems.push(`${name} is pinned but missing`);
  }
  return problems;
}

/**
 * The manifest to write, or throws when recording would launder a change:
 * an edited log, or a changed state without a schema bump.
 */
export function record(files, manifest, schemaVersion) {
  const refused = verify(files, manifest, schemaVersion).filter((p) =>
    / are never edited| without a state schema bump/.test(p),
  );
  if (refused.length) throw new Error(`Refusing to re-record:\n- ${refused.join('\n- ')}`);
  const next = { files: {} };
  for (const [name, text] of Object.entries(files)) {
    const hash = sha256(text);
    const pin = manifest.files?.[name];
    next.files[name] = {
      sha256: hash,
      // Unchanged files keep the version they were recorded at.
      schemaVersion: pin && pin.sha256 === hash ? pin.schemaVersion : schemaVersion,
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
