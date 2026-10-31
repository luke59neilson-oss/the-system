// QF.44: the Campaigns and backups window's words and file names.
import { describe, expect, it } from 'vitest';
import { backupLabel, count, exportFileName } from '../src/gm/campaignsModel';

describe('campaignsModel', () => {
  it('reads a backup folder name as a time and a reason', () => {
    expect(backupLabel('2026-10-31T08-09-46-123Z-manual')).toBe(
      '2026-10-31 08:09:46 UTC · Back up now',
    );
    expect(backupLabel('2026-10-31T08-09-46-123Z-session-3-end')).toBe(
      '2026-10-31 08:09:46 UTC · end of session 3',
    );
    expect(backupLabel('2026-10-31T08-09-46-123Z-quit')).toBe(
      '2026-10-31 08:09:46 UTC · when the app quit',
    );
    expect(backupLabel('2026-10-31T08-09-46Z-before-merge')).toBe(
      '2026-10-31 08:09:46 UTC · before merge',
    );
    expect(backupLabel('odd-name')).toBe('odd-name');
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
