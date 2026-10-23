import { describe, expect, it } from 'vitest';
import {
  HEADER,
  boxDeltas,
  ciSummary,
  orientWords,
  parseReviews,
  parseRuns,
  scorecardRow,
} from './metrics.mjs';

describe('parseRuns', () => {
  it('reads run headings and their length in minutes', () => {
    const progress = [
      '# Progress',
      '### Setup session · 2026-10-21 13:45–14:05 UTC',
      '### Run a379851e · 2026-10-22 08:07–08:53 UTC',
      '- Preflight: fine',
      '### Run b4b5e178 · 2026-10-22 23:40-00:31 UTC',
    ].join('\n');
    expect(parseRuns(progress)).toEqual([
      { id: 'a379851e', date: '2026-10-22', minutes: 46 },
      { id: 'b4b5e178', date: '2026-10-22', minutes: 51 },
    ]);
  });
});

describe('parseReviews', () => {
  it('counts rounds and High/Medium findings per reviewed item', () => {
    const log = [
      '# Review log',
      '## 2026-10-22 · MQ.1 Evolution rules · sonnet',
      '- Round 1 (835717c..fefa7d7): 0 High, 3 Medium, 4 Low.',
      '- Round 2 (2026-10-22, run 451e9851), sonnet: 0 High, 1 Medium, 3 Low.',
      '### 2026-10-22 · M4.4 Character creation · reviewer: sonnet',
      '- Round 1: 1 High, 0 Medium, 2 Low.',
      '## 2026-10-22 · Notes without findings',
      '- nothing to count',
    ].join('\n');
    expect(parseReviews(log)).toEqual([
      { title: '2026-10-22 · MQ.1 Evolution rules · sonnet', rounds: 2, high: 0, medium: 4 },
      {
        title: '2026-10-22 · M4.4 Character creation · reviewer: sonnet',
        rounds: 1,
        high: 1,
        medium: 0,
      },
    ]);
  });
});

describe('boxDeltas', () => {
  it('turns checked-box counts at each lock release into boxes per run', () => {
    expect(boxDeltas([10, 12, 12, 15])).toEqual([2, 0, 3]);
    expect(boxDeltas([7])).toEqual([]);
  });
});

describe('ciSummary', () => {
  const now = Date.parse('2026-10-22T17:00:00Z');
  const run = (over: Partial<Record<string, string | null>>) => ({
    name: 'CI',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-22T16:00:00Z',
    run_started_at: '2026-10-22T16:00:00Z',
    updated_at: '2026-10-22T16:06:00Z',
    ...over,
  });
  it('counts main CI runs in the last 24 hours, red ones, and mean minutes of green ones', () => {
    const runs = [
      run({}),
      run({ conclusion: 'failure', updated_at: '2026-10-22T16:04:00Z' }),
      run({ created_at: '2026-10-21T16:59:00Z' }),
      run({ name: 'Release' }),
      run({ head_branch: 'wip/MQ.3' }),
      run({ status: 'in_progress' }),
    ];
    expect(ciSummary(runs as never, now)).toEqual({ runs: 2, red: 1, meanMinutes: 6 });
  });
  it('is null when the API could not be reached', () => {
    expect(ciSummary(null, now)).toBeNull();
  });
});

describe('orientWords', () => {
  it('counts only what LOOP §4 reads: full files, the progress header and last entry, open milestones, L-decisions', () => {
    const n = orientWords({
      claude: 'one two',
      loop: 'three',
      design: 'four five',
      answers: 'six',
      progress: 'h1\nh2\nh3\nh4\nh5\nh6\nold old old\n### Run x\nlast entry',
      roadmap: '# Roadmap\n## Global rules\nrule\n## M1 done\n- [x] a\n## M2 open\n- [ ] b',
      decisions: '# Decisions\n- D1 · x\n- L1 · y z',
    });
    // 2+1+2+1 full files, 6 header lines, "### Run x last entry" (5),
    // "## Global rules rule" (4), "## M2 open - [ ] b" (7), "- L1 · y z" (5).
    expect(n).toBe(6 + 6 + 5 + 4 + 7 + 5);
  });
});

describe('scorecardRow', () => {
  it('formats one table row with the same columns as the header', () => {
    const row = scorecardRow({
      date: '2026-10-22 17:00',
      runs: [
        { id: 'a', date: '2026-10-22', minutes: 30 },
        { id: 'b', date: '2026-10-22', minutes: 40 },
        { id: 'c', date: '2026-10-22', minutes: 50 },
      ],
      deltas: [9, 2, 3],
      reviews: [
        { title: 'x', rounds: 1, high: 0, medium: 1 },
        { title: 'y', rounds: 2, high: 1, medium: 2 },
      ],
      ci: { runs: 40, red: 1, meanMinutes: 5.94 },
      orient: 9000,
      window: 2,
    });
    expect(row).toBe('| 2026-10-22 17:00 | 2 | 45.0 | 2.5 | 1/2 | 1 | 40 | 1 | 5.9 | 9000 |');
    expect(row.split('|').length).toBe(HEADER.split('|').length);
    const offline = scorecardRow({
      date: 'd',
      runs: [],
      deltas: [],
      reviews: [],
      ci: null,
      orient: 0,
      window: 6,
    });
    expect(offline).toBe('| d | 0 | 0.0 | 0.0 | 0/0 | 0 | n/a | n/a | n/a | 0 |');
  });
});
