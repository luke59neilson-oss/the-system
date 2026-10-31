import { describe, expect, it } from 'vitest';
import { campaignSwitchNotice, missingCharacterReason } from '../src/campaignSwitch';

describe('campaignSwitchNotice (QF.66)', () => {
  it('calls a restored backup an earlier copy', () => {
    expect(campaignSwitchNotice('main-restored', 'main')).toContain(
      'The GM opened an earlier copy of the campaign, from a backup',
    );
    expect(campaignSwitchNotice('main-restored-2', 'main')).toContain('earlier copy');
  });
  it('says so when the GM switches back to where the page started', () => {
    expect(campaignSwitchNotice('main', 'main')).toBe(
      '[The GM switched back to the campaign you started in. Your sheet shows it again.]',
    );
    // A page that started on the restored copy is back there, not on a copy.
    expect(campaignSwitchNotice('main-restored', 'main-restored')).toContain('switched back');
  });
  it('names the demo and any other campaign plainly', () => {
    expect(campaignSwitchNotice('demo', 'main')).toBe('[The GM opened the demo campaign.]');
    expect(campaignSwitchNotice('main', 'demo')).toBe(
      '[The GM opened another campaign. Your sheet now shows that campaign.]',
    );
    expect(campaignSwitchNotice('restored-notes', 'main')).not.toContain('earlier copy');
  });
});

describe('missingCharacterReason (QF.66)', () => {
  it('names the open campaign and the way out', () => {
    expect(missingCharacterReason('main-restored')).toBe(
      'The GM has opened another campaign (“main-restored”), which does not have your character. This screen rejoins when they switch back; or use Switch character.',
    );
    expect(missingCharacterReason(null)).toMatch(/^The GM has opened another campaign, which/);
  });
});
