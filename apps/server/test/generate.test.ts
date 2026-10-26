// MC.2: co-DM generation on demand, against the recorded-fixture fake (no
// network). Each kind comes back as a content file in the import preview;
// replies that break the rules are refused by the same checks as an import;
// nothing applies to the campaign until the GM approves.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { GENERATE_FIXTURES } from '../src/ai/fixtures/generate';
import {
  GENERATE_KINDS,
  buildGenerateRequest,
  campaignContext,
  extractJson,
} from '../src/ai/generate';
import type { SecretCipher } from '../src/ai/keyStore';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const GM = 'g'.repeat(32);
const API_KEY = 'sk-ant-api03-' + 'Gg7Hh6Jj'.repeat(4);
const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x55)),
  decrypt: (b) => Buffer.from(b.map((x) => x ^ 0x55)).toString(),
};

describe('co-DM generate on demand', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let coDm: CoDm;
  let fake: FixtureAiClient;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-gen-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => '2026-10-26T04:00:00.000Z';
    store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    for (const command of [
      { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: [
          { name: 'A', rarity: 'inferior' },
          { name: 'B', rarity: 'inferior' },
          { name: 'C', rarity: 'common' },
        ],
      },
    ]) {
      const r = execute(store.campaign, command as never, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher,
      makeClient: (key) => {
        fake = new FixtureAiClient(GENERATE_FIXTURES);
        return {
          complete: (request) =>
            key() === null ? Promise.reject(new Error('no key')) : fake.complete(request),
        };
      },
    });
    coDm.keys.save(API_KEY);
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

  const generate = (payload: unknown, gmKey: string | null = GM) =>
    app.inject({
      method: 'POST',
      url: '/api/gm/ai/generate',
      headers: gmKey === null ? {} : { 'x-gm-key': gmKey },
      payload: payload as object,
    });

  it('is GM-only', async () => {
    expect((await generate({ kind: 'shop', prompt: 'x' }, null)).statusCode).toBe(403);
  });

  it.each(GENERATE_KINDS)('previews a generated %s and applies nothing', async (kind) => {
    const before = store.campaign.events.length;
    const res = await generate({ kind, prompt: 'the party wants something here' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      file: { format: string };
      preview: { ok: boolean; entries: { error: string | null }[]; errors: unknown[] };
      status: { spend: { calls: number } };
    };
    expect(body.file.format).toBe('the-system/content');
    expect(body.preview.ok).toBe(true);
    expect(body.preview.entries.length).toBeGreaterThan(0);
    expect(body.preview.entries.every((e) => e.error === null)).toBe(true);
    expect(body.preview.errors).toEqual([]);
    expect(store.campaign.events.length).toBe(before);
    expect(res.body).not.toContain(API_KEY);
    const last = fake.requests.at(-1);
    expect(last?.role).toBe('strong');
    expect(last?.messages[0]?.content).toContain('Jake');
  });

  it('a percentage item bonus is refused with its path', async () => {
    const res = await generate({ kind: 'item', prompt: 'percent bonus please' });
    const preview = (res.json() as { preview: { ok: boolean; errors: { path: string }[] } })
      .preview;
    expect(preview.ok).toBe(false);
    expect(preview.errors.every((e) => e.path.startsWith('items[0].bonuses[0]'))).toBe(true);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it('a rarity the rules refuse is reported on its entry', async () => {
    const res = await generate({ kind: 'item', prompt: 'divine relic please' });
    const preview = (
      res.json() as {
        preview: { ok: boolean; entries?: { error: string | null }[]; errors: unknown[] };
      }
    ).preview;
    const refused =
      !preview.ok || (preview.entries ?? []).some((e) => e.error !== null) || preview.errors.length;
    expect(refused).toBeTruthy();
  });

  it('a reply with no JSON says so, and the call still counts', async () => {
    const calls = coDm.status().spend.calls;
    const res = await generate({ kind: 'npc', prompt: 'say hello' });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { error: string }).error).toContain('no JSON object');
    expect(coDm.status().spend.calls).toBe(calls + 1);
  });

  it('refuses a bad request body and a missing key', async () => {
    expect((await generate({ kind: 'dragon', prompt: '' })).statusCode).toBe(400);
    expect((await generate({ kind: 'shop', prompt: 'x'.repeat(2001) })).statusCode).toBe(400);
    coDm.keys.remove();
    const res = await generate({ kind: 'shop', prompt: '' });
    expect(res.statusCode).toBe(502);
    coDm.keys.save(API_KEY);
  });
});

describe('generate request and reply helpers', () => {
  it('extracts the outermost JSON object, fenced or not', () => {
    expect(extractJson('```json\n{"a":{"b":1}}\n```')).toEqual({ a: { b: 1 } });
    expect(() => extractJson('no braces')).toThrow('no JSON object');
    expect(() => extractJson('{ broken')).toThrow();
    expect(() => extractJson('{"a": }')).toThrow('broken JSON');
  });

  it('asks the strong model with the schema and a bounded context', () => {
    const now = () => '2026-10-26T04:00:00.000Z';
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    const r = execute(
      { events: [], state: null } as never,
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const state = r.campaign.state;
    if (!state) throw new Error('no state');
    const req = buildGenerateRequest('shop', 'an herbalist', state);
    expect(req.role).toBe('strong');
    expect(req.system).toContain('"the-system/content"');
    expect(req.system).toContain('"$schema"');
    expect(req.messages[0]?.content).toContain('an herbalist');
    expect(campaignContext(state)).toContain('Currency: Credits.');
  });
});
