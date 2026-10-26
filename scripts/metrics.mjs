// Efficiency scorecard (docs/LOOP.md §9, docs/EFFICIENCY.md): cheap, repeatable
// numbers so efficiency checks compare like with like instead of re-reading
// the logs.
//
//   node scripts/metrics.mjs              print the scorecard for the last 6 runs
//   node scripts/metrics.mjs --runs 12    a wider window
//   node scripts/metrics.mjs --append     also append the row to docs/EFFICIENCY.md
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Columns of the scorecard table in docs/EFFICIENCY.md. */
export const HEADER =
  '| Date (UTC) | Runs | End minute (mean) | Items per run | Round-2 share | Highs | Main CI runs/day | Main CI red/day | Main CI minutes (mean) | Orient words |';

const RUN_HEADING = /^### Run (\S+) · (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})[–-](\d{2}):(\d{2}) UTC/;

/** Run entries from PROGRESS.md headings, oldest first. */
export function parseRuns(progress) {
  const runs = [];
  for (const line of progress.split('\n')) {
    const m = RUN_HEADING.exec(line);
    if (!m) continue;
    const start = Number(m[3]) * 60 + Number(m[4]);
    let end = Number(m[5]) * 60 + Number(m[6]);
    if (end < start) end += 24 * 60; // ran past midnight
    runs.push({ id: m[1], date: m[2], minutes: end - start });
  }
  return runs;
}

const FINDINGS = /(\d+) High, (\d+) Medium/g;

