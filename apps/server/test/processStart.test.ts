import { describe, expect, it } from 'vitest';
import { START_TOLERANCE_MS, ownProcessStart, parseStart, processStart } from '../src/processStart';

describe('process start times (QF.41)', () => {
  it('parses what ps and PowerShell print', () => {
    expect(parseStart('2026-10-31T07:08:12.1234567Z\r\n')).toBe(
      Date.parse('2026-10-31T07:08:12.123Z'),
    );
    expect(parseStart('Sat Oct  3 07:08:12 2026\n')).toBe(new Date(2026, 9, 3, 7, 8, 12).getTime());
    expect(parseStart('')).toBeNull();
    expect(parseStart('not a date')).toBeNull();
  });

  it("reads this process's start time and agrees with the one a LOCK records", () => {
    const read = processStart(process.pid);
    expect(read).not.toBeNull();
    expect(Math.abs((read ?? 0) - ownProcessStart())).toBeLessThan(START_TOLERANCE_MS);
  });

  it('gives null for a pid that cannot be read', () => {
    expect(processStart(-1)).toBeNull();
    expect(processStart(2 ** 22 + 12_345)).toBeNull();
  });
});
