// MC.2: co-DM generation on demand, against the recorded-fixture fake (no
// network). Each kind comes back as a content file in the import preview;
// replies that break the rules are refused by the same checks as an import;
// nothing applies to the campaign until the GM approves.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute, itemCappedStats, itemEffectiveStats } from '@the-system/engine';
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

  const SECTIONS: Record<(typeof GENERATE_KINDS)[number], readonly string[]> = {
    shop: ['item.define', 'note.create'],
    npc: ['entity.define', 'note.create'],
    place: ['region.define'],
    encounter: ['entity.define', 'note.create'],
    item: ['item.define'],
    questHook: ['note.create', 'quest.create'],
  };

  it.each(GENERATE_KINDS)('previews a generated %s and applies nothing', async (kind) => {
    const before = store.campaign.events.length;
    const res = await generate({ kind, prompt: 'the party wants something here' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      file: { format: string };
      preview: {
        ok: boolean;
        entries: { error: string | null; command: { type: string } }[];
        errors: unknown[];
      };
      status: { spend: { calls: number } };
    };
    expect(body.file.format).toBe('the-system/content');
    expect([...new Set(body.preview.entries.map((e) => e.command.type))].sort()).toEqual(
      SECTIONS[kind],
    );
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

  it('a flat bonus above the 20% item cap imports, and the cap cuts it when worn', async () => {
    const res = await generate({ kind: 'item', prompt: 'huge bonus please' });
    const preview = (
      res.json() as {
        preview: {
          ok: true;
          entries: { error: string | null; command: Record<string, unknown> }[];
        };
      }
    ).preview;
    expect(preview.ok).toBe(true);
    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-26T04:00:00.000Z',
      newId: () => `cap${++n}`,
    };
    let campaign = store.campaign;
    const define = preview.entries[0]?.command;
    if (!define) throw new Error('no entry');
    const defined = execute(campaign, define as never, ctx);
    if (!defined.ok) throw new Error(defined.error);
    campaign = defined.campaign;
    const itemId = Object.values(campaign.state?.items ?? {}).find(
      (i) => i.name === 'Heart of the Host',
    )?.id;
    if (!itemId) throw new Error('not defined');
    for (const command of [
      { type: 'holdings.adjust', characterId: 'jake', items: { [itemId]: 1 } },
      { type: 'item.equip', characterId: 'jake', itemId, slot: 'necklace' },
    ]) {
      const r = execute(campaign, command as never, ctx);
      if (!r.ok) throw new Error(r.error);
      campaign = r.campaign;
    }
    const state = campaign.state;
    const jake = state?.characters['jake'];
    if (!state || !jake) throw new Error('no state');
    const holdings = state.holdings['jake'];
    if (!holdings) throw new Error('no holdings');
    // Base Vitality 10: +50 is capped at +2 (20% of base).
    expect(itemEffectiveStats(state.rules, jake.stats, holdings, state.items)['vitality']).toBe(12);
    expect(itemCappedStats(state.rules, jake.stats, holdings, state.items)).toEqual(['vitality']);
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

describe('co-DM generate limits', () => {
  let root: string;
  const now = () => '2026-10-26T04:00:00.000Z';

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-gen-limits-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const makeCoDm = (dir: string) => {
    const coDm = new CoDm({
      dir: path.join(root, dir),
      cipher,
      makeClient: () => new FixtureAiClient(GENERATE_FIXTURES),
    });
    coDm.keys.save(API_KEY);
    return coDm;
  };
  const post = (app: FastifyInstance, payload: object) =>
    app.inject({
      method: 'POST',
      url: '/api/gm/ai/generate',
      headers: { 'x-gm-key': GM },
      payload,
    });

  it('says when no campaign is open', async () => {
    const store = CampaignStore.open('empty', { dataDir: path.join(root, 'empty'), now });
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now, newId: () => 'x' },
      coDm: makeCoDm('a'),
    });
    try {
      const res = await post(app, { kind: 'shop', prompt: '' });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error: string }).error).toBe('No campaign open');
    } finally {
      await app.close();
      store.close();
    }
  });

  it('says when the server has no co-DM', async () => {
    const store = CampaignStore.open('none', { dataDir: path.join(root, 'none'), now });
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now, newId: () => 'x' },
    });
    try {
      const res = await post(app, { kind: 'shop', prompt: '' });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { error: string }).error).toContain('not available');
      expect((await app.inject({ method: 'POST', url: '/api/gm/ai/generate' })).statusCode).toBe(
        403,
      );
    } finally {
      await app.close();
      store.close();
    }
  });

  it('a generation slower than the time limit is stopped with a clear message', async () => {
    const store = CampaignStore.open('slow', { dataDir: path.join(root, 'slow'), now });
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `s${++n}` };
    const r = execute(
      store.campaign,
      { type: 'campaign.create', name: 'Slow', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now, newId: ctx.newId },
      coDm: makeCoDm('b'),
      generateTimeoutMs: 50,
    });
    try {
      const started = Date.now();
      const res = await post(app, { kind: 'place', prompt: 'slow please' });
      expect(res.statusCode).toBe(502);
      expect((res.json() as { error: string }).error).toContain('took longer than');
      expect(Date.now() - started).toBeLessThan(3_000);
    } finally {
      await app.close();
      store.close();
    }
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