/** One entry per reviewed item in REVIEW-LOG.md, oldest first: rounds and findings. */
export function parseReviews(log) {
  const items = [];
  let current = null;
  for (const line of log.split('\n')) {
    if (/^#{2,3} \d{4}-\d{2}-\d{2} · /.test(line)) {
      const title = line.replace(/^#+ /, '');
      // D234: logs write each review round under its own heading
      // ("MC.2 … round 1", then "MC.2 … round 2"): headings that start with
      // the same item id are one item.
      const key = /^\S+ · ([A-Z]+\d*\.(?:\d+|A))\b/.exec(title)?.[1] ?? title;
      current = items.find((i) => i.key === key) ?? null;
      if (current === null) {
        current = { key, title, rounds: 0, high: 0, medium: 0 };
        items.push(current);
      }
      continue;
    }
    if (current === null) continue;
    for (const m of line.matchAll(FINDINGS)) {
      current.rounds += 1;
      current.high += Number(m[1]);
      current.medium += Number(m[2]);
    }
  }
  return items.filter((i) => i.rounds > 0).map(({ key: _key, ...item }) => item);
}

/** Boxes checked per run, from the checked-box count at each run start (oldest first). */
export function boxDeltas(counts) {
  const deltas = [];
  for (let i = 1; i < counts.length; i += 1) deltas.push(counts[i] - counts[i - 1]);
  return deltas;
}

/**
 * Main-branch CI over the 24 hours before `nowMs`: runs, red runs, and mean
 * minutes of the green ones (cancelled and red runs stop early and would skew
 * it). Null when the API was unreachable.
 */
export function ciSummary(runs, nowMs) {
  if (runs === null) return null;
  const since = nowMs - 24 * 60 * 60 * 1000;
  const recent = runs.filter(
    (r) =>
      r.name === 'CI' &&
      r.head_branch === 'main' &&
      r.status === 'completed' &&
      Date.parse(r.created_at) >= since,
  );
  const minutes = recent
    .filter((r) => r.conclusion === 'success')
    .map((r) => (Date.parse(r.updated_at) - Date.parse(r.run_started_at)) / 60000);
  return {
    runs: recent.length,
    red: recent.filter((r) => r.conclusion === 'failure').length,
    meanMinutes: minutes.length === 0 ? 0 : minutes.reduce((a, b) => a + b, 0) / minutes.length,
  };
}

const words = (text) => text.split(/\s+/).filter(Boolean).length;

/** Words a run reads while orienting under LOOP §4 (targeted reads). */
export function orientWords({ claude, loop, design, answers, progress, roadmap, decisions }) {
  const header = progress.split('\n').slice(0, 6).join('\n');
  const lastEntry = progress.slice(Math.max(0, progress.lastIndexOf('\n### ')));
  const sections = roadmap.split(/\n(?=## )/);
  const open = sections.filter((s) => /^## Global rules/.test(s) || /^- \[[ ~]\]/m.test(s));
  const lEntries = decisions.split('\n').filter((l) => /^- L\d+ /.test(l));
  return [claude, loop, design, answers, header, lastEntry, ...open, ...lEntries]
    .map(words)
    .reduce((a, b) => a + b, 0);
}

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const fixed = (x, digits = 1) => x.toFixed(digits);

/** The scorecard row for the last `window` runs. */
export function scorecardRow({ date, runs, deltas, reviews, ci, orient, window }) {
  const lastRuns = runs.slice(-window);
  const lastDeltas = deltas.slice(-window);
  const lastReviews = reviews.slice(-10);
  const round2 = lastReviews.filter((r) => r.rounds >= 2).length;
  const cells = [
    date,
    String(lastRuns.length),
    fixed(mean(lastRuns.map((r) => r.minutes))),
    fixed(mean(lastDeltas)),
    `${round2}/${lastReviews.length}`,
    String(lastReviews.reduce((a, r) => a + r.high, 0)),
    ci === null ? 'n/a' : String(ci.runs),
    ci === null ? 'n/a' : String(ci.red),
    ci === null ? 'n/a' : fixed(ci.meanMinutes),
    String(orient),
  ];
  return `| ${cells.join(' | ')} |`;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Checked-box counts at each run start (`chore: take run lock`), oldest first. */
function checkedBoxesAtLockTakes(limit) {
  const shas = git(['log', '--format=%H', '--grep=^chore: take run lock$', `-n${limit}`, 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .reverse();
  return shas.map((sha) => {
    try {
      return (git(['show', `${sha}:docs/ROADMAP.md`]).match(/^- \[x\]/gm) ?? []).length;
    } catch {
      return 0;
    }
  });
}

function repoSlug() {
  const url = git(['remote', 'get-url', 'origin']).trim();
  const m = /([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : 'luke59neilson-oss/the-system';
}

function fetchCiRuns() {
  try {
    const out = execFileSync(
      'gh',
      [
        'api',
        `repos/${repoSlug()}/actions/runs?branch=main&per_page=100`,
        '--jq',
        '[.workflow_runs[] | {name, head_branch, status, conclusion, created_at, updated_at, run_started_at}]',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, GH_TOKEN: '' },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const runs = JSON.parse(out);
    // The API sometimes answers with an empty list; main always has recent CI.
    return Array.isArray(runs) && runs.length > 0 ? runs : null;
  } catch {
    return null;
  }
}

function main(argv) {
  const at = argv.indexOf('--runs');
  const window = at >= 0 ? Number(argv[at + 1]) : 6;
  if (!Number.isInteger(window) || window < 1) throw new Error('--runs needs a whole number');
  const read = (p) => readFileSync(p, 'utf8');
  const progress = read('docs/PROGRESS.md');
  const row = scorecardRow({
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    runs: parseRuns(progress),
    deltas: boxDeltas(checkedBoxesAtLockTakes(window + 1)),
    reviews: parseReviews(read('docs/REVIEW-LOG.md')),
    ci: ciSummary(fetchCiRuns(), Date.now()),
    orient: orientWords({
      claude: read('CLAUDE.md'),
      loop: read('docs/LOOP.md'),
      design: read('docs/DESIGN.md'),
      answers: read('docs/ANSWERS.md'),
      progress,
      roadmap: read('docs/ROADMAP.md'),
      decisions: read('docs/DECISIONS.md'),
    }),
    window,
  });
  process.stdout.write(`${HEADER}\n${row}\n`);
  if (argv.includes('--append')) appendFileSync('docs/EFFICIENCY.md', `${row}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
