// MC.1 review M5: the co-DM's API key never reaches a player. A real listener
// on a random port with request logging on: the GM saves the key, tests the
// connection and changes models while a player is connected; no player frame,
// no public HTTP body and no log line carries the key. The AI client is the
// fixture fake; nothing here touches the network.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import type { SecretCipher } from '../src/ai/keyStore';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const API_KEY = 'sk-ant-api03-CANARY' + 'Qq7Ww6Ee'.repeat(4);
const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x5a)),
  decrypt: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString(),
};

/** A WebSocket client that keeps every frame it receives. */
function socket(url: string) {
  const ws = new WebSocket(url);
  const frames: string[] = [];
  const waitFor = (test: (m: Record<string, unknown>) => boolean, ms = 3000) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const check = () => {
        const hit = frames.map((f) => JSON.parse(f) as Record<string, unknown>).find(test);
        if (hit) {
          clearInterval(poll);
          clearTimeout(timer);
          resolve(hit);
        }
      };
      const poll = setInterval(check, 10);
      const timer = setTimeout(() => {
        clearInterval(poll);
        reject(new Error('timed out waiting for a frame'));
      }, ms);
      check();
    });
  ws.addEventListener('message', (e) => frames.push(String(e.data)));
  let n = 0;
  return {
    frames,
    waitFor,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    command: async (command: Record<string, unknown>) => {
      const requestId = `c${++n}`;
      ws.send(JSON.stringify({ type: 'command', requestId, command }));
      return waitFor((m) => m.type === 'result' && m.requestId === requestId);
    },
    close: () => ws.close(),
  };
}

describe('co-DM key canary (players and logs)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let base: string;
  const log: string[] = [];
  const gmKey = newGmKey();
  let ids = 0;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-codm-canary-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => new Date(Date.UTC(2026, 9, 26, 3) + 1000 * ids).toISOString();
    store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher,
      makeClient: () =>
        new FixtureAiClient([
          { match: 'Connection test', text: 'ready', usage: { inputTokens: 9, outputTokens: 1 } },
        ]),
    });
    app = await createServer({
      webRoot: root,
      logger: { stream: { write: (line) => void log.push(line) } },
      live: { store, gmKey, now, newId: () => `ev${++ids}` },
      coDm,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('no player frame, public body or log line carries the key', async () => {
    const gm = socket(`ws://${base}/ws`);
    await gm.waitFor((m) => m.type === 'hello');
    gm.send({ type: 'join', role: 'gm', gmKey });
    await gm.waitFor((m) => m.type === 'joined');
    const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown;
    expect((await gm.command({ type: 'campaign.create', name: 'C', rules })).ok).toBe(true);
    const created = await gm.command({
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'A', rarity: 'inferior' },
        { name: 'B', rarity: 'inferior' },
        { name: 'C', rarity: 'common' },
      ],
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);

    const player = socket(`ws://${base}/ws`);
    await player.waitFor((m) => m.type === 'hello');
    player.send({ type: 'join', role: 'player', characterId: 'jake' });
    await player.waitFor((m) => m.type === 'view');

    const gmHttp = (method: string, url: string, body?: unknown) =>
      fetch(`http://${base}${url}`, {
        method,
        headers: {
          'x-gm-key': gmKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    expect((await gmHttp('PUT', '/api/gm/ai/key', { key: API_KEY })).status).toBe(200);
    // A malformed body holding the key: refused, and its text is not logged.
    const broken = await fetch(`http://${base}/api/gm/ai/key`, {
      method: 'PUT',
      headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
      body: `{"key":"${API_KEY}`,
    });
    expect(broken.status).toBe(400);
    expect(await (await gmHttp('POST', '/api/gm/ai/test')).json()).toMatchObject({ ok: true });
    expect(
      (await gmHttp('PUT', '/api/gm/ai/models', { fast: 'claude-haiku-4-5', strong: 'x-1' }))
        .status,
    ).toBe(200);
    // Something the player does see changes after the key is saved.
    const award = await gm.command({
      type: 'xp.award',
      track: 'class',
      amount: 50,
      participants: [{ characterId: 'jake' }],
      reason: 'a fight',
    });
    expect(award.ok, JSON.stringify(award)).toBe(true);

    const publicBodies = [
      await (await fetch(`http://${base}/api/characters`)).text(),
      await (await fetch(`http://${base}/api/gm/ai`)).text(), // no GM key: refused
    ];
    await new Promise((r) => setTimeout(r, 100));
    player.close();
    gm.close();

    // The test saw real traffic, so a pass is not an empty check.
    expect(player.frames.length).toBeGreaterThan(1);
    expect(log.some((l) => l.includes('/api/gm/ai/key'))).toBe(true);
    for (const text of [...player.frames, ...publicBodies, ...log]) {
      expect(text).not.toContain('sk-ant');
      expect(text).not.toContain('CANARY');
    }
  });
});
