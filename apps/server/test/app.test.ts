// startApp (MS.5): shared by the terminal entry and the desktop wrapper.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
