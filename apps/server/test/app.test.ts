// startApp (MS.5): shared by the terminal entry and the desktop wrapper.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { startApp } from '../src/app';
import { CampaignStore } from '../src/store';

describe('startApp', () => {
  let webRoot: string;
  let dataDir: string;

  beforeAll(() => {
    webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-app-web-'));
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-app-data-'));
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  });

  afterAll(() => {
    rmSync(webRoot, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('listens, uses the given key, and closes idempotently releasing the campaign', async () => {
    const app = await startApp({
      port: 0,
      host: '127.0.0.1',
      webRoot,
      dataDir,
      gmKey: 'k'.repeat(32),
    });
    try {
      expect(app.gmKey).toBe('k'.repeat(32));
      expect(app.generatedKey).toBe(false);
      const res = await fetch(`http://127.0.0.1:${app.port}/health`);
      expect(res.status).toBe(200);
      expect(app.join().url).toContain(`:${app.port}`);
    } finally {
      await Promise.all([app.close(), app.close()]);
    }
    // The campaign lock was released: it opens again.
    CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' }).close();
  });

  it('generates a key when none is given', async () => {
    const app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir });
    try {
      expect(app.generatedKey).toBe(true);
      expect(app.gmKey.length).toBeGreaterThanOrEqual(32);
    } finally {
      await app.close();
    }
  });

  it('rethrows a busy port and releases the campaign lock', async () => {
    const first = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir });
    const otherData = mkdtempSync(path.join(tmpdir(), 'the-system-app-data2-'));
    try {
      await expect(
        startApp({ port: first.port, host: '127.0.0.1', webRoot, dataDir: otherData }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' });
      CampaignStore.open('main', {
        dataDir: otherData,
        now: () => '2026-10-21T00:00:00.000Z',
      }).close();
    } finally {
      await first.close();
      rmSync(otherData, { recursive: true, force: true });
    }
  });

  it('fails cleanly when the web build is missing and releases the lock', async () => {
    await expect(
      startApp({ port: 0, host: '127.0.0.1', webRoot: path.join(webRoot, 'nope'), dataDir }),
    ).rejects.toThrow(/Web build not found/);
    CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' }).close();
  });

  it('reports the server OS in the join info (M10.1 firewall help)', async () => {
    const app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, platform: 'win32' });
    try {
      const res = await fetch(`http://127.0.0.1:${app.port}/api/join`, {
        headers: { 'x-gm-key': app.gmKey },
      });
      expect(((await res.json()) as { platform?: string }).platform).toBe('win32');
    } finally {
      await app.close();
    }
  });
});

// M10.1: the desktop app backs the real campaign up when it quits.
describe('startApp backupOnClose', () => {
  let webRoot: string;
  let dataDir: string;
  const backupsDir = () => path.join(dataDir, 'campaigns', 'main', 'backups');
  const backups = () =>
    existsSync(backupsDir()) ? readdirSync(backupsDir()).filter((n) => !n.startsWith('.')) : [];

  beforeAll(() => {
    webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-app-web-'));
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  });
  afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

  const fresh = () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-app-backup-'));
  };
  /** Puts a created campaign in the data dir, as an earlier session would. */
  const seed = () => {
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-24T00:00:00.000Z' });
    const result = execute(
      store.campaign,
      { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      {
        actor: { role: 'gm' },
        sessionId: 's1',
        now: () => '2026-10-24T00:00:00.000Z',
        newId: () => 'e1',
      },
    );
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
    store.close();
  };

  it('copies the log to a "-quit" backup on close, once, and still releases the lock', async () => {
    fresh();
    try {
      seed();
      const app = await startApp({
        port: 0,
        host: '127.0.0.1',
        webRoot,
        dataDir,
        backupOnClose: 'quit',
      });
      await Promise.all([app.close(), app.close()]);
      const made = backups();
      expect(made).toHaveLength(1);
      expect(made[0]).toMatch(/-quit$/);
      const copy = readFileSync(path.join(backupsDir(), made[0] ?? '', 'events.jsonl'), 'utf8');
      const live = readFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), 'utf8');
      expect(copy).toBe(live);
      expect(copy).toContain('Whale');
      CampaignStore.open('main', { dataDir, now: () => '2026-10-24T00:00:00.000Z' }).close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('makes no backup of an empty campaign, nor when the option is off', async () => {
    fresh();
    try {
      const empty = await startApp({
        port: 0,
        host: '127.0.0.1',
        webRoot,
        dataDir,
        backupOnClose: 'quit',
      });
      await empty.close();
      expect(backups()).toEqual([]);
      seed();
      const off = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir });
      await off.close();
      expect(backups()).toEqual([]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('a backup that fails (bad label) never stops the campaign closing', async () => {
    fresh();
    try {
      seed();
      const app = await startApp({
        port: 0,
        host: '127.0.0.1',
        webRoot,
        dataDir,
        backupOnClose: 'Bad Label!',
      });
      await expect(app.close()).resolves.toBeUndefined();
      expect(backups()).toEqual([]);
      CampaignStore.open('main', { dataDir, now: () => '2026-10-24T00:00:00.000Z' }).close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
