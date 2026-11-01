// QF.44: the Campaigns and backups window's words and file names.
import { describe, expect, it } from 'vitest';
import {
  backupLabel,
  charactersLabel,
  count,
  deleteConfirmed,
  exportFileName,
  homeName,
  lastOpenedLabel,
  parseHomeRows,
} from '../src/gm/campaignsModel';

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

describe('Campaigns home (ML.1)', () => {
  it('reads the home rows, dropping malformed ones', () => {
    expect(
      parseHomeRows({
        home: [
          { id: 'tutorial', name: 'The Tutorial', characters: ['Jake', 3], lastOpened: 'x' },
          { id: 'old', name: null, characters: null, lastOpened: null },
          { name: 'no id' },
          'junk',
        ],
      }),
    ).toEqual([
      { id: 'tutorial', name: 'The Tutorial', characters: ['Jake'], lastOpened: 'x' },
      { id: 'old', name: null, characters: [], lastOpened: null },
    ]);
    expect(parseHomeRows(null)).toEqual([]);
  });

  it('names, times and characters in words', () => {
    expect(homeName({ id: 'old', name: null })).toBe('old');
    expect(homeName({ id: 'tutorial', name: 'The Tutorial' })).toBe('The Tutorial');
    expect(lastOpenedLabel('2026-11-01T16:20:05.000Z', 'UTC')).toBe('Last opened 2026-11-01 16:20');
    expect(lastOpenedLabel(null)).toBe('Not opened since the update');
    expect(charactersLabel([])).toBe('No characters yet');
    expect(charactersLabel(['Jake', 'Casper'])).toBe('Jake, Casper');
  });

  it('Delete needs the campaign’s exact name typed', () => {
    const row = { id: 'tutorial', name: 'The Tutorial' };
    expect(deleteConfirmed('The Tutorial', row)).toBe(true);
    expect(deleteConfirmed('  The Tutorial ', row)).toBe(true);
    expect(deleteConfirmed('the tutorial', row)).toBe(false);
    expect(deleteConfirmed('tutorial', row)).toBe(false);
    expect(deleteConfirmed('old', { id: 'old', name: null })).toBe(true);
  });
});
