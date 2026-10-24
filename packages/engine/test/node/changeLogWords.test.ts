import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGE_LOG_PHRASES, EVENT_TYPES } from '../../src';

// M4.8: no change-log row falls back to a raw event type. Each type has either
// session-log words (a `case` in describeEvent) or a summary phrase.

describe('change log words (M4.8)', () => {
  it('has words or a summary phrase for every event type', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../src/report/sessionLog.ts'),
      'utf8',
    );
    const missing = EVENT_TYPES.filter(
      (t) =>
        t !== 'event.undone' &&
        !Object.prototype.hasOwnProperty.call(CHANGE_LOG_PHRASES, t) &&
        !source.includes(`case '${t}'`),
    );
    expect(missing).toEqual([]);
  });
});
