// QF.44: Back up now, Download campaign and Restore from the GM console.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command } from '@the-system/engine';
import { startApp, type RunningApp } from '../src/app';
import { savePortrait } from '../src/portraits';
import { CampaignStore, backupAsExport, listBackups, restoredId } from '../src/store';

const KEY = 'r'.repeat(32);
const png = (seed: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`portrait-${seed}`),
  ]);

describe('QF.44 backups and restore', () => {
  let webRoot: string;
  let dataDir: string;
  let app: RunningApp | null = null;
  let portrait = '';

  const seed = () => {
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-31T00:00:00.000Z' });
    let n = 0;
    const run = (command: Command) => {
      const result = execute(store.campaign, command, {
        actor: { role: 'gm' },
        sessionId: null,
        now: () => '2026-10-31T00:00:00.000Z',
        newId: () => `seed-${++n}`,
      });
      if (!result.ok) throw new Error(result.error);
      store.appendAll(result.events);
    };
    run({
      type: 'campaign.create',
      name: 'Whale',
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    });
    portrait = savePortrait(store.dir, png(1));
    const kit = [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: "Archer's Eye", rarity: 'common' },
    ];
    run({
      type: 'character.create',
      name: 'Jake',
      className: 'Archer',
      classSkills: kit,
      portrait,
    });
    run({ type: 'character.create', name: 'Kim', className: 'Archer', classSkills: kit });
    mkdirSync(path.join(store.dir, 'codm'), { recursive: true });
    writeFileSync(path.join(store.dir, 'codm', 'notes-01.json'), '{"notes":[]}');
    store.close();
  };

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
    webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-restore-web-'));
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-restore-data-'));
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    seed();
    app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, gmKey: KEY });
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    rmSync(webRoot, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('Back up now makes a listed backup with the events and portraits', async () => {
    const made = await call('POST', '/api/gm/backup');
    expect(made.status).toBe(200);
    expect(made.body.name).toMatch(/-manual$/);
    const list = await call('GET', '/api/gm/backups');
    expect(list.body).toEqual({
      campaign: 'main',
      backups: [{ name: made.body.name, events: 3, portraits: 1 }],
    });
  });

  it('restores a backup as a new campaign beside the current one, with its co-DM files', async () => {
    const made = await call('POST', '/api/gm/backup');
    const restored = await call('POST', '/api/gm/restore', { backup: made.body.name });
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual({ id: 'main-restored', events: 3, portraits: 1 });
    expect(CampaignStore.list(dataDir)).toEqual(['main', 'main-restored']);
    const dir = path.join(CampaignStore.campaignsDir(dataDir), 'main-restored');
    expect(readdirSync(path.join(dir, 'portraits'))).toEqual([portrait]);
    expect(existsSync(path.join(dir, 'codm', 'notes-01.json'))).toBe(true);
    // A second restore never overwrites the first.
    const again = await call('POST', '/api/gm/restore', { backup: made.body.name });
    expect(again.body.id).toBe('main-restored-2');
    // The current campaign is untouched and still open.
    expect((await call('GET', '/api/gm/campaign')).body).toEqual({
      id: 'main',
      demo: false,
      main: true,
    });
  });

  it('restores a downloaded export and switches to it; the main campaign is one click back', async () => {
    const exported = await call('GET', '/api/gm/export');
    expect(exported.status).toBe(200);
    expect(Object.keys(exported.body.portraits as object)).toEqual([portrait]);
    const restored = await call('POST', '/api/gm/restore', { export: exported.body });
    expect(restored.body).toEqual({ id: 'main-restored', events: 3, portraits: 1 });
    const listed = await call('GET', '/api/gm/campaigns');
    expect(listed.body).toEqual({
      active: 'main',
      main: 'main',
      campaigns: ['main', 'main-restored'],
    });
    const opened = await call('POST', '/api/gm/campaign', { id: 'main-restored' });
    expect(opened.body).toEqual({ id: 'main-restored', demo: false, main: false });
    const chars = (await (await fetch(`http://127.0.0.1:${app!.port}/api/characters`)).json()) as {
      name: string;
      portrait: string | null;
    }[];
    expect(chars.map((c) => c.name)).toEqual(['Jake', 'Kim']);
    expect(chars[0]!.portrait).toContain(portrait);
    const back = await call('POST', '/api/gm/campaign', { demo: false });
    expect(back.body).toEqual({ id: 'main', demo: false, main: true });
  });

  it('refuses a bad file, an unknown backup and an unknown campaign, changing nothing', async () => {
    const bad = await call('POST', '/api/gm/restore', { export: { format: 'nope' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe('Nothing was restored: Not a campaign export.');
    const missing = await call('POST', '/api/gm/restore', { backup: '2026-10-31T00-00-00-000Z-x' });
    expect(missing.status).toBe(422);
    const traversal = await call('POST', '/api/gm/restore', { backup: '../../main' });
    expect(traversal.status).toBe(422);
    expect(JSON.stringify(traversal.body)).not.toContain(dataDir);
    const empty = await call('POST', '/api/gm/restore', {});
    expect(empty.status).toBe(400);
    const unknown = await call('POST', '/api/gm/campaign', { id: 'nope' });
    expect(unknown.status).toBe(404);
    expect(CampaignStore.list(dataDir)).toEqual(['main']);
  });

  it('needs the GM key', async () => {
    for (const [method, url] of [
      ['POST', '/api/gm/backup'],
      ['GET', '/api/gm/backups'],
      ['POST', '/api/gm/restore'],
      ['GET', '/api/gm/campaigns'],
    ] as const) {
      const res = await fetch(`http://127.0.0.1:${app!.port}${url}`, { method });
      expect(res.status, url).toBe(403);
    }
  });
});

describe('restoredId and listBackups', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-restore-ids-'));
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it('never reuses a folder and strips an earlier restored suffix', () => {
    const root = CampaignStore.campaignsDir(dataDir);
    mkdirSync(path.join(root, 'main-restored'), { recursive: true });
    expect(restoredId(dataDir, 'main')).toBe('main-restored-2');
    expect(restoredId(dataDir, 'main-restored')).toBe('main-restored-2');
    expect(restoredId(dataDir, 'Big Whale!')).toBe('big-whale-restored');
    expect(restoredId(dataDir, '???')).toBe('campaign-restored');
  });

  it('lists backups newest first and refuses a damaged one by line', () => {
    const backups = path.join(CampaignStore.campaignsDir(dataDir), 'main', 'backups');
    for (const name of ['2026-10-30T10-00-00-000Z-quit', '2026-10-31T10-00-00-000Z-manual']) {
      mkdirSync(path.join(backups, name), { recursive: true });
      writeFileSync(path.join(backups, name, 'events.jsonl'), '{"a":1}\n{"b":2}\n');
    }
    mkdirSync(path.join(backups, '.tmp-2026-10-31T11-00-00-000Z-manual'));
    expect(listBackups(dataDir, 'main').map((b) => b.name)).toEqual([
      '2026-10-31T10-00-00-000Z-manual',
      '2026-10-30T10-00-00-000Z-quit',
    ]);
    writeFileSync(
      path.join(backups, '2026-10-30T10-00-00-000Z-quit', 'events.jsonl'),
      '{"a":1}\n{broken\n',
    );
    expect(() => backupAsExport(dataDir, 'main', '2026-10-30T10-00-00-000Z-quit')).toThrow(
      'is damaged at line 2',
    );
  });
});
