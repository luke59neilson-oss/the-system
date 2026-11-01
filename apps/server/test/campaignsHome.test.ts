import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApp, type RunningApp } from '../src/app';
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

describe('campaign delete routes (ML.1)', () => {
  const KEY = 'h'.repeat(32);
  let webRoot: string;
  let app: RunningApp | null = null;
  const call = async (method: string, url: string) => {
    const res = await fetch(`http://127.0.0.1:${app!.port}${url}`, {
      method,
      headers: { 'x-gm-key': KEY },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  beforeEach(async () => {
    webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-home-web-'));
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    CampaignStore.open('old-test', options()).close();
    app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, gmKey: KEY });
  });
  afterEach(async () => {
    await app?.close();
    app = null;
    rmSync(webRoot, { recursive: true, force: true });
  });

  it('deletes a closed campaign, lists it as deleted and restores it', async () => {
    expect((await call('POST', '/api/gm/campaigns/old-test/delete')).body).toEqual({
      deleted: 'old-test',
    });
    expect((await call('GET', '/api/gm/campaigns/deleted')).body).toEqual({
      deleted: [{ id: 'old-test' }],
    });
    expect(CampaignStore.list(dataDir)).not.toContain('old-test');
    expect((await call('POST', '/api/gm/campaigns/old-test/undelete')).body).toEqual({
      restored: 'old-test',
    });
    expect(CampaignStore.list(dataDir)).toContain('old-test');
  });

  it('refuses to delete the open campaign', async () => {
    const r = await call('POST', '/api/gm/campaigns/main/delete');
    expect(r.status).toBe(409);
    expect(CampaignStore.list(dataDir)).toContain('main');
  });
});
