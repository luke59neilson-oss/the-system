// MC.1: the GM-only co-DM settings routes. The key goes in and never comes
// back out: not in any reply body, not without the GM key. The AI client is
// the fixture fake; nothing here touches the network.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import type { SecretCipher } from '../src/ai/keyStore';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const GM = 'g'.repeat(32);
const API_KEY = 'sk-ant-api03-' + 'Zz9Yy8Xx'.repeat(4);
const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x33)),
  decrypt: (b) => Buffer.from(b.map((x) => x ^ 0x33)).toString(),
};

describe('co-DM settings routes', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  const bodies: string[] = [];

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-codm-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => '2026-10-26T02:00:00.000Z';
    store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    const r = execute(
      store.campaign,
      { type: 'campaign.create', name: 'C', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher,
      makeClient: (key) => {
        fake = new FixtureAiClient([
          { match: 'Connection test', text: 'ready', usage: { inputTokens: 20, outputTokens: 1 } },
        ]);
        // The fake answers only when a key is set, like the live client.
        return {
          complete: (request) =>
            key() === null ? Promise.reject(new Error('no key')) : fake.complete(request),
        };
      },
    });
    app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now, newId: ctx.newId },
      coDm,
    });
  });

  afterAll(async () => {
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  const gm = async (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { 'x-gm-key': GM },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    bodies.push(res.body);
    return res;
  };

  it('needs the GM key for every co-DM route', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai'],
      ['PUT', '/api/gm/ai/key'],
      ['DELETE', '/api/gm/ai/key'],
      ['PUT', '/api/gm/ai/models'],
      ['POST', '/api/gm/ai/test'],
    ] as const) {
      const res = await app.inject({ method, url, ...(method === 'GET' ? {} : { payload: {} }) });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('starts with no key and the default models', async () => {
    const res = await gm('GET', '/api/gm/ai');
    expect(res.json()).toEqual({
      hasKey: false,
      canSave: true,
      models: { fast: 'claude-haiku-4-5', strong: 'claude-sonnet-4-5' },
      spend: { calls: 0, inputTokens: 0, outputTokens: 0, dollars: 0 },
    });
  });

  it('refuses a value that is not a key, saves a real one and never returns it', async () => {
    expect((await gm('PUT', '/api/gm/ai/key', { key: 'hello' })).statusCode).toBe(400);
    const saved = await gm('PUT', '/api/gm/ai/key', { key: API_KEY });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ hasKey: true });
  });

  it('tests the connection on the fast model and counts the spend', async () => {
    const res = await gm('POST', '/api/gm/ai/test');
    expect(res.json()).toMatchObject({
      ok: true,
      model: 'claude-haiku-4-5',
      status: { spend: { calls: 1, inputTokens: 20, outputTokens: 1 } },
    });
    expect(fake.requests[0]?.role).toBe('fast');
  });

  it('sets the models and checks their ids', async () => {
    const bad = await gm('PUT', '/api/gm/ai/models', { fast: 'x y', strong: 'claude-sonnet-4-5' });
    expect(bad.statusCode).toBe(400);
    const ok = await gm('PUT', '/api/gm/ai/models', {
      fast: 'claude-haiku-4-5',
      strong: 'claude-opus-4-1',
    });
    expect(ok.json()).toMatchObject({ models: { strong: 'claude-opus-4-1' } });
    expect((await gm('GET', '/api/gm/ai')).json()).toMatchObject({
      models: { strong: 'claude-opus-4-1' },
    });
  });

  it('removes the key; the test then reports a failure', async () => {
    expect((await gm('DELETE', '/api/gm/ai/key')).json()).toMatchObject({ hasKey: false });
    expect((await gm('POST', '/api/gm/ai/test')).json()).toMatchObject({ ok: false });
  });

  it('a malformed body never echoes its text', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/key',
      headers: { 'x-gm-key': GM, 'content-type': 'application/json' },
      payload: `{"key":"${API_KEY}`,
    });
    bodies.push(res.body);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('sk-ant');
  });

  it('no reply body ever carried the key', () => {
    expect(bodies.length).toBeGreaterThan(5);
    for (const body of bodies) expect(body).not.toContain(API_KEY);
  });
});
