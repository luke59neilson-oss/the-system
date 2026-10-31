// QF.44: the Campaigns and backups window's words and file names.
import { describe, expect, it } from 'vitest';
import { backupLabel, count, exportFileName } from '../src/gm/campaignsModel';

describe('campaignsModel', () => {
  it('reads a backup folder name as a time and a reason', () => {
    expect(backupLabel('2026-10-31T08-09-46-123Z-manual', 'UTC')).toBe(
      '2026-10-31 08:09:46 · Back up now',
    );
    expect(backupLabel('2026-10-31T08-09-46-123Z-session-3-end', 'UTC')).toBe(
      '2026-10-31 08:09:46 · end of session 3',
    );
    expect(backupLabel('2026-10-31T08-09-46-123Z-quit', 'UTC')).toBe(
      '2026-10-31 08:09:46 · when the app quit',
    );
    expect(backupLabel('2026-10-31T08-09-46Z-before-merge', 'UTC')).toBe(
      '2026-10-31 08:09:46 · before merge',
    );
    expect(backupLabel('odd-name')).toBe('odd-name');
  });

  it('shows backup times in local time, like the change log (QF.66)', () => {
    // 02:00 UTC on Sunday is 9 pm on Saturday in Chicago (CDT).
    expect(backupLabel('2026-10-25T02-00-00-000Z-manual', 'America/Chicago')).toBe(
      '2026-10-24 21:00:00 · Back up now',
    );
    expect(backupLabel('2026-10-25T02-00-00-000Z-manual', 'Asia/Kolkata')).toBe(
      '2026-10-25 07:30:00 · Back up now',
    );
  });

  it('names the download after the campaign and the date', () => {
    expect(exportFileName('The Whale: Part 1', '2026-10-31T08:00:00.000Z')).toBe(
      'The-Whale-Part-1-2026-10-31.the-system.json',
    );
    expect(exportFileName('Zoë’s game', '2026-10-31T08:00:00.000Z')).toBe(
      'Zoes-game-2026-10-31.the-system.json',
    );
    expect(exportFileName(null, '2026-10-31T08:00:00.000Z')).toBe(
      'campaign-2026-10-31.the-system.json',
    );
  });

  it('counts in plain words', () => {
    expect(count(1, 'event')).toBe('1 event');
    expect(count(1234, 'portrait')).toBe('1,234 portraits');
    expect(count(0, 'portrait')).toBe('0 portraits');
  });
});
