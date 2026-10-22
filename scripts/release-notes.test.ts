import { describe, expect, it } from 'vitest';
import { buildId, changesSection } from './release-notes.mjs';

describe('release build id (MS.7)', () => {
  it('names a preview by date and run number', () => {
    expect(buildId('2026-10-22', '57')).toBe('preview-2026-10-22-57');
    expect(buildId('2026-10-22', 3)).toBe('preview-2026-10-22-3');
  });
  it('refuses anything that would make an odd file name', () => {
    expect(() => buildId('22/10/2026', '1')).toThrow('bad date');
    expect(() => buildId('2026-10-22', '1 2')).toThrow('bad run number');
    expect(() => buildId('2026-10-22', '')).toThrow('bad run number');
  });
});

describe('release notes (MS.7)', () => {
  it('lists the app changes since the previous preview, without run locks or merges', () => {
    const notes = changesSection(
      [
        'docs: check M4.4, review log',
        'chore: release run lock',
        'feat(M4.4): character portraits',
        'chore: take run lock',
        "Merge branch 'main' into release-dry-run",
        '',
      ],
      'preview-2026-10-22-6.1',
    );
    expect(notes).toBe(
      '## What changed since preview-2026-10-22-6.1\n\n- docs: check M4.4, review log\n- feat(M4.4): character portraits\n',
    );
  });
  it('says so when nothing changed, and when there is no earlier preview', () => {
    expect(changesSection(['chore: take run lock'], 'preview-x')).toContain(
      'No changes to the app.',
    );
    expect(changesSection([], null)).toContain('No earlier preview');
  });
});
