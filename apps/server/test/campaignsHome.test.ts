import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CampaignStore } from '../src/store';

// ML.1 (DESIGN §9a "Campaigns home", L28): Delete moves a campaign to a
// Deleted list (files kept); Restore puts it back; an open campaign cannot be
// deleted. Work in progress: the store API below does not exist yet.
let dataDir: string;
const options = () => ({ dataDir, now: () => '2026-11-01T00:00:00.000Z' });

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-home-'));
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('campaign delete and restore (ML.1)', () => {
  it('delete moves the folder to the Deleted list; restore returns it', () => {
    CampaignStore.open('alpha', options()).close();
    CampaignStore.open('beta', options()).close();
    CampaignStore.softDelete(dataDir, 'alpha');
    expect(CampaignStore.list(dataDir)).toEqual(['beta']);
    expect(CampaignStore.listDeleted(dataDir).map((d) => d.id)).toEqual(['alpha']);
    expect(existsSync(path.join(CampaignStore.campaignsDir(dataDir), 'alpha'))).toBe(false);
    CampaignStore.restoreDeleted(dataDir, 'alpha');
    expect(CampaignStore.list(dataDir)).toEqual(['alpha', 'beta']);
    expect(CampaignStore.listDeleted(dataDir)).toEqual([]);
  });

  it('refuses to delete a campaign that is open (its LOCK is held)', () => {
    const open = CampaignStore.open('alpha', options());
    try {
      expect(() => CampaignStore.softDelete(dataDir, 'alpha')).toThrow(/open/);
      expect(CampaignStore.list(dataDir)).toEqual(['alpha']);
    } finally {
      open.close();
    }
  });
});
