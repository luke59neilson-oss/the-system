import { describe, expect, it } from 'vitest';
import { undoError } from '../src/gm/ChangeLog';

// QF.62: the undo refusal names the later change that blocks it, when known.
describe('undoError (QF.62)', () => {
  const engine =
    'Event u1 (event.undone): cannot undo a1 (character.created) because a later event depends on it: Event a2 (character.renamed): unknown character "kim"';
  it('names the blocking change from the preview', () => {
    expect(undoError(engine, 'Kim is now Kimberly')).toBe(
      "Can't undo this: a later change depends on it: “Kim is now Kimberly”. Undo that change first.",
    );
  });
  it('falls back to the general line without one', () => {
    expect(undoError(engine)).toBe(
      "Can't undo this: a later change depends on it. Undo the later changes first.",
    );
  });
});
