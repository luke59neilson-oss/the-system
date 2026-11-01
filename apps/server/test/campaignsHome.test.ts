import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { startApp, type RunningApp } from '../src/app';
import { campaignIdFor } from '../src/server';
import { CampaignStore } from '../src/store';

// ML.1 (DESIGN §9a "Campaigns home", L28): Delete moves a campaign to a
// Deleted list (files kept); Restore puts it back; an open campaign cannot be
// deleted; the GM app starts with no campaign open and phones wait.
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
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${app!.port}${url}`, {
      method,
      headers: {
        'x-gm-key': KEY,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    expect(
      (await call('POST', '/api/gm/campaigns/old-test/delete', { name: 'old-test' })).body,
    ).toEqual({
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

  it('refuses to delete the open campaign, and deletes it once closed', async () => {
    expect((await call('POST', '/api/gm/campaign', { id: 'old-test' })).status).toBe(200);
    const r = await call('POST', '/api/gm/campaigns/old-test/delete', { name: 'old-test' });
    expect(r.status).toBe(409);
    expect(r.body['error']).toBe('Close the campaign before deleting it');
    expect(CampaignStore.list(dataDir)).toContain('old-test');
    expect((await call('POST', '/api/gm/campaign/close')).body).toEqual({ id: null });
    expect(
      (await call('POST', '/api/gm/campaigns/old-test/delete', { name: 'old-test' })).status,
    ).toBe(200);
    expect(CampaignStore.listDeleted(dataDir).map((d) => d.id)).toEqual(['old-test']);
  });

  it('refuses a delete without the campaign’s name typed', async () => {
    for (const body of [undefined, {}, { name: 'old' }, { name: 'Old-test' }]) {
      const r = await call('POST', '/api/gm/campaigns/old-test/delete', body);
      expect(r.status).toBe(400);
      expect(r.body['error']).toBe('Type the campaign’s name to delete it');
    }
    expect(CampaignStore.list(dataDir)).toContain('old-test');
    await call('POST', '/api/gm/campaigns', { name: 'Second' });
    await call('POST', '/api/gm/campaign/close');
    expect((await call('POST', '/api/gm/campaigns/second/delete', { name: 'second' })).status).toBe(
      200,
    );
  });

  it('refuses to delete a campaign another program holds open (its lock)', async () => {
    const other = CampaignStore.open('held', { ...options(), machineId: 'other-laptop' });
    try {
      const r = await call('POST', '/api/gm/campaigns/held/delete', { name: 'held' });
      expect(r.status).toBe(409);
      expect(CampaignStore.list(dataDir)).toContain('held');
    } finally {
      other.close();
    }
  });

  it('lets go of a campaign opened earlier (not open now) before deleting it', async () => {
    await call('POST', '/api/gm/campaign', { id: 'old-test' });
    await call('POST', '/api/gm/campaigns', { name: 'Second' });
    const r = await call('POST', '/api/gm/campaigns/old-test/delete', { name: 'old-test' });
    expect(r.status).toBe(200);
    expect(CampaignStore.list(dataDir)).toEqual(['second']);
  });

  it('starts with no campaign open; phones are told to wait', async () => {
    expect((await call('GET', '/api/gm/campaign')).body).toEqual({
      id: null,
      demo: false,
      main: false,
    });
    // Nothing was created by starting: only the campaign already on disk.
    expect(CampaignStore.list(dataDir)).toEqual(['old-test']);
    const res = await fetch(`http://127.0.0.1:${app!.port}/api/characters`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      waiting: true,
      error: 'Waiting for the GM to open a campaign',
    });
    const hello = await firstMessage(`ws://127.0.0.1:${app!.port}/ws`);
    expect(hello).toMatchObject({ type: 'hello', waiting: true });
    expect(hello).not.toHaveProperty('campaign');
  });

  it('New campaign makes a folder from the name and opens it; the home lists it', async () => {
    const made = await call('POST', '/api/gm/campaigns', { name: 'The Tutorial' });
    expect(made.body).toMatchObject({ id: 'the-tutorial', name: 'The Tutorial' });
    expect((await call('GET', '/api/gm/campaign')).body).toMatchObject({ id: 'the-tutorial' });
    const again = await call('POST', '/api/gm/campaigns', { name: 'The Tutorial' });
    expect(again.body).toMatchObject({ id: 'the-tutorial-2' });
    expect((await call('POST', '/api/gm/campaigns', { name: '  ' })).status).toBe(400);
    const home = (await call('GET', '/api/gm/campaigns')).body;
    expect(home['active']).toBe('the-tutorial-2');
    expect((home['home'] as { id: string }[]).map((r) => r.id)).toEqual([
      'old-test',
      'the-tutorial',
      'the-tutorial-2',
    ]);
    const row = (home['home'] as { id: string; lastOpened: string | null }[]).find(
      (r) => r.id === 'the-tutorial',
    );
    expect(row?.lastOpened).not.toBeNull();
  });

  it('a phone waiting on the home is dropped when a campaign opens, and rejoins it', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${app!.port}/ws`);
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener('close', (e) => resolve(e.code)),
    );
    await new Promise((resolve) => socket.addEventListener('message', resolve, { once: true }));
    await call('POST', '/api/gm/campaign', { id: 'old-test' });
    expect(await closed).toBe(1012);
    const hello = await firstMessage(`ws://127.0.0.1:${app!.port}/ws`);
    expect(hello).toMatchObject({ type: 'hello', campaign: 'old-test' });
    expect(hello).not.toHaveProperty('waiting');
  });
});

describe('campaign ids and the home summary (ML.1)', () => {
  it('names a folder after the campaign, unique and never a reserved name', () => {
    expect(campaignIdFor('The Tutorial!', [])).toBe('the-tutorial');
    expect(campaignIdFor('The Tutorial', ['the-tutorial', 'the-tutorial-2'])).toBe(
      'the-tutorial-3',
    );
    expect(campaignIdFor('Zoë’s game', [])).toBe('zoe-s-game');
    expect(campaignIdFor('???', [])).toBe('campaign');
    expect(campaignIdFor('demo', [])).toBe('demo-campaign');
    expect(campaignIdFor('CON', [])).toBe('con-campaign');
    expect(campaignIdFor('x'.repeat(300), [])).toHaveLength(56);
  });

  it('keeps the name, characters and last opened time beside the log', () => {
    const store = CampaignStore.open('alpha', options());
    store.writeHome(options().now());
    const result = execute(
      store.campaign,
      {
        type: 'campaign.create',
        name: 'Alpha run',
        rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
      },
      { actor: { role: 'gm' }, sessionId: 's1', now: options().now, newId: () => 'e1' },
    );
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
    store.close();
    expect(CampaignStore.summaries(dataDir)).toEqual([
      {
        id: 'alpha',
        name: 'Alpha run',
        characters: [],
        lastOpened: '2026-11-01T00:00:00.000Z',
      },
    ]);
  });
});

/** The first message a WebSocket at `url` receives (then closes it). */
async function firstMessage(url: string): Promise<unknown> {
  const socket = new WebSocket(url);
  try {
    return await new Promise((resolve, reject) => {
      socket.addEventListener('message', (e) => resolve(JSON.parse(String(e.data))), {
        once: true,
      });
      socket.addEventListener('error', reject, { once: true });
    });
  } finally {
    socket.close();
  }
}
