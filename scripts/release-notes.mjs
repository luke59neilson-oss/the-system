// Release helpers (ROADMAP MS.7): the preview build id that names the files,
// and release notes listing what changed since the previous preview.
//
//   node scripts/release-notes.mjs id <yyyy-mm-dd> <run number>
//   node scripts/release-notes.mjs notes <previous tag or -> <sha>
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** `preview-<date>-<run>`: unique per workflow run, sorts by day. */
export function buildId(date, run) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date: ${date}`);
  if (!/^\d+$/.test(String(run))) throw new Error(`bad run number: ${run}`);
  return `preview-${date}-${run}`;
}

/** Commits that say nothing about the app: run locks and merge commits. */
const NOISE = [
  /^chore: (take|release) run lock\b/i,
  /^Merge (branch|remote-tracking branch|pull request)\b/,
];

/** Markdown "What changed" section from commit subjects (newest first). */
export function changesSection(subjects, previousTag) {
  const lines = subjects
    .map((s) => s.trim())
    .filter((s) => s !== '' && !NOISE.some((re) => re.test(s)));
  if (previousTag === null) {
    return '## What changed\n\nNo earlier preview to compare with.\n';
  }
  if (lines.length === 0) {
    return `## What changed since ${previousTag}\n\nNo changes to the app.\n`;
  }
  return `## What changed since ${previousTag}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
}

function main(argv) {
  const [cmd, a, b] = argv;
  if (cmd === 'id') {
    process.stdout.write(`${buildId(a, b)}\n`);
    return;
  }
  if (cmd === 'notes') {
    const previous = a && a !== '-' ? a : null;
    const subjects =
      previous === null
        ? []
        : execFileSync('git', ['log', '--no-merges', '--format=%s', `${previous}..${b}`], {
            encoding: 'utf8',
          }).split('\n');
    process.stdout.write(changesSection(subjects, previous));
    return;
  }
  throw new Error('usage: release-notes.mjs id <date> <run> | notes <previous tag|-> <sha>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
