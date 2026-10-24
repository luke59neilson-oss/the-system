import { describe, expect, it } from 'vitest';
import { CHANGE_LOG_DEFAULT_PAGE, type ChangeLogRow } from '@the-system/engine';
import { mergeHead } from '../src/gm/ChangeLog';

// QF.13: the newest page merged over what the GM console shows.
const row = (seq: number): ChangeLogRow => ({
  seq,
  id: `e${seq}`,
  type: 'system.broadcast',
  category: 'messages',
  at: '2026-10-23T12:00:00.000Z',
  actor: 'gm',
  lines: [`Line ${seq}`],
  undoneBy: null,
});
const range = (from: number, to: number) => {
  const out: ChangeLogRow[] = [];
  for (let s = from; s >= to; s--) out.push(row(s));
  return out;
};
const P = CHANGE_LOG_DEFAULT_PAGE;

describe('mergeHead (QF.13)', () => {
  it('replaces a single page, so the list stays one page long', () => {
    const shown = range(P - 1, 0);
    const head = { rows: range(P, 1), older: 1, matching: P + 1, undone: 0 };
    expect(mergeHead(shown, 0, head)).toEqual({ rows: head.rows, keptOlder: false });
  });

  it('keeps loaded older pages below a fresh head', () => {
    const shown = range(2 * P - 1, 0); // two pages loaded, nothing older
    const head = { rows: range(2 * P, P + 1), older: P + 1, matching: 2 * P + 1, undone: 0 };
    const merged = mergeHead(shown, 0, head);
    expect(merged.keptOlder).toBe(true);
    expect(merged.rows.map((r) => r.seq)).toEqual(range(2 * P, 0).map((r) => r.seq));
  });

  it('starts over when the head no longer reaches what was shown', () => {
    const shown = range(2 * P - 1, 0);
    const head = { rows: range(5 * P, 4 * P + 1), older: 4 * P + 1, matching: 5 * P, undone: 0 };
    expect(mergeHead(shown, 0, head)).toEqual({ rows: head.rows, keptOlder: false });
    expect(mergeHead([], 0, head)).toEqual({ rows: head.rows, keptOlder: false });
    const empty = { rows: [], older: null, matching: 0, undone: 0 };
    expect(mergeHead(shown, 0, empty)).toEqual({ rows: [], keptOlder: false });
  });

  it('starts over after an undo, so a loaded older row never shows stale undo state', () => {
    // Review finding: an undo of seq 20 on a loaded older page.
    const shown = range(2 * P - 1, 0);
    const head = { rows: range(2 * P - 1, P), older: P, matching: 2 * P, undone: 1 };
    expect(mergeHead(shown, 0, head)).toEqual({ rows: head.rows, keptOlder: false });
    expect(mergeHead(shown, 1, head).keptOlder).toBe(true);
  });
});
